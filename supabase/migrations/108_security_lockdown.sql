-- Migration 108: Security lockdown + critical game-logic fixes
-- Fixes: DD-C1, DD-C2, DD-C3, DD-C4(cron), DD-C10, DD-M11, NEW-C1, NEW-C2
--
-- 1. execute_transfer_atomic (latest overload): auth.uid() ownership check + server-side price
-- 2. set_lineup: auth.uid() ownership check + block swaps during live fixtures (DD-C3)
-- 3. resolve_bet: add already-resolved guard (DD-C10)
-- 4. REVOKE direct chip column UPDATE from anon/authenticated (DD-M11)
-- 5. REVOKE direct execute_transfer_atomic from anon/authenticated (DD-C1 hardening)
-- 6. Cancel stuck draft submissions for test leagues (NEW-C2)
-- 7. Backfill WC knockout round_number (NEW-C1 prerequisite)
-- 8. Fix run-draft-lottery + run-reverse-standings-draft crons to use service-role (DD-C4)

-- ── 1. execute_transfer_atomic (latest overload) ──────────────────────────────
-- Adds: ownership guard + server-side price lookup (p_price is now ignored)

CREATE OR REPLACE FUNCTION execute_transfer_atomic(
  p_squad_id    uuid,
  p_action      text,
  p_player_id   uuid,
  p_price       numeric,          -- kept for API compat, ignored; price looked up from DB
  p_pos_limit   int  DEFAULT 99,
  p_squad_max   int  DEFAULT 99,
  p_club_max    int  DEFAULT 99,
  p_league_id   uuid DEFAULT NULL,
  p_matchday_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_squad               squads;
  v_new_players         uuid[];
  v_new_budget          numeric;
  v_new_round_transfers jsonb;
  v_player_pos          text;
  v_player_team         text;
  v_pos_count           int;
  v_club_count          int;
  v_transfers_per_round int  := 3;
  v_wildcard_round      int  := NULL;
  v_used_transfers      int  := 0;
  v_matchday_round      int;
  v_enforce_limit       bool := false;
  v_server_price        numeric;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  -- Ownership guard: authenticated callers may only touch their own squad.
  -- Service-role callers (process-transfer edge function) have auth.uid() = NULL → allowed.
  IF auth.uid() IS NOT NULL AND v_squad.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not your squad');
  END IF;

  -- Server-side price: always look up from players table; never trust client-supplied p_price.
  SELECT price INTO v_server_price FROM players WHERE id = p_player_id;
  IF v_server_price IS NULL AND p_action = 'buy' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_FOUND', 'error', 'Player not found');
  END IF;
  IF v_server_price IS NULL THEN v_server_price := 0; END IF;

  -- ── Transfer limit enforcement ───────────────────────────────────────────────
  IF p_league_id IS NOT NULL AND p_matchday_id IS NOT NULL THEN
    SELECT (config_value #>> '{}')::int INTO v_transfers_per_round
      FROM league_config
     WHERE league_id = p_league_id AND config_key = 'transfers_per_round';
    IF v_transfers_per_round IS NULL THEN v_transfers_per_round := 3; END IF;

    SELECT (config_value #>> '{}')::int INTO v_wildcard_round
      FROM league_config
     WHERE league_id = p_league_id AND config_key = 'transfer_wildcard_round';

    v_matchday_round := (regexp_match(p_matchday_id, '-r(\d+)$'))[1]::int;

    IF v_wildcard_round IS NULL OR v_matchday_round IS DISTINCT FROM v_wildcard_round THEN
      v_enforce_limit  := true;
      v_used_transfers := COALESCE(
        (v_squad.round_transfers ->> p_matchday_id)::int, 0
      );
      IF v_used_transfers >= v_transfers_per_round THEN
        RETURN jsonb_build_object(
          'ok',    false,
          'code',  'TRANSFER_LIMIT_REACHED',
          'error', 'Transfer limit reached — ' || v_transfers_per_round ||
                   ' transfers allowed per round'
        );
      END IF;
    END IF;
  END IF;

  -- ── Buy ──────────────────────────────────────────────────────────────────────
  IF p_action = 'buy' THEN
    IF v_squad.players @> ARRAY[p_player_id] THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OWNED',
                                'error', 'You already own this player');
    END IF;

    IF array_length(v_squad.players, 1) >= p_squad_max THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL',
                                'error', 'Squad is full — sell a player first');
    END IF;

    IF v_squad.budget_remaining < v_server_price THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
                                'error', 'Insufficient budget');
    END IF;

    IF p_pos_limit < 99 THEN
      SELECT p.position INTO v_player_pos FROM players p WHERE p.id = p_player_id;
      SELECT COUNT(*) INTO v_pos_count
        FROM players p
        WHERE p.id = ANY(v_squad.players) AND p.position = v_player_pos;
      IF v_pos_count >= p_pos_limit THEN
        RETURN jsonb_build_object('ok', false, 'code', 'POSITION_LIMIT',
          'error', 'Maximum ' || v_player_pos || ' players reached (' || p_pos_limit || ')');
      END IF;
    END IF;

    IF p_club_max < 99 THEN
      SELECT p.forza_team_id INTO v_player_team FROM players p WHERE p.id = p_player_id;
      IF v_player_team IS NOT NULL THEN
        SELECT COUNT(*) INTO v_club_count
          FROM players p
          WHERE p.id = ANY(v_squad.players)
            AND p.forza_team_id = v_player_team;
        IF v_club_count >= p_club_max THEN
          RETURN jsonb_build_object('ok', false, 'code', 'CLUB_LIMIT',
            'error', 'Maximum ' || p_club_max || ' players from the same club');
        END IF;
      END IF;
    END IF;

    v_new_players := array_append(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining - v_server_price)::numeric, 1);

  -- ── Sell ─────────────────────────────────────────────────────────────────────
  ELSIF p_action = 'sell' THEN
    IF NOT (v_squad.players @> ARRAY[p_player_id]) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
    END IF;
    v_new_players := array_remove(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining + v_server_price)::numeric, 1);

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown action');
  END IF;

  -- ── Increment round_transfers counter ────────────────────────────────────────
  IF v_enforce_limit THEN
    v_new_round_transfers := jsonb_set(
      COALESCE(v_squad.round_transfers, '{}'::jsonb),
      ARRAY[p_matchday_id],
      to_jsonb(v_used_transfers + 1)
    );
  ELSE
    v_new_round_transfers := COALESCE(v_squad.round_transfers, '{}'::jsonb);
  END IF;

  UPDATE squads
    SET players          = v_new_players,
        budget_remaining = v_new_budget,
        round_transfers  = v_new_round_transfers
  WHERE id = p_squad_id;

  RETURN jsonb_build_object(
    'ok',               true,
    'players',          to_jsonb(v_new_players),
    'budget_remaining', v_new_budget
  );
