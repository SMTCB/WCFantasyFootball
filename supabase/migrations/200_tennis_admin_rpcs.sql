-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 200 — Tennis Module: Admin RPCs (Sprint T-2)
-- Sprint T-2 (Phase 2, v2 branch only)
--
-- All admin functions are SECURITY DEFINER + restricted to service_role.
-- They are called from the TennisAdminPanel via supabase.functions.invoke
-- (Edge Function carries service-role JWT) or direct admin RPC with service key.
--
-- Status transition map:
--   upcoming → roster_open  (admin_open_tournament)
--   roster_open → in_progress  (admin_start_tournament)
--   in_progress → qf_captain_open  (admin_open_qf_window)
--   qf_captain_open → completed  (admin_complete_tournament — score Edge Function calls this)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. admin_open_tournament ────────────────────────────────────────────────
-- Opens roster submissions. Optionally records the API's external tournament ID.
-- Sets roster_lock_at; admin can update it again before lock fires.

CREATE OR REPLACE FUNCTION admin_open_tournament(
  p_tournament_id   uuid,
  p_roster_lock_at  timestamptz,
  p_external_id     int DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_name text;
BEGIN
  SELECT name INTO v_name
  FROM tennis_tournaments
  WHERE id = p_tournament_id AND status = 'upcoming';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND_OR_ALREADY_OPEN';
  END IF;

  UPDATE tennis_tournaments
  SET
    status          = 'roster_open',
    roster_lock_at  = p_roster_lock_at,
    external_id     = COALESCE(p_external_id, external_id)
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object('ok', true, 'name', v_name, 'status', 'roster_open');
END;
$$;

-- ── 2. admin_start_tournament ───────────────────────────────────────────────
-- Locks rosters and marks tournament in_progress (play has begun).
-- Called after roster_lock_at passes (or manually by admin).

CREATE OR REPLACE FUNCTION admin_start_tournament(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE tennis_tournaments
  SET status = 'in_progress'
  WHERE id = p_tournament_id AND status = 'roster_open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_ROSTER_OPEN_STATUS';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'in_progress');
END;
$$;

-- ── 3. admin_seed_tournament_players ────────────────────────────────────────
-- Batch upsert players into a tournament.
-- p_players: [{player_name, nationality, seed, tier, external_player_id}]
-- external_player_id may be null (manual entry) or an API player ID.
-- Idempotent: ON CONFLICT (tournament_id, player_name) DO UPDATE.

CREATE OR REPLACE FUNCTION admin_seed_tournament_players(
  p_tournament_id uuid,
  p_players       jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count   int := 0;
  v_player  jsonb;
  v_tid     uuid := p_tournament_id;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tennis_tournaments WHERE id = v_tid AND status != 'completed') THEN
    RAISE EXCEPTION 'TOURNAMENT_COMPLETED_OR_NOT_FOUND';
  END IF;

  FOR v_player IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    INSERT INTO tennis_tournament_players (
      tournament_id, player_name, nationality, seed, tier, external_player_id
    ) VALUES (
      v_tid,
      v_player->>'player_name',
      v_player->>'nationality',
      (v_player->>'seed')::int,
      (v_player->>'tier')::int,
      (v_player->>'external_player_id')::int
    )
    ON CONFLICT (tournament_id, player_name) DO UPDATE SET
      nationality        = EXCLUDED.nationality,
      seed               = EXCLUDED.seed,
      tier               = EXCLUDED.tier,
      external_player_id = COALESCE(EXCLUDED.external_player_id, tennis_tournament_players.external_player_id);

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'upserted', v_count);
END;
$$;

-- ── 4. admin_enter_round_results ────────────────────────────────────────────
-- Records eliminations after a round completes.
-- p_eliminations: [{player_id, round_reached, rounds_won}]
-- Marks eliminated=true for each player; surviving players untouched.
-- When all QF losers are entered (round_reached='qf'), admin then calls
-- admin_open_qf_window to allow captain selection.

CREATE OR REPLACE FUNCTION admin_enter_round_results(
  p_tournament_id uuid,
  p_eliminations  jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entry      jsonb;
  v_player_id  uuid;
  v_round      text;
  v_rounds_won int;
  v_count      int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tennis_tournaments
    WHERE id = p_tournament_id AND status IN ('in_progress', 'qf_captain_open')
  ) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_IN_PROGRESS';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_eliminations) LOOP
    v_player_id  := (v_entry->>'player_id')::uuid;
    v_round      := v_entry->>'round_reached';
    v_rounds_won := ((v_entry->>'rounds_won')::int);

    UPDATE tennis_tournament_players
    SET
      eliminated   = true,
      round_reached = v_round,
      rounds_won   = v_rounds_won
    WHERE id = v_player_id AND tournament_id = p_tournament_id;

    v_count := v_count + 1;
  END LOOP;

  -- Mark champion (rounds_won highest player, not eliminated)
  -- Champion is set separately by admin_set_champion when tournament ends
  RETURN jsonb_build_object('ok', true, 'eliminations_recorded', v_count);
END;
$$;

-- ── 5. admin_open_qf_window ─────────────────────────────────────────────────
-- Opens the 48h QF captain selection window.
-- Admin sets both open and close timestamps.

