-- 307: Settlement (S10 / J-13) + ledger fix (BUG-LEDGER-1) + no-result rule.
--
-- LEDGER CONVENTION (every coin_transactions row = a real balance movement):
--   stake  -s   balance -> escrow, at placement
--   refund +s   escrow -> balance (push, void, or the winner getting their own stake back)
--   win    +x   winnings credited to balance
--   loss    0   forfeited stake (it left the balance at 'stake' time); stake_lost in meta
-- Old rows are NOT rewritten.
--
-- SETTLEMENT (both kinds of bet): declare -> 24h to object -> automatic payout.
--   Group bets: declare_bet_outcome window 48h -> 24h. Objection -> owner arbitrates; 7 days silent -> void.
--   1-to-1 freeform: a declaration starts a 24h window; the hourly job pays out when it passes.
--   Nobody declares: group bet void + refund 7 days after it closed; 1-to-1 void + refund 14 days after acceptance.
--   Reminder after 3 days (group bet creator) / 7 days (both sides of a 1-to-1), once.
-- No new cron job: finalize_declared_bets (job 78) and auto_void_stale_disputes (hourly) are extended.

BEGIN;

-- 1. Group bets: 24h objection window
CREATE OR REPLACE FUNCTION public.declare_bet_outcome(p_bet_id uuid, p_winning_option_ids uuid[] DEFAULT NULL::uuid[], p_winning_user_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bet p2p_bets%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_bet FROM p2p_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BET_NOT_FOUND';
  END IF;
  IF v_bet.creator_id <> auth.uid() THEN
    RAISE EXCEPTION 'NOT_BET_CREATOR';
  END IF;
  IF v_bet.status <> 'closed' THEN
    RAISE EXCEPTION 'BET_NOT_CLOSED';
  END IF;

  IF v_bet.answer_mode = 'multiple_choice' THEN
    IF p_winning_option_ids IS NOT NULL AND array_length(p_winning_option_ids, 1) > 0 THEN
      IF (SELECT COUNT(*) FROM p2p_bet_options WHERE bet_id = p_bet_id AND id = ANY(p_winning_option_ids))
         <> array_length(p_winning_option_ids, 1) THEN
        RAISE EXCEPTION 'INVALID_OPTION';
      END IF;
      UPDATE p2p_bet_options SET is_correct = true WHERE bet_id = p_bet_id AND id = ANY(p_winning_option_ids);
      UPDATE p2p_bet_participants pp SET declared_correct = true
      WHERE pp.bet_id = p_bet_id AND pp.status = 'joined' AND EXISTS (
        SELECT 1 FROM p2p_bet_participant_answers pa
        WHERE pa.participant_id = pp.id AND pa.option_id = ANY(p_winning_option_ids)
      );
    END IF;
  ELSE
    IF p_winning_user_ids IS NOT NULL AND array_length(p_winning_user_ids, 1) > 0 THEN
      UPDATE p2p_bet_participants SET declared_correct = true
      WHERE bet_id = p_bet_id AND status = 'joined' AND user_id = ANY(p_winning_user_ids);
    END IF;
  END IF;

  UPDATE p2p_bets
  SET declared_by = auth.uid(), declared_at = now(), objection_deadline = now() + interval '24 hours', updated_at = now()
  WHERE id = p_bet_id;
END;
$function$
;

-- 2. settle_bet_coins: ledger rows that match the real balance movement
CREATE OR REPLACE FUNCTION public.settle_bet_coins(p_bet_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pot          int;
  v_winner_count int;
  v_rake         int;
  v_prize_pool   int;
  v_share        int;
  v_p            RECORD;
BEGIN
  SELECT COALESCE(SUM(stake_coins), 0) INTO v_pot
  FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined';

  SELECT COUNT(*) INTO v_winner_count
  FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined' AND is_winner = true;

  IF v_winner_count = 0 THEN
    FOR v_p IN SELECT user_id, stake_coins FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined' LOOP
      PERFORM release_escrow(v_p.user_id, v_p.stake_coins, NULL,
        jsonb_build_object('bet_id', p_bet_id, 'reason', 'push'), p_bet_id);
    END LOOP;
    RETURN;
  END IF;

  v_rake := FLOOR(v_pot * 0.05);
  v_prize_pool := v_pot - v_rake;
  v_share := FLOOR(v_prize_pool / v_winner_count);

  FOR v_p IN SELECT user_id, stake_coins, is_winner FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined' LOOP
    IF v_p.is_winner THEN
      -- Move escrow -> balance at the net share (rake may leave it below the stake
      -- when everyone wins). One 'win' row for the full payout: the stake already
      -- left the balance as a 'stake' row, so the payout is what comes back.
      UPDATE coin_wallets SET balance = balance + v_share, escrow = escrow - v_p.stake_coins
      WHERE user_id = v_p.user_id AND escrow >= v_p.stake_coins;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'INSUFFICIENT_ESCROW';
      END IF;
      INSERT INTO coin_transactions (user_id, type, amount, bet_id, meta)
      VALUES (v_p.user_id, 'win', v_share, p_bet_id,
        jsonb_build_object('bet_id', p_bet_id, 'stake', v_p.stake_coins, 'payout', v_share));
    ELSE
      UPDATE coin_wallets SET escrow = escrow - v_p.stake_coins WHERE user_id = v_p.user_id;
      INSERT INTO coin_transactions (user_id, type, amount, bet_id, meta)
      VALUES (v_p.user_id, 'loss', 0, p_bet_id,
        jsonb_build_object('bet_id', p_bet_id, 'stake_lost', v_p.stake_coins));
    END IF;
  END LOOP;
END;
$function$;

-- 3. finalize_declared_bets: also void bets nobody declared a result for, and remind the creator
CREATE OR REPLACE FUNCTION public.finalize_declared_bets()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bet RECORD;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  -- Declared, objection window passed -> pay out
  FOR v_bet IN
    SELECT id, circle_id, creator_id, question, stake_coins FROM p2p_bets
    WHERE status = 'closed' AND declared_at IS NOT NULL AND objection_deadline <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE p2p_bet_participants SET is_winner = declared_correct WHERE bet_id = v_bet.id;
    PERFORM settle_bet_coins(v_bet.id);
    UPDATE p2p_bets SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = v_bet.id;
    PERFORM post_bet_activity_message(
      v_bet.circle_id, v_bet.creator_id,
      '✅ Bet resolved: ' || v_bet.question,
      jsonb_build_object('ref_kind', 'bet', 'ref_id', v_bet.id, 'event', 'resolved', 'question', v_bet.question, 'stake_coins', v_bet.stake_coins)
    );
  END LOOP;

  -- Nobody declared within 7 days of closing -> void, everyone gets their stake back
  FOR v_bet IN
    SELECT id, circle_id, creator_id, question, stake_coins FROM p2p_bets
    WHERE status = 'closed' AND declared_at IS NULL AND updated_at <= now() - interval '7 days'
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE p2p_bet_participants SET is_winner = false, declared_correct = false WHERE bet_id = v_bet.id;
    PERFORM settle_bet_coins(v_bet.id);
    UPDATE p2p_bets SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = v_bet.id;
    PERFORM post_bet_activity_message(
      v_bet.circle_id, v_bet.creator_id,
      '⚖️ Bet voided (no result declared, stakes returned): ' || v_bet.question,
      jsonb_build_object('ref_kind', 'bet', 'ref_id', v_bet.id, 'event', 'resolved', 'question', v_bet.question, 'stake_coins', v_bet.stake_coins)
    );
  END LOOP;

  -- Reminder to the creator after 3 days, once
  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  SELECT b.circle_id, b.creator_id, 'p2p_bet', b.id, 'result_needed',
         jsonb_build_object('bet_id', b.id, 'question', b.question)
  FROM p2p_bets b
  WHERE b.status = 'closed' AND b.declared_at IS NULL AND b.updated_at <= now() - interval '3 days'
    AND NOT EXISTS (SELECT 1 FROM clubhouse_notifications n
                    WHERE n.source_id = b.id AND n.type = 'result_needed');
END;
$function$;

-- 4. 1-to-1 freeform: one settlement helper, used by confirm, arbitrate and the hourly job
CREATE OR REPLACE FUNCTION public.settle_freeform_challenge(p_challenge_id uuid, p_winner_id uuid, p_reason text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ch           p2p_challenges;
  v_loser_id     uuid;
  v_total_pot    int;
  v_rake         int;
  v_prize        int;
  v_loser_escrow int;
BEGIN
  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;

  IF p_winner_id IS NULL THEN
    PERFORM release_escrow(v_ch.challenger_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', p_reason || '_push'));
    PERFORM release_escrow(v_ch.opponent_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', p_reason || '_push'));
  ELSE
    v_loser_id  := CASE WHEN p_winner_id = v_ch.challenger_id THEN v_ch.opponent_id ELSE v_ch.challenger_id END;
    v_total_pot := v_ch.stake_coins * 2;
    v_rake      := FLOOR(v_total_pot * 0.05);
    v_prize     := v_total_pot - v_rake;

    PERFORM release_escrow(p_winner_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', p_reason));
    PERFORM credit_coins(p_winner_id, v_prize - v_ch.stake_coins, 'win', p_challenge_id,
      jsonb_build_object('reason', p_reason || '_win', 'stake', v_ch.stake_coins, 'prize', v_prize, 'rake', v_rake));

    SELECT escrow INTO v_loser_escrow FROM coin_wallets WHERE user_id = v_loser_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
    IF v_loser_escrow < v_ch.stake_coins THEN RAISE EXCEPTION 'INSUFFICIENT_ESCROW'; END IF;

    UPDATE coin_wallets SET escrow = escrow - v_ch.stake_coins, updated_at = now()
    WHERE user_id = v_loser_id;

    INSERT INTO coin_transactions (user_id, type, amount, challenge_id, meta)
    VALUES (v_loser_id, 'loss', 0, p_challenge_id,
      jsonb_build_object('reason', p_reason || '_loss', 'stake_lost', v_ch.stake_coins));
  END IF;

  UPDATE p2p_challenges
  SET status = 'resolved', winner_id = p_winner_id, resolved_at = now(), updated_at = now()
  WHERE id = p_challenge_id;

  PERFORM post_bet_activity_message(
    v_ch.circle_id, COALESCE(p_actor, v_ch.challenger_id),
    CASE WHEN p_winner_id IS NULL THEN '⚖️ Challenge voided (stakes returned): ' ELSE '✅ Challenge resolved: ' END || v_ch.question,
    jsonb_build_object('ref_kind', 'challenge', 'ref_id', p_challenge_id, 'event', 'resolved', 'question', v_ch.question, 'stake_coins', v_ch.stake_coins)
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.settle_freeform_challenge(uuid, uuid, text, uuid) FROM public, authenticated, anon;

-- declare: starts a 24h objection window (was 7 days)
CREATE OR REPLACE FUNCTION public.declare_freeform_result(p_challenge_id uuid, p_winner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ch  p2p_challenges;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.bet_type <> 'freeform' THEN RAISE EXCEPTION 'NOT_FREEFORM'; END IF;
  IF v_ch.status <> 'accepted' THEN RAISE EXCEPTION 'INVALID_STATUS (status=%)', v_ch.status; END IF;
  IF v_uid NOT IN (v_ch.challenger_id, v_ch.opponent_id) THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT';
  END IF;
  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (v_ch.challenger_id, v_ch.opponent_id) THEN
    RAISE EXCEPTION 'INVALID_WINNER';
  END IF;

  -- p_winner_id NULL = proposing a push (both stakes returned, no winner)
  UPDATE p2p_challenges
  SET proposed_winner_id = p_winner_id,
      proposed_by        = v_uid,
      proposed_at        = now(),
      dispute_deadline   = now() + interval '24 hours',
      updated_at         = now()
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('ok', true, 'objection_deadline', now() + interval '24 hours');
END;
$function$;

-- confirm: the other side agrees early; pays out now
CREATE OR REPLACE FUNCTION public.confirm_freeform_result(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ch  p2p_challenges;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.bet_type <> 'freeform' THEN RAISE EXCEPTION 'NOT_FREEFORM'; END IF;
  IF v_ch.status <> 'accepted' THEN RAISE EXCEPTION 'INVALID_STATUS (status=%)', v_ch.status; END IF;
  IF v_ch.proposed_by IS NULL THEN RAISE EXCEPTION 'NO_PROPOSAL'; END IF;
  IF v_uid = v_ch.proposed_by THEN RAISE EXCEPTION 'CANNOT_CONFIRM_OWN_PROPOSAL'; END IF;
  IF v_uid NOT IN (v_ch.challenger_id, v_ch.opponent_id) THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT';
  END IF;

  PERFORM settle_freeform_challenge(p_challenge_id, v_ch.proposed_winner_id, 'freeform_resolved', v_uid);
  RETURN jsonb_build_object('status', 'resolved', 'winner_id', v_ch.proposed_winner_id);
END;
$function$;

-- dispute: only inside the 24h window
CREATE OR REPLACE FUNCTION public.dispute_freeform_result(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ch  p2p_challenges;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.bet_type <> 'freeform' THEN RAISE EXCEPTION 'NOT_FREEFORM'; END IF;
  IF v_ch.status <> 'accepted' THEN RAISE EXCEPTION 'INVALID_STATUS (status=%)', v_ch.status; END IF;
  IF v_ch.proposed_by IS NULL THEN RAISE EXCEPTION 'NO_PROPOSAL'; END IF;
  IF v_uid = v_ch.proposed_by THEN RAISE EXCEPTION 'CANNOT_DISPUTE_OWN_PROPOSAL'; END IF;
  IF v_uid NOT IN (v_ch.challenger_id, v_ch.opponent_id) THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT';
  END IF;
  IF v_ch.dispute_deadline IS NOT NULL AND v_ch.dispute_deadline <= now() THEN
    RAISE EXCEPTION 'OBJECTION_WINDOW_CLOSED';
  END IF;

  UPDATE p2p_challenges
  SET status = 'disputed', dispute_deadline = now() + interval '7 days', updated_at = now()
  WHERE id = p_challenge_id;

  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  SELECT v_ch.circle_id, cm.user_id, 'p2p_challenge', p_challenge_id, 'arbitration_needed',
         jsonb_build_object('question', v_ch.question, 'stake_coins', v_ch.stake_coins)
  FROM circle_members cm
  WHERE cm.circle_id = v_ch.circle_id AND cm.role = 'owner';

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- arbitrate: owner decides a disputed challenge
CREATE OR REPLACE FUNCTION public.arbitrate_freeform_result(p_challenge_id uuid, p_winner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ch  p2p_challenges;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.bet_type <> 'freeform' THEN RAISE EXCEPTION 'NOT_FREEFORM'; END IF;
  IF v_ch.status <> 'disputed' THEN RAISE EXCEPTION 'INVALID_STATUS (status=%)', v_ch.status; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = v_ch.circle_id AND user_id = v_uid AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_OWNER';
  END IF;
  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (v_ch.challenger_id, v_ch.opponent_id) THEN
    RAISE EXCEPTION 'INVALID_WINNER';
  END IF;

  PERFORM settle_freeform_challenge(p_challenge_id, p_winner_id,
    CASE WHEN p_winner_id IS NULL THEN 'freeform_voided' ELSE 'freeform_arbitrated' END, v_uid);
  RETURN jsonb_build_object('status', 'resolved', 'winner_id', p_winner_id);
END;
$function$;

-- hourly sweep: declared-and-unchallenged bets pay out; never-declared bets void
CREATE OR REPLACE FUNCTION public.settle_due_freeform_challenges()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ch    p2p_challenges;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN RAISE EXCEPTION 'ADMIN_ONLY'; END IF;

  -- Declared, nobody objected within 24h -> pay out
  FOR v_ch IN
    SELECT * FROM p2p_challenges
    WHERE bet_type = 'freeform' AND status = 'accepted'
      AND proposed_by IS NOT NULL AND dispute_deadline <= now()
    ORDER BY created_at FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM settle_freeform_challenge(v_ch.id, v_ch.proposed_winner_id, 'freeform_auto');
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'settle_due_freeform_challenges: payout failed for %: %', v_ch.id, SQLERRM;
    END;
  END LOOP;

  -- Never declared, 14 days after acceptance -> void, both stakes back
  FOR v_ch IN
    SELECT * FROM p2p_challenges
    WHERE bet_type = 'freeform' AND status = 'accepted'
      AND proposed_by IS NULL AND updated_at <= now() - interval '14 days'
    ORDER BY created_at FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM settle_freeform_challenge(v_ch.id, NULL, 'freeform_no_result');
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'settle_due_freeform_challenges: void failed for %: %', v_ch.id, SQLERRM;
    END;
  END LOOP;

  -- Reminder to both sides after 7 days without a result, once
  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  SELECT c.circle_id, u.uid, 'p2p_challenge', c.id, 'result_needed',
         jsonb_build_object('question', c.question, 'stake_coins', c.stake_coins)
  FROM p2p_challenges c
  CROSS JOIN LATERAL (VALUES (c.challenger_id), (c.opponent_id)) AS u(uid)
  WHERE c.bet_type = 'freeform' AND c.status = 'accepted' AND c.proposed_by IS NULL
    AND c.updated_at <= now() - interval '7 days'
    AND NOT EXISTS (SELECT 1 FROM clubhouse_notifications n
                    WHERE n.source_id = c.id AND n.type = 'result_needed' AND n.user_id = u.uid);

  RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.settle_due_freeform_challenges() FROM public, authenticated, anon;

-- auto_void_stale_disputes (hourly job) now also runs the sweep above
CREATE OR REPLACE FUNCTION public.auto_void_stale_disputes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ch    p2p_challenges;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  FOR v_ch IN
    SELECT * FROM p2p_challenges
    WHERE status = 'disputed' AND dispute_deadline < now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM settle_freeform_challenge(v_ch.id, NULL, 'freeform_dispute_timeout');
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_void_stale_disputes: failed for challenge %: %', v_ch.id, SQLERRM;
    END;
  END LOOP;

  v_count := v_count + settle_due_freeform_challenges();
  RETURN v_count;
END;
$function$;

-- 5. gw_total challenges: the loser's forfeited-stake row is 0, not +stake
CREATE OR REPLACE FUNCTION public.resolve_p2p_challenge(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    VALUES (v_loser_id, 'loss', 0, p_challenge_id,
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

  PERFORM post_bet_activity_message(
    v_ch.circle_id,
    COALESCE(v_winner_id, v_ch.challenger_id),
    CASE
      WHEN v_is_tie THEN v_challenger_name || ' vs ' || v_opponent_name || ' — draw, coins returned'
      ELSE (CASE WHEN v_winner_id = v_ch.challenger_id THEN v_challenger_name ELSE v_opponent_name END) || ' won ' || v_prize || ' coins'
    END,
    jsonb_build_object('ref_kind', 'challenge', 'ref_id', p_challenge_id, 'event', 'resolved', 'question', COALESCE(v_ch.question, 'GW ' || v_ch.matchday_id), 'stake_coins', v_ch.stake_coins)
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
$function$
;

COMMIT;