END;
$$;

-- ── 2. set_lineup: ownership check + live-fixture lock (DD-C2 + DD-C3) ────────

CREATE OR REPLACE FUNCTION set_lineup(
  p_squad_id   uuid,
  p_player_out uuid,
  p_player_in  uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_squad          squads;
  v_matchday_id    text;
  v_round_number   int;
  v_tournament_id  text;
  v_lock_array     text[];
  v_new_xi         text[];
  v_pin_status     text;
  v_pout_status    text;
  v_pout_pts       numeric := 0;
  v_deduction      numeric := 0;
  v_gk_count       int;
  v_def_count      int;
  v_mid_count      int;
  v_fwd_count      int;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  -- Ownership guard: only the squad owner can change their lineup.
  IF auth.uid() IS NOT NULL AND v_squad.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not your squad');
  END IF;

  v_matchday_id  := v_squad.matchday_id;
  v_round_number := (regexp_match(v_matchday_id, '-r(\d+)$'))[1]::int;

  SELECT tournament_id INTO v_tournament_id
  FROM leagues WHERE id = v_squad.league_id;

  IF array_length(v_squad.starting_xi, 1) IS NULL OR array_length(v_squad.starting_xi, 1) = 0 THEN
    v_squad.starting_xi := v_squad.players[1:11];
  END IF;

  v_lock_array := ARRAY(
    SELECT jsonb_array_elements_text(
      COALESCE(v_squad.lineup_locks -> v_matchday_id, '[]'::jsonb)
    )
  );

  -- 1. p_player_in owned by this squad
  IF NOT (v_squad.players @> ARRAY[p_player_in::text]) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
  END IF;

  -- 2. p_player_in NOT locked out from this matchday
  IF p_player_in::text = ANY(v_lock_array) THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'PLAYER_LOCKED',
      'error', 'This player was already subbed out this round and cannot return until next matchday'
    );
  END IF;

  -- 3. p_player_in is currently on bench (not already in the XI)
  IF p_player_in::text = ANY(v_squad.starting_xi) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player is already in the starting XI');
  END IF;

  -- 4. p_player_out is currently in the XI
  IF NOT (p_player_out::text = ANY(v_squad.starting_xi)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player to move to bench is not in the starting XI');
  END IF;

  -- 5. p_player_in fixture not started or finished this round (DD-C3: covers live too)
  SELECT f.status INTO v_pin_status
  FROM fixtures f
  JOIN players pl ON (
    pl.forza_team_id = f.home_team_forza_id
    OR pl.forza_team_id = f.away_team_forza_id
  )
  WHERE pl.id = p_player_in
    AND f.round_number  = v_round_number
    AND f.tournament_id = v_tournament_id
  LIMIT 1;

  IF v_pin_status IN ('live', 'finished') THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'FIXTURE_COMPLETED',
      'error', 'Cannot sub in a player whose fixture has started or finished this round'
    );
  END IF;

  -- Build new XI
  SELECT ARRAY_AGG(CASE WHEN x = p_player_out::text THEN p_player_in::text ELSE x END ORDER BY ord)
    INTO v_new_xi
    FROM unnest(v_squad.starting_xi) WITH ORDINALITY AS t(x, ord);

  -- 6. Formation validity
  SELECT
    COUNT(*) FILTER (WHERE position = 'GK'),
    COUNT(*) FILTER (WHERE position = 'DEF'),
    COUNT(*) FILTER (WHERE position = 'MID'),
    COUNT(*) FILTER (WHERE position = 'FWD')
  INTO v_gk_count, v_def_count, v_mid_count, v_fwd_count
  FROM players
  WHERE id::text = ANY(v_new_xi);

  IF v_gk_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must include at least 1 goalkeeper');
  END IF;
  IF v_def_count < 3 OR v_def_count > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 3–5 defenders (got ' || v_def_count || ')');
  END IF;
  IF v_mid_count < 2 OR v_mid_count > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 2–5 midfielders (got ' || v_mid_count || ')');
  END IF;
  IF v_fwd_count < 1 OR v_fwd_count > 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 1–3 forwards (got ' || v_fwd_count || ')');
  END IF;

  -- ── Points deduction for live OR finished fixtures (DD-C3) ───────────────────
  -- A player benched during a live match loses their points scored so far.
  SELECT f.status INTO v_pout_status
  FROM fixtures f
  JOIN players pl ON (
    pl.forza_team_id = f.home_team_forza_id
    OR pl.forza_team_id = f.away_team_forza_id
  )
  WHERE pl.id = p_player_out
    AND f.round_number  = v_round_number
    AND f.tournament_id = v_tournament_id
  LIMIT 1;

  IF v_pout_status IN ('live', 'finished') THEN
    SELECT COALESCE(pms.fantasy_points, 0) INTO v_pout_pts
    FROM player_match_stats pms
    JOIN fixtures f ON pms.fixture_id = f.id
    WHERE pms.player_id = p_player_out
      AND f.round_number  = v_round_number
      AND f.tournament_id = v_tournament_id
    LIMIT 1;

    v_deduction := v_pout_pts;

    UPDATE fantasy_points
       SET total = GREATEST(total - ROUND(v_deduction::numeric), 0)
     WHERE squad_id    = p_squad_id
       AND matchday_id = v_matchday_id;
  END IF;

  -- Persist the swap and lock out p_player_out for this matchday
  UPDATE squads
  SET
    starting_xi  = v_new_xi,
    lineup_locks = jsonb_set(
      COALESCE(lineup_locks, '{}'::jsonb),
      ARRAY[v_matchday_id],
      (
        SELECT jsonb_agg(DISTINCT val)
        FROM (
          SELECT jsonb_array_elements_text(
            COALESCE(lineup_locks -> v_matchday_id, '[]'::jsonb)
          ) AS val
          UNION ALL
          SELECT p_player_out::text
        ) t
      )
    )
  WHERE id = p_squad_id;

  RETURN jsonb_build_object(
    'ok',         true,
    'starting_xi', to_jsonb(v_new_xi),
    'deduction',   v_deduction
  );
