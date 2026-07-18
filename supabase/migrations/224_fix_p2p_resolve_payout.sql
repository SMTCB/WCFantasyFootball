-- ⚠️ NOT APPLIED TO PRODUCTION — code-only on v2, awaiting explicit approval (see TRACKER.md)
-- Migration 224: fix resolve_p2p_challenge() coin-movement bug (migration 205)
--
-- migration 205's resolve_p2p_challenge had two live bugs in the same function,
-- both stemming from the same mistake: release_escrow() already fully returns a
-- user's own stake to their own balance AND logs its own 'refund' transaction
-- internally (see migration 202) — it does not need a second credit on top.
--
--   1. TIE path (currently live, silently wrong): after release_escrow() already
--      refunded both stakes, the tie branch called credit_coins(..., 'refund', ...)
--      AGAIN for both players — a full second mint of one stake's worth of coins
--      to each player on every tied challenge.
--
--   2. NON-TIE path (currently live, permanently broken): the loser's audit entry
--      was logged via credit_coins(v_loser_id, 0, 'loss', ...) — a zero amount.
--      credit_coins() hard-guards `IF p_amount <= 0 THEN RAISE EXCEPTION
--      'AMOUNT_MUST_BE_POSITIVE'`, so this call always throws. Because it runs
--      inside auto_resolve_p2p_challenges()'s BEGIN...EXCEPTION WHEN OTHERS block,
--      the exception rolls back everything since that savepoint — both escrow
--      releases and the winner's prize credit — so every non-tie challenge
--      silently fails to resolve. It stays 'accepted' forever with both stakes
--      permanently locked in escrow; the cron just logs a swallowed warning
--      every 5 minutes.
--
-- Fix — coin movement is now composed the same way for every outcome:
--   - Each user's OWN stake is unlocked back to their OWN balance via
--     release_escrow() exactly once (which already logs the 'refund' txn) —
--     never followed by a redundant credit_coins('refund', ...) call.
--   - On a tie: that's it. Both players end up back where they started, no
--     rake burned — matches the documented design intent, now actually true.
--   - On a win/loss: the winner's own stake is released as above, then the
--     NET winnings (loser's stake minus the 5% rake) are credited on top via
--     credit_coins(..., 'win', ...) — total winner payout is still
--     stake*2 - floor(stake*2*0.05), matching the original doc comment, but
--     now actually funded by the loser rather than freshly minted. The
--     loser's escrowed stake is decremented directly (never routed back to
--     their balance) and logged with a direct INSERT into coin_transactions
--     (type='loss', a positive magnitude for audit purposes, consistent with
--     how debit_coins_to_escrow logs 'stake' amounts as positive magnitudes)
--     — NOT via credit_coins, which cannot accept a non-positive amount.

