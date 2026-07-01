-- ✅ APPLIED TO PRODUCTION 2026-06-28 (v2 session)
-- Migration 205: P2P-4 — auto-resolution engine
--
-- Adds:
--   1. challenger_pts / opponent_pts columns on p2p_challenges (stored at resolve time for UI)
--   2. Updated get_my_challenges() — joins usernames, returns pts columns
--   3. resolve_p2p_challenge(p_challenge_id) — SECURITY DEFINER, service-role only
--   4. auto_resolve_p2p_challenges() — batch resolver, called by pgcron every 5 min
--   5. resolve-p2p-challenges cron (5 min, alongside calculate-scores-live)
--
-- Resolution rules:
--   - Trigger: gazette_entries row with entry_type='activity' exists for (league_id, matchday_id)
--     → means calculate-scores fired roundComplete=true for this league+round
--   - Winner: higher fantasy_points.total for that matchday
--   - Tie: both stakes returned, no rake burned (fair draw)
--   - Prize: stake*2 - floor(stake*2 * 0.05) coins to winner (5% rake burned)
--   - Loss transaction logged for loser (no coin movement beyond escrow release)

-- ── 1. Columns to store pts at resolution (UI display without extra queries)
ALTER TABLE p2p_challenges
  ADD COLUMN IF NOT EXISTS challenger_pts numeric,
  ADD COLUMN IF NOT EXISTS opponent_pts   numeric;

-- ── 2. Update get_my_challenges to join usernames and include new columns
CREATE OR REPLACE FUNCTION get_my_challenges(p_league_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result  jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                   c.id,
      'league_id',            c.league_id,
      'challenger_id',        c.challenger_id,
      'challenger_username',  cu.username,
      'opponent_id',          c.opponent_id,
      'opponent_username',    ou.username,
      'bet_type',             c.bet_type,
      'matchday_id',          c.matchday_id,
      'stake_coins',          c.stake_coins,
      'message',              c.message,
      'status',               c.status,
      'winner_id',            c.winner_id,
      'challenger_pts',       c.challenger_pts,
      'opponent_pts',         c.opponent_pts,
      'expires_at',           c.expires_at,
      'resolved_at',          c.resolved_at,
      'created_at',           c.created_at,
      'updated_at',           c.updated_at
    )
    ORDER BY c.created_at DESC
  )
  INTO v_result
  FROM p2p_challenges c
  LEFT JOIN users cu ON cu.id = c.challenger_id
  LEFT JOIN users ou ON ou.id = c.opponent_id
  WHERE (c.challenger_id = v_user_id OR c.opponent_id = v_user_id)
    AND (p_league_id IS NULL OR c.league_id = p_league_id)
    AND (
      c.status IN ('pending', 'accepted')
      OR c.created_at > now() - interval '30 days'
    );

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION get_my_challenges(uuid) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION get_my_challenges(uuid) TO authenticated;

-- ── 3. resolve_p2p_challenge(p_challenge_id) — service-role / cron only
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
  v_prize     := v_total_pot - v_rake;  -- winner gets this (or each party gets stake back on tie)

  -- Release escrow for both parties
  PERFORM release_escrow(v_ch.challenger_id, v_ch.stake_coins, p_challenge_id,
    jsonb_build_object('reason', 'challenge_resolved'));
  PERFORM release_escrow(v_ch.opponent_id, v_ch.stake_coins, p_challenge_id,
    jsonb_build_object('reason', 'challenge_resolved'));

  IF v_is_tie THEN
    -- Return both stakes, no rake burned
    PERFORM credit_coins(v_ch.challenger_id, v_ch.stake_coins, 'refund', p_challenge_id,
      jsonb_build_object('reason', 'challenge_tie'));
    PERFORM credit_coins(v_ch.opponent_id, v_ch.stake_coins, 'refund', p_challenge_id,
      jsonb_build_object('reason', 'challenge_tie'));
  ELSE
    -- Credit winner prize (rake is burned — never credited)
    PERFORM credit_coins(v_winner_id, v_prize, 'win', p_challenge_id,
      jsonb_build_object(
        'reason',        'challenge_won',
        'stake',         v_ch.stake_coins,
        'prize',         v_prize,
        'rake',          v_rake,
        'opponent_pts',  CASE WHEN v_winner_id = v_ch.challenger_id THEN v_opponent_pts ELSE v_challenger_pts END,
        'winner_pts',    CASE WHEN v_winner_id = v_ch.challenger_id THEN v_challenger_pts ELSE v_opponent_pts END
      ));
    -- Loss transaction for loser (no coins moved — just an audit record)
    PERFORM credit_coins(v_loser_id, 0, 'loss', p_challenge_id,
      jsonb_build_object(
        'reason',       'challenge_lost',
        'stake_lost',   v_ch.stake_coins
      ));
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
-- No GRANT — service role only via auto_resolve_p2p_challenges

-- ── 4. auto_resolve_p2p_challenges() — batch, called by cron
CREATE OR REPLACE FUNCTION auto_resolve_p2p_challenges()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ch     p2p_challenges;
  v_count  int := 0;
  v_result jsonb;
BEGIN
  FOR v_ch IN
    SELECT DISTINCT c.*
    FROM p2p_challenges c
    WHERE c.status = 'accepted'
      AND EXISTS (
        -- Matchday settled for this league
        SELECT 1 FROM gazette_entries ge
        WHERE ge.league_id  = c.league_id
          AND ge.entry_type = 'activity'
          AND ge.full_data->>'matchday_id' = c.matchday_id
      )
    ORDER BY c.created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_result := resolve_p2p_challenge(v_ch.id);
      v_count  := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_resolve_p2p_challenges: failed for challenge %: %', v_ch.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION auto_resolve_p2p_challenges() FROM public, authenticated, anon;

-- ── 5. Cron: run every 5 min (right after calculate-scores-live fires)
SELECT cron.schedule(
  'resolve-p2p-challenges',
  '*/5 * * * *',
  $$SELECT auto_resolve_p2p_challenges();$$
);