END;
$$;

-- ── 3. resolve_bet: add already-resolved guard (DD-C10) ───────────────────────

CREATE OR REPLACE FUNCTION resolve_bet(p_instance_id uuid, p_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_league_id    UUID;
  v_reward_value NUMERIC;
  v_reward_type  TEXT;
  v_status       TEXT;
  v_winners      INT;
  v_total        INT;
BEGIN
  SELECT league_id, reward_value, reward_type, status
    INTO v_league_id, v_reward_value, v_reward_type, v_status
    FROM bet_instances WHERE id = p_instance_id;

  IF v_league_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND');
  END IF;

  -- Prevent double-resolution (budget bets would double-credit otherwise)
  IF v_status = 'resolved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_RESOLVED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM league_members
     WHERE league_id = v_league_id
       AND user_id   = auth.uid()
       AND role      = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE answer = p_answer)
    INTO v_total, v_winners
    FROM bet_submissions WHERE bet_instance_id = p_instance_id;

  UPDATE bet_submissions
     SET is_correct     = (answer = p_answer),
         reward_awarded = CASE WHEN answer = p_answer THEN v_reward_value ELSE NULL END
   WHERE bet_instance_id = p_instance_id;

  IF v_reward_type = 'budget' THEN
    UPDATE squads
       SET budget_remaining = budget_remaining + v_reward_value
     WHERE id IN (
       SELECT squad_id FROM bet_submissions
        WHERE bet_instance_id = p_instance_id AND answer = p_answer
     );
  END IF;

  UPDATE bet_instances
     SET status            = 'resolved',
         correct_answer    = p_answer,
         winners_count     = v_winners,
         total_submissions = v_total
   WHERE id = p_instance_id;

  RETURN jsonb_build_object('ok', true, 'winners', v_winners, 'total', v_total,
                             'submissions_updated', v_total);