CREATE OR REPLACE FUNCTION resolve_p2p_challenge(p_challenge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ch              p2p_challenges;
  v_challenger_pts  numeric;
  v_opponent_pts    numeric;
  v_winner_id       uuid;
  v_is_tie          boolean := false;
  v_total_pot       int;
  v_rake            int;
  v_prize           int;
  v_loser_id        uuid;
  v_challenger_name text;
  v_opponent_name   text;
  v_loser_escrow    int;
BEGIN
  -- Service role / cron check — authenticated users cannot call this
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.status <> 'accepted' THEN
    RAISE EXCEPTION 'CHALLENGE_NOT_ACCEPTED (status=%)', v_ch.status;
  END IF;

  -- Guard: only resolve when the matchday is settled (gazette activity entry exists for this league+round)
  IF NOT EXISTS (
    SELECT 1 FROM gazette_entries
    WHERE league_id   = v_ch.league_id
      AND entry_type  = 'activity'
      AND full_data->>'matchday_id' = v_ch.matchday_id
  ) THEN
    RAISE EXCEPTION 'MATCHDAY_NOT_SETTLED';
  END IF;

  -- Get pts for both managers (latest squad in this league for each user)
  SELECT fp.total INTO v_challenger_pts
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE fp.matchday_id = v_ch.matchday_id
    AND s.league_id    = v_ch.league_id
    AND s.user_id      = v_ch.challenger_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT fp.total INTO v_opponent_pts
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE fp.matchday_id = v_ch.matchday_id
    AND s.league_id    = v_ch.league_id
    AND s.user_id      = v_ch.opponent_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Default missing pts to 0 (no squad / no score yet)
  v_challenger_pts := COALESCE(v_challenger_pts, 0);
  v_opponent_pts   := COALESCE(v_opponent_pts, 0);

  -- Determine outcome
  IF v_challenger_pts > v_opponent_pts THEN
    v_winner_id := v_ch.challenger_id;
    v_loser_id  := v_ch.opponent_id;
  ELSIF v_opponent_pts > v_challenger_pts THEN
    v_winner_id := v_ch.opponent_id;
    v_loser_id  := v_ch.challenger_id;
  ELSE
    v_is_tie := true;
  END IF;

  -- Coin math
  v_total_pot := v_ch.stake_coins * 2;
  v_rake      := FLOOR(v_total_pot * 0.05);
  v_prize     := v_total_pot - v_rake;  -- winner's total payout (or each party gets stake back on tie)

  IF v_is_tie THEN
    -- Each player's own stake goes back to their own balance — release_escrow()
    -- already logs its own 'refund' transaction, so nothing further to credit.
    PERFORM release_escrow(v_ch.challenger_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_tie'));
    PERFORM release_escrow(v_ch.opponent_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_tie'));
  ELSE
    -- Winner: their own escrowed stake is unlocked back to their balance...
    PERFORM release_escrow(v_winner_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_resolved'));
    -- ...then the net winnings (loser's stake minus rake) are credited on top,
    -- so the winner's total gain is stake*2 - rake, sourced from the loser.
    PERFORM credit_coins(v_winner_id, v_prize - v_ch.stake_coins, 'win', p_challenge_id,
      jsonb_build_object(
        'reason',        'challenge_won',
        'stake',         v_ch.stake_coins,
        'prize',         v_prize,
        'rake',          v_rake,
        'opponent_pts',  CASE WHEN v_winner_id = v_ch.challenger_id THEN v_opponent_pts ELSE v_challenger_pts END,
        'winner_pts',    CASE WHEN v_winner_id = v_ch.challenger_id THEN v_challenger_pts ELSE v_opponent_pts END
      ));

    -- Loser: stake is forfeited — decrement escrow directly (never released back
    -- to their balance), then log an audit-only transaction. Not routed through
    -- credit_coins(): it rejects non-positive amounts, and this is not a credit.
    SELECT escrow INTO v_loser_escrow FROM coin_wallets WHERE user_id = v_loser_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
    IF v_loser_escrow < v_ch.stake_coins THEN RAISE EXCEPTION 'INSUFFICIENT_ESCROW'; END IF;

    UPDATE coin_wallets
    SET escrow     = escrow - v_ch.stake_coins,
        updated_at = now()
    WHERE user_id = v_loser_id;

    INSERT INTO coin_transactions (user_id, type, amount, challenge_id, meta)
    VALUES (v_loser_id, 'loss', v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_lost', 'stake_lost', v_ch.stake_coins));
  END IF;

  -- Update challenge row
  UPDATE p2p_challenges SET
    status          = 'resolved',
    winner_id       = v_winner_id,  -- NULL on tie
    challenger_pts  = v_challenger_pts,
    opponent_pts    = v_opponent_pts,
    resolved_at     = now(),
    updated_at      = now()
  WHERE id = p_challenge_id;

  -- Write gazette entry (p2p_result) so it shows in league activity feed
  SELECT username INTO v_challenger_name FROM users WHERE id = v_ch.challenger_id;
  SELECT username INTO v_opponent_name   FROM users WHERE id = v_ch.opponent_id;

  INSERT INTO gazette_entries (league_id, entry_type, headline, bullets, full_data, published_at)
  VALUES (
    v_ch.league_id,
    'p2p_result',
    CASE
      WHEN v_is_tie THEN
        v_challenger_name || ' vs ' || v_opponent_name || ' — ' ||
        'DRAW · ' || v_ch.stake_coins || ' coins each returned'
      ELSE
        (CASE WHEN v_winner_id = v_ch.challenger_id THEN v_challenger_name ELSE v_opponent_name END) ||
        ' beat ' ||
        (CASE WHEN v_winner_id = v_ch.challenger_id THEN v_opponent_name ELSE v_challenger_name END) ||
        ' — ' || v_prize || ' coins won'
    END,
    jsonb_build_array(
      v_challenger_name || ' · ' || v_challenger_pts || ' pts',
      v_opponent_name   || ' · ' || v_opponent_pts   || ' pts',
      'GW: ' || v_ch.matchday_id || ' · Stake: ' || v_ch.stake_coins || ' coins'
    ),
    jsonb_build_object(
      'challenge_id',    p_challenge_id,
      'matchday_id',     v_ch.matchday_id,
      'is_tie',          v_is_tie,
      'winner_id',       v_winner_id,
      'prize',           v_prize,
      'rake',            v_rake
    ),
    now()
  );

  RETURN jsonb_build_object(
    'status',          'resolved',
    'is_tie',          v_is_tie,
    'winner_id',       v_winner_id,
    'challenger_pts',  v_challenger_pts,
    'opponent_pts',    v_opponent_pts,
    'prize',           v_prize,
    'rake',            v_rake
  );
END;
$$;

REVOKE ALL ON FUNCTION resolve_p2p_challenge(uuid) FROM public, authenticated, anon;
-- No GRANT — service role only via auto_resolve_p2p_challenges (unchanged from migration 205)
