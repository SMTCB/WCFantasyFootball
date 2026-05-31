-- Migration 107: Starting XI and Bench — Phase B
-- Session 62 — Gameplay Engine.
--
-- Changes:
--   1. squads: add starting_xi TEXT[] and lineup_locks JSONB columns
--   2. league_config: seed lineup_lock_per_fixture for all existing leagues
--   3. set_lineup(p_squad_id, p_player_out, p_player_in) — atomic swap function
--   4. lock_lineups_for_fixture(p_fixture_id) — called from ingest-match-events
--      to mark players locked when their fixture goes live/finished
--
-- calculate-scores is updated separately (edge function v19).

-- ── 1. squads: starting_xi and lineup_locks ───────────────────────────────────
-- starting_xi: the 11 player IDs that score this round (subset of players[])
-- lineup_locks: { matchday_id: [player_id, ...] } — players who cannot re-enter XI

ALTER TABLE squads
  ADD COLUMN IF NOT EXISTS starting_xi  TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lineup_locks JSONB   NOT NULL DEFAULT '{}';

-- ── 2. league_config: lineup_lock_per_fixture ─────────────────────────────────

INSERT INTO league_config (league_id, config_key, config_value)
SELECT l.id, 'lineup_lock_per_fixture', 'true'::jsonb
FROM leagues l
ON CONFLICT (league_id, config_key) DO NOTHING;

-- ── 3. set_lineup ─────────────────────────────────────────────────────────────
-- Atomically swaps p_player_out (bench) for p_player_in (XI), enforcing:
--   • ownership
--   • lock-out (subbed-out player cannot re-enter this matchday)
--   • fixture completion (cannot sub in player whose match is finished)
--   • formation validity (1GK, 3–5 DEF, 2–5 MID, 1–3 FWD)
--   • points deduction if p_player_out scored before being moved to bench
--
-- Auto-initialises starting_xi from players[1..11] if the column is empty.

CREATE OR REPLACE FUNCTION set_lineup(
  p_squad_id   uuid,
  p_player_out uuid,   -- player being moved to bench
  p_player_in  uuid    -- player being moved to XI
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

  v_matchday_id  := v_squad.matchday_id;
  v_round_number := (regexp_match(v_matchday_id, '-r(\d+)$'))[1]::int;

  SELECT tournament_id INTO v_tournament_id
  FROM leagues WHERE id = v_squad.league_id;

  -- Auto-initialise starting_xi from players array if it's empty
  IF array_length(v_squad.starting_xi, 1) IS NULL OR array_length(v_squad.starting_xi, 1) = 0 THEN
    v_squad.starting_xi := v_squad.players[1:11];
  END IF;

  -- Current locked-out players for this matchday
  v_lock_array := ARRAY(
    SELECT jsonb_array_elements_text(
      COALESCE(v_squad.lineup_locks -> v_matchday_id, '[]'::jsonb)
    )
  );

  -- ── Validation ──────────────────────────────────────────────────────────────

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

  -- 5. p_player_in fixture not completed this round (cannot sub in a player who has played)
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

  IF v_pin_status = 'finished' THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'FIXTURE_COMPLETED',
      'error', 'Cannot sub in a player whose fixture has already finished this round'
    );
  END IF;

  -- ── Build new XI ─────────────────────────────────────────────────────────────

  SELECT ARRAY_AGG(CASE WHEN x = p_player_out::text THEN p_player_in::text ELSE x END ORDER BY ord)
    INTO v_new_xi
    FROM unnest(v_squad.starting_xi) WITH ORDINALITY AS t(x, ord);

  -- 6. Formation validity on the new XI
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

  -- ── Points deduction if p_player_out's fixture is finished ───────────────────

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

  IF v_pout_status = 'finished' THEN
    SELECT COALESCE(pms.fantasy_points, 0) INTO v_pout_pts
    FROM player_match_stats pms
    JOIN fixtures f ON pms.fixture_id = f.id
    WHERE pms.player_id = p_player_out
      AND f.round_number  = v_round_number
      AND f.tournament_id = v_tournament_id
    LIMIT 1;

    v_deduction := v_pout_pts;

    -- Deduct from fantasy_points (floor at 0 — cannot go negative)
    UPDATE fantasy_points
       SET total = GREATEST(total - ROUND(v_deduction::numeric), 0)
     WHERE squad_id    = p_squad_id
       AND matchday_id = v_matchday_id;
  END IF;

  -- ── Persist the swap ─────────────────────────────────────────────────────────
  -- Add p_player_out to lineup_locks[matchday_id] so they cannot return this round.

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

GRANT EXECUTE ON FUNCTION set_lineup(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION set_lineup(uuid, uuid, uuid) TO service_role;

-- ── 4. lock_lineups_for_fixture ───────────────────────────────────────────────
-- Called from ingest-match-events after stats are written.
-- Marks all players from a live/finished fixture as locked in lineup_locks
-- so the UI can show the padlock icon and set_lineup can enforce the lock.

CREATE OR REPLACE FUNCTION lock_lineups_for_fixture(p_fixture_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fixture       fixtures;
  v_matchday_id   text;
  v_pids          text[];
  v_squad_row     RECORD;
  v_existing_lock jsonb;
  v_new_lock_arr  jsonb;
BEGIN
  SELECT * INTO v_fixture FROM fixtures WHERE id = p_fixture_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Only lock when fixture is live or finished
  IF v_fixture.status NOT IN ('live', 'finished') THEN RETURN; END IF;

  -- Both team IDs must be set for the join to work
  IF v_fixture.home_team_forza_id IS NULL OR v_fixture.away_team_forza_id IS NULL THEN
    RETURN;
  END IF;

  v_matchday_id := v_fixture.tournament_id || '-r' || v_fixture.round_number;

  -- All players on both teams for this fixture
  SELECT ARRAY_AGG(DISTINCT id::text)
    INTO v_pids
    FROM players
   WHERE forza_team_id IN (v_fixture.home_team_forza_id, v_fixture.away_team_forza_id);

  IF v_pids IS NULL OR array_length(v_pids, 1) = 0 THEN RETURN; END IF;

  -- For each squad pinned to this matchday that has any of these players in starting_xi,
  -- add those players to lineup_locks[matchday_id]
  FOR v_squad_row IN
    SELECT id, starting_xi, lineup_locks
    FROM   squads
    WHERE  matchday_id = v_matchday_id
      AND  starting_xi && v_pids    -- overlap operator: true if any element in common
  LOOP
    v_existing_lock := COALESCE(v_squad_row.lineup_locks -> v_matchday_id, '[]'::jsonb);

    -- Union existing locks with players from this fixture that are in the XI
    SELECT jsonb_agg(DISTINCT val) INTO v_new_lock_arr
    FROM (
      SELECT jsonb_array_elements_text(v_existing_lock) AS val
      UNION ALL
      SELECT xi FROM unnest(v_squad_row.starting_xi) AS xi
      WHERE  xi = ANY(v_pids)
    ) t;

    UPDATE squads
    SET lineup_locks = jsonb_set(
      COALESCE(lineup_locks, '{}'::jsonb),
      ARRAY[v_matchday_id],
      COALESCE(v_new_lock_arr, '[]'::jsonb)
    )
    WHERE id = v_squad_row.id;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION lock_lineups_for_fixture(text) TO service_role;