END;
$$;

-- ── 4. REVOKE direct chip column UPDATE from browser roles (DD-M11) ───────────
-- Chip state must only be set via the activate_chip / set_lineup RPCs (SECURITY DEFINER).

REVOKE UPDATE (is_wildcard, is_triple_captain, joker_player_id) ON squads FROM anon, authenticated;

-- ── 5. REVOKE execute_transfer_atomic from browser roles (DD-C1 hardening) ────
-- process-transfer edge function uses service_role key — not affected.

REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid,text,uuid,numeric)                              FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid,text,uuid,numeric,integer,integer)              FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid,text,uuid,numeric,integer,integer,integer)      FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid,text,uuid,numeric,integer,integer,integer,uuid,text) FROM authenticated, anon;

-- ── 6. Cancel stuck draft submissions for test leagues (NEW-C2) ───────────────
-- "E2E WC Draft" and "EPL_DRAFT_TEST" have pending submissions past deadline
-- that are stuck in an allocation loop (1 member each, allocation fails silently).
-- Cancelling stops the 5-min cron hammering the edge function.

-- draft_status enum has only 'pending'/'processed'; use 'processed' to stop the loop
UPDATE draft_submissions
   SET status = 'processed'
 WHERE status = 'pending'
   AND league_id IN (
     '3976afaf-c76b-4af0-836d-ca60a4c77551',  -- E2E WC Draft
     'aaaad001-0000-4000-a000-000000000001'    -- EPL_DRAFT_TEST
   );

-- ── 7. Backfill WC knockout round_number (NEW-C1 prerequisite) ────────────────
-- 32 WC 2026 knockout fixtures have round_number = NULL.
-- Assigned in kickoff_at order: rounds 4–8 matching WC 2026 knockout structure:
--   Round 4 = Round of 32 (16 matches), Round 5 = R16 (8),
--   Round 6 = QF (4), Round 7 = SF (2), Round 8 = 3P+Final (2).

WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (ORDER BY kickoff_at ASC, id ASC) AS rn
  FROM fixtures
  WHERE tournament_id = '429' AND round_number IS NULL
)
UPDATE fixtures f
   SET round_number = CASE
     WHEN r.rn <= 16 THEN 4
     WHEN r.rn <= 24 THEN 5
     WHEN r.rn <= 28 THEN 6
     WHEN r.rn <= 30 THEN 7
     ELSE 8
   END
  FROM ranked r
 WHERE f.id = r.id;

-- ── 8. Fix run-draft-lottery + run-reverse-standings-draft crons (DD-C4) ───────
-- Current crons send league_id + anon key → edge function validates JWT → 401.
-- Fix: send service-role key with empty body → edge function uses internal cron mode.

SELECT cron.unschedule('run-draft-lottery');
SELECT cron.schedule(
  'run-draft-lottery',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/run-draft-lottery',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
    ),
    body    := '{}'::jsonb
  );
  $$
);

SELECT cron.unschedule('run-reverse-standings-draft');
SELECT cron.schedule(
  'run-reverse-standings-draft',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/run-reverse-standings-draft',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
    ),
    body    := '{}'::jsonb
  );
  $$
);