CREATE OR REPLACE FUNCTION admin_open_qf_window(
  p_tournament_id     uuid,
  p_opens_at          timestamptz,
  p_closes_at         timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE tennis_tournaments
  SET
    status              = 'qf_captain_open',
    qf_window_opens_at  = p_opens_at,
    qf_window_closes_at = p_closes_at
  WHERE id = p_tournament_id AND status = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_IN_PROGRESS';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'qf_captain_open',
    'opens_at', p_opens_at, 'closes_at', p_closes_at);
END;
$$;

-- ── 6. admin_set_champion ───────────────────────────────────────────────────
-- Records the champion's final round_reached='champion' and rounds_won.
-- Does NOT complete the tournament — scoring Edge Function does that.

CREATE OR REPLACE FUNCTION admin_set_champion(
  p_tournament_id uuid,
  p_player_id     uuid,
  p_rounds_won    int
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_name text;
BEGIN
  UPDATE tennis_tournament_players
  SET
    round_reached = 'champion',
    rounds_won    = p_rounds_won,
    eliminated    = false
  WHERE id = p_player_id AND tournament_id = p_tournament_id
  RETURNING player_name INTO v_name;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PLAYER_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object('ok', true, 'champion', v_name);
END;
$$;

-- ── 7. admin_complete_tournament ─────────────────────────────────────────────
-- Marks tournament completed. Called by score-tennis-tournament Edge Function
-- after all scores are written. Can also be called directly by admin.

CREATE OR REPLACE FUNCTION admin_complete_tournament(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE tennis_tournaments
  SET status = 'completed'
  WHERE id = p_tournament_id AND status IN ('qf_captain_open', 'in_progress');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_IN_SCOREABLE_STATE';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'completed');
END;
$$;

-- ── 8. ATP Finals admin RPCs ─────────────────────────────────────────────────

-- Seed the 15-match prediction slate (admin enters pairings before tournament)
-- p_matches: [{match_number, match_type, player_a_id, player_b_id}]
CREATE OR REPLACE FUNCTION admin_seed_atp_finals_matches(
  p_season_year int,
  p_matches     jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entry   jsonb;
  v_count   int := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tennis_seasons WHERE year = p_season_year) THEN
    RAISE EXCEPTION 'SEASON_NOT_FOUND';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_matches) LOOP
    INSERT INTO tennis_atp_finals_matches (
      season_year, match_number, match_type, player_a_id, player_b_id
    ) VALUES (
      p_season_year,
      (v_entry->>'match_number')::int,
      v_entry->>'match_type',
      (v_entry->>'player_a_id')::uuid,
      (v_entry->>'player_b_id')::uuid
    )
    ON CONFLICT (season_year, match_number) DO UPDATE SET
      match_type  = EXCLUDED.match_type,
      player_a_id = EXCLUDED.player_a_id,
      player_b_id = EXCLUDED.player_b_id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'matches_seeded', v_count);
END;
$$;

-- Record a single ATP Finals match result
CREATE OR REPLACE FUNCTION admin_enter_atp_finals_result(
  p_season_year    int,
  p_match_number   int,
  p_winner_player_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE tennis_atp_finals_matches
  SET
    winner_player_id  = p_winner_player_id,
    result_entered_at = now()
  WHERE season_year = p_season_year AND match_number = p_match_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'MATCH_NOT_FOUND';
  END IF;

  RETURN jsonb_build_object('ok', true, 'match_number', p_match_number,
    'winner_player_id', p_winner_player_id);
END;
$$;

-- ── 9. Restrict all admin functions to service_role ───────────────────────────

REVOKE ALL ON FUNCTION admin_open_tournament(uuid, timestamptz, int)      FROM public, authenticated, anon;
REVOKE ALL ON FUNCTION admin_start_tournament(uuid)                        FROM public, authenticated, anon;
REVOKE ALL ON FUNCTION admin_seed_tournament_players(uuid, jsonb)          FROM public, authenticated, anon;
REVOKE ALL ON FUNCTION admin_enter_round_results(uuid, jsonb)              FROM public, authenticated, anon;
REVOKE ALL ON FUNCTION admin_open_qf_window(uuid, timestamptz, timestamptz) FROM public, authenticated, anon;
REVOKE ALL ON FUNCTION admin_set_champion(uuid, uuid, int)                 FROM public, authenticated, anon;
REVOKE ALL ON FUNCTION admin_complete_tournament(uuid)                     FROM public, authenticated, anon;
REVOKE ALL ON FUNCTION admin_seed_atp_finals_matches(int, jsonb)           FROM public, authenticated, anon;
REVOKE ALL ON FUNCTION admin_enter_atp_finals_result(int, int, uuid)       FROM public, authenticated, anon;

GRANT EXECUTE ON FUNCTION admin_open_tournament(uuid, timestamptz, int)       TO service_role;
GRANT EXECUTE ON FUNCTION admin_start_tournament(uuid)                         TO service_role;
GRANT EXECUTE ON FUNCTION admin_seed_tournament_players(uuid, jsonb)           TO service_role;
GRANT EXECUTE ON FUNCTION admin_enter_round_results(uuid, jsonb)               TO service_role;
GRANT EXECUTE ON FUNCTION admin_open_qf_window(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION admin_set_champion(uuid, uuid, int)                  TO service_role;
GRANT EXECUTE ON FUNCTION admin_complete_tournament(uuid)                      TO service_role;
GRANT EXECUTE ON FUNCTION admin_seed_atp_finals_matches(int, jsonb)            TO service_role;
GRANT EXECUTE ON FUNCTION admin_enter_atp_finals_result(int, int, uuid)        TO service_role;
