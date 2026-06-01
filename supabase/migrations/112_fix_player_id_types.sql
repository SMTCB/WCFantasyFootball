-- Migration 112: Fix player_id type UUID→TEXT in execute_transfer_atomic and set_lineup
--
-- Root cause: players.id is TEXT PRIMARY KEY, but both functions declared
-- p_player_id / p_player_out / p_player_in as UUID.  PostgreSQL tries to cast
-- Forza-format IDs like "fp-740833-428" to UUID and raises:
--   "invalid input syntax for type uuid: 'fp-740833-428'"
--
-- This breaks every bench-swap, sell, and buy for WC players.
--
-- Also fixes set_lineup auto-init to sort GKs first (prevents squads where
-- the first 11 in players[] are all non-GK), and backfills existing squads
-- whose starting_xi has no goalkeeper.

-- ── 1. Drop old signatures ────────────────────────────────────────────────────
-- PostgreSQL identifies functions by name + parameter types; changing uuid→text
-- creates a new overload, so we must DROP the old uuid-param version first.

DROP FUNCTION IF EXISTS execute_transfer_atomic(uuid, text, uuid, numeric, int, int, int, uuid, text);
DROP FUNCTION IF EXISTS set_lineup(uuid, uuid, uuid);

-- ── 2. execute_transfer_atomic: p_player_id text (was uuid) ──────────────────

CREATE OR REPLACE FUNCTION execute_transfer_atomic(
  p_squad_id    uuid,
  p_action      text,
  p_player_id   text,          -- was uuid; players.id is TEXT PRIMARY KEY
  p_price       numeric,       -- kept for API compat; ignored — price looked up from DB
  p_pos_limit   int  DEFAULT 99,
  p_squad_max   int  DEFAULT 99,
  p_club_max    int  DEFAULT 99,
  p_league_id   uuid DEFAULT NULL,
  p_matchday_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_squad               squads;
  v_new_players         text[];    -- was uuid[] — must match squads.players TEXT[]
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

-- ── 3. set_lineup: p_player_out/in text (was uuid); GK-first auto-init ───────

CREATE OR REPLACE FUNCTION set_lineup(
  p_squad_id   uuid,
  p_player_out text,   -- was uuid; players.id is TEXT PRIMARY KEY
  p_player_in  text    -- was uuid; players.id is TEXT PRIMARY KEY
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

  -- Auto-init starting_xi: sort GKs first so the XI always includes the goalkeeper.
  -- Persist the corrected XI immediately so subsequent calls skip auto-init.
  IF array_length(v_squad.starting_xi, 1) IS NULL OR array_length(v_squad.starting_xi, 1) = 0 THEN
    SELECT ARRAY_AGG(id) INTO v_squad.starting_xi
    FROM (
      SELECT id FROM players
      WHERE id = ANY(v_squad.players)
      ORDER BY (position = 'GK') DESC, array_position(v_squad.players, id)
      LIMIT 11
    ) sub;
    UPDATE squads SET starting_xi = v_squad.starting_xi WHERE id = p_squad_id;
  END IF;

  v_lock_array := ARRAY(
    SELECT jsonb_array_elements_text(
      COALESCE(v_squad.lineup_locks -> v_matchday_id, '[]'::jsonb)
    )
  );

  -- ── Validation ───────────────────────────────────────────────────────────────

  -- 1. p_player_in owned by this squad
  IF NOT (v_squad.players @> ARRAY[p_player_in]) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
  END IF;

  -- 2. p_player_in NOT locked out from this matchday
  IF p_player_in = ANY(v_lock_array) THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'PLAYER_LOCKED',
      'error', 'This player was already subbed out this round and cannot return until next matchday'
    );
  END IF;

  -- 3. p_player_in is currently on bench (not already in the XI)
  IF p_player_in = ANY(v_squad.starting_xi) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player is already in the starting XI');
  END IF;

  -- 4. p_player_out is currently in the XI
  IF NOT (p_player_out = ANY(v_squad.starting_xi)) THEN
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

  -- ── Build new XI ─────────────────────────────────────────────────────────────

  SELECT ARRAY_AGG(CASE WHEN x = p_player_out THEN p_player_in ELSE x END ORDER BY ord)
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
  WHERE id = ANY(v_new_xi);

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

    UPDATE fantasy_points
       SET total = GREATEST(total - ROUND(v_deduction::numeric), 0)
     WHERE squad_id    = p_squad_id
       AND matchday_id = v_matchday_id;
  END IF;

  -- ── Persist the swap ─────────────────────────────────────────────────────────

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
          SELECT p_player_out
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

-- ── 4. Grants ─────────────────────────────────────────────────────────────────

-- execute_transfer_atomic: service_role only (anon/authenticated call it via
-- the process-transfer Edge Function, not directly — DD-C1 hardening from 108).
GRANT EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) FROM anon;

-- set_lineup: called directly from the client with the user's JWT.
GRANT EXECUTE ON FUNCTION set_lineup(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION set_lineup(uuid, text, text) TO service_role;

-- ── 5. Backfill: fix existing squads whose starting_xi has no GK ─────────────
-- Reorders starting_xi to put GK first, preserving relative order for the
-- other 10 players.  Only updates squads that have ≥11 players and a GK
-- somewhere in the squad but NOT in the current starting_xi.

UPDATE squads s
SET starting_xi = (
  SELECT ARRAY_AGG(id)
  FROM (
    SELECT id FROM players
    WHERE id = ANY(s.players)
    ORDER BY (position = 'GK') DESC, array_position(s.players, id)
    LIMIT 11
  ) sub
)
WHERE
  array_length(s.players, 1) >= 11
  AND (
    array_length(s.starting_xi, 1) IS NULL
    OR array_length(s.starting_xi, 1) = 0
    OR NOT EXISTS (
      SELECT 1 FROM players p
      WHERE p.id = ANY(s.starting_xi) AND p.position = 'GK'
    )
  )
  AND EXISTS (
    SELECT 1 FROM players p
    WHERE p.id = ANY(s.players) AND p.position = 'GK'
  );
