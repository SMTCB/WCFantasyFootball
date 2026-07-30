-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 243 — ADMIN-1: Clubhouse/competition admin ownership model
--
-- Product decision (2026-07-27, BACKLOG.md ADMIN-1):
--   1. A Clubhouse (circle) owner is always admin of every competition inside
--      that Clubhouse.
--   2. A competition's creator is admin of that specific competition.
--   3. A central panel at Clubhouse-admin level lets the owner view/assign/
--      remove the admin on every competition in the Clubhouse.
--
-- Scope: leagues, paddocks (F1), player_boxes (tennis) — all three already
-- carry created_by + circle_id, so no schema gap, just missing wiring.
--
-- tennis_tournaments is NOT in scope for the per-Clubhouse model — it is
-- shared global platform data (same relationship f1_races has to the global
-- users.is_admin flag), not owned by any single Clubhouse. Per the confirmed
-- decision, TENNIS-ADMIN-GAP's 9 admin RPCs (migration 200) are unblocked by
-- gating them on users.is_admin, mirroring F1AdminScreen.jsx's existing
-- pattern, instead of forcing a fictitious per-Clubhouse ownership onto them.
--
-- Run from the Supabase-linked PC:
--   npx supabase db query --linked --file supabase/migrations/243_competition_admin_model.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. competition_admins table ──────────────────────────────────────────────
-- Explicit per-competition admin assignments beyond the automatic
-- creator/circle-owner inheritance. No RLS policies — all access goes
-- through the SECURITY DEFINER RPCs below.

CREATE TABLE IF NOT EXISTS public.competition_admins (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_type text NOT NULL CHECK (competition_type IN ('league', 'paddock', 'player_box')),
  competition_id   uuid NOT NULL,
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by      uuid REFERENCES auth.users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (competition_type, competition_id, user_id)
);

ALTER TABLE public.competition_admins ENABLE ROW LEVEL SECURITY;

-- ─── 2. is_competition_admin ──────────────────────────────────────────────────
-- Canonical reusable check: true if the caller has an explicit
-- competition_admins row, OR is the competition's creator (plus
-- league_members.role='commissioner' for leagues, reconciling the two
-- existing commissioner representations), OR is circle_members.role='owner'
-- of the circle that competition is linked to.

CREATE OR REPLACE FUNCTION is_competition_admin(
  p_competition_type text,
  p_competition_id   uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM competition_admins
    WHERE competition_type = p_competition_type
      AND competition_id   = p_competition_id
      AND user_id          = v_user_id
  ) THEN
    RETURN true;
  END IF;

  IF p_competition_type = 'league' THEN
    RETURN EXISTS (
      SELECT 1 FROM leagues l
      WHERE l.id = p_competition_id
        AND (
          l.created_by = v_user_id
          OR EXISTS (
            SELECT 1 FROM league_members lm
            WHERE lm.league_id = l.id AND lm.user_id = v_user_id AND lm.role = 'commissioner'
          )
          OR (l.circle_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM circle_members cm
            WHERE cm.circle_id = l.circle_id AND cm.user_id = v_user_id AND cm.role = 'owner'
          ))
        )
    );
  ELSIF p_competition_type = 'paddock' THEN
    RETURN EXISTS (
      SELECT 1 FROM paddocks p
      WHERE p.id = p_competition_id
        AND (
          p.created_by = v_user_id
          OR (p.circle_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM circle_members cm
            WHERE cm.circle_id = p.circle_id AND cm.user_id = v_user_id AND cm.role = 'owner'
          ))
        )
    );
  ELSIF p_competition_type = 'player_box' THEN
    RETURN EXISTS (
      SELECT 1 FROM player_boxes pb
      WHERE pb.id = p_competition_id
        AND (
          pb.created_by = v_user_id
          OR (pb.circle_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM circle_members cm
            WHERE cm.circle_id = pb.circle_id AND cm.user_id = v_user_id AND cm.role = 'owner'
          ))
        )
    );
  END IF;

  RETURN false;
END;
$$;

-- ─── 3. get_circle_competition_admins ─────────────────────────────────────────
-- Owner-only. Returns every league/paddock/player_box linked to the circle,
-- each with its creator and any explicitly-assigned extra admins. Mirrors
-- get_clubhouse_competitions' join shape (migration 216).

CREATE OR REPLACE FUNCTION get_circle_competition_admins(p_circle_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = v_user_id AND role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  RETURN json_build_object(
    'leagues', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', l.id,
        'name', l.name,
        'creator_id', l.created_by,
        'creator_username', cu.username,
        'assigned_admins', (
          SELECT COALESCE(json_agg(json_build_object('user_id', au.id, 'username', au.username) ORDER BY au.username), '[]'::json)
          FROM competition_admins ca
          JOIN users au ON au.id = ca.user_id
          WHERE ca.competition_type = 'league' AND ca.competition_id = l.id
        )
      ) ORDER BY l.name), '[]'::json)
      FROM circle_leagues cl
      JOIN leagues l ON l.id = cl.league_id
      LEFT JOIN users cu ON cu.id = l.created_by
      WHERE cl.circle_id = p_circle_id
    ),
    'f1', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', p.id,
        'name', p.name,
        'creator_id', p.created_by,
        'creator_username', cu.username,
        'assigned_admins', (
          SELECT COALESCE(json_agg(json_build_object('user_id', au.id, 'username', au.username) ORDER BY au.username), '[]'::json)
          FROM competition_admins ca
          JOIN users au ON au.id = ca.user_id
          WHERE ca.competition_type = 'paddock' AND ca.competition_id = p.id
        )
      ) ORDER BY p.name), '[]'::json)
      FROM circle_paddocks cp
      JOIN paddocks p ON p.id = cp.paddock_id
      LEFT JOIN users cu ON cu.id = p.created_by
      WHERE cp.circle_id = p_circle_id
    ),
    'tennis', (
      SELECT COALESCE(json_agg(json_build_object(
        'id', pb.id,
        'name', pb.name,
        'creator_id', pb.created_by,
        'creator_username', cu.username,
        'assigned_admins', (
          SELECT COALESCE(json_agg(json_build_object('user_id', au.id, 'username', au.username) ORDER BY au.username), '[]'::json)
          FROM competition_admins ca
          JOIN users au ON au.id = ca.user_id
          WHERE ca.competition_type = 'player_box' AND ca.competition_id = pb.id
        )
      ) ORDER BY pb.name), '[]'::json)
      FROM circle_player_boxes cpb
      JOIN player_boxes pb ON pb.id = cpb.player_box_id
      LEFT JOIN users cu ON cu.id = pb.created_by
      WHERE cpb.circle_id = p_circle_id
    )
  );
END;
$$;

-- ─── 4. set_competition_admin ─────────────────────────────────────────────────
-- Owner-only. Assigns an extra admin to a competition already linked to the
-- circle. Target must be a circle member. Idempotent.

CREATE OR REPLACE FUNCTION set_competition_admin(
  p_circle_id        uuid,
  p_competition_type text,
  p_competition_id   uuid,
  p_user_id          uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_linked  boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = v_user_id AND role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  IF p_competition_type NOT IN ('league', 'paddock', 'player_box') THEN
    RETURN json_build_object('error', 'INVALID_TYPE');
  END IF;

  IF p_competition_type = 'league' THEN
    v_linked := EXISTS (SELECT 1 FROM circle_leagues WHERE circle_id = p_circle_id AND league_id = p_competition_id);
  ELSIF p_competition_type = 'paddock' THEN
    v_linked := EXISTS (SELECT 1 FROM circle_paddocks WHERE circle_id = p_circle_id AND paddock_id = p_competition_id);
  ELSE
    v_linked := EXISTS (SELECT 1 FROM circle_player_boxes WHERE circle_id = p_circle_id AND player_box_id = p_competition_id);
  END IF;

  IF NOT v_linked THEN
    RETURN json_build_object('error', 'NOT_LINKED_TO_CIRCLE');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = p_user_id
  ) THEN
    RETURN json_build_object('error', 'TARGET_NOT_CIRCLE_MEMBER');
  END IF;

  INSERT INTO competition_admins (competition_type, competition_id, user_id, assigned_by)
  VALUES (p_competition_type, p_competition_id, p_user_id, v_user_id)
  ON CONFLICT (competition_type, competition_id, user_id) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;

-- ─── 5. remove_competition_admin ──────────────────────────────────────────────
-- Owner-only. Removes an explicit admin assignment. The inherent
-- creator/circle-owner admin isn't stored in this table, so there's nothing
-- to remove for them — only explicitly-assigned extra admins are removable.

CREATE OR REPLACE FUNCTION remove_competition_admin(
  p_circle_id        uuid,
  p_competition_type text,
  p_competition_id   uuid,
  p_user_id          uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_linked  boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = v_user_id AND role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  IF p_competition_type = 'league' THEN
    v_linked := EXISTS (SELECT 1 FROM circle_leagues WHERE circle_id = p_circle_id AND league_id = p_competition_id);
  ELSIF p_competition_type = 'paddock' THEN
    v_linked := EXISTS (SELECT 1 FROM circle_paddocks WHERE circle_id = p_circle_id AND paddock_id = p_competition_id);
  ELSIF p_competition_type = 'player_box' THEN
    v_linked := EXISTS (SELECT 1 FROM circle_player_boxes WHERE circle_id = p_circle_id AND player_box_id = p_competition_id);
  END IF;

  IF NOT v_linked THEN
    RETURN json_build_object('error', 'NOT_LINKED_TO_CIRCLE');
  END IF;

  DELETE FROM competition_admins
  WHERE competition_type = p_competition_type
    AND competition_id   = p_competition_id
    AND user_id          = p_user_id;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION is_competition_admin(text, uuid)               FROM public, anon;
REVOKE ALL ON FUNCTION get_circle_competition_admins(uuid)            FROM public, anon;
REVOKE ALL ON FUNCTION set_competition_admin(uuid, text, uuid, uuid)  FROM public, anon;
REVOKE ALL ON FUNCTION remove_competition_admin(uuid, text, uuid, uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION is_competition_admin(text, uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION get_circle_competition_admins(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION set_competition_admin(uuid, text, uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION remove_competition_admin(uuid, text, uuid, uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ─── 6. TENNIS-ADMIN-GAP: gate the 9 tennis admin RPCs on users.is_admin ──────
--
-- tennis_tournaments is global shared platform data (like f1_races), not
-- owned by any single Clubhouse — so these stay on the platform-admin model,
-- mirroring F1AdminScreen.jsx's existing users.is_admin gate, rather than
-- being folded into is_competition_admin(). Full bodies reproduced from
-- migration 200 (migrations are append-only) with one addition: a leading
-- UNAUTHORIZED guard, plus SET search_path = public now that these are
-- reachable by `authenticated` instead of only `service_role`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION admin_open_tournament(
  p_tournament_id   uuid,
  p_roster_lock_at  timestamptz,
  p_external_id     int DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
  )) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

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

CREATE OR REPLACE FUNCTION admin_start_tournament(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
  )) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE tennis_tournaments
  SET status = 'in_progress'
  WHERE id = p_tournament_id AND status = 'roster_open';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_IN_ROSTER_OPEN_STATUS';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'in_progress');
END;
$$;

CREATE OR REPLACE FUNCTION admin_seed_tournament_players(
  p_tournament_id uuid,
  p_players       jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count   int := 0;
  v_player  jsonb;
  v_tid     uuid := p_tournament_id;
BEGIN
  IF NOT (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
  )) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

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

CREATE OR REPLACE FUNCTION admin_enter_round_results(
  p_tournament_id uuid,
  p_eliminations  jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry      jsonb;
  v_player_id  uuid;
  v_round      text;
  v_rounds_won int;
  v_count      int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
  )) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

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

  RETURN jsonb_build_object('ok', true, 'eliminations_recorded', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION admin_open_qf_window(
  p_tournament_id     uuid,
  p_opens_at          timestamptz,
  p_closes_at         timestamptz
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
  )) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

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

CREATE OR REPLACE FUNCTION admin_set_champion(
  p_tournament_id uuid,
  p_player_id     uuid,
  p_rounds_won    int
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
  )) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

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

CREATE OR REPLACE FUNCTION admin_complete_tournament(p_tournament_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
  )) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  UPDATE tennis_tournaments
  SET status = 'completed'
  WHERE id = p_tournament_id AND status IN ('qf_captain_open', 'in_progress');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_IN_SCOREABLE_STATE';
  END IF;

  RETURN jsonb_build_object('ok', true, 'status', 'completed');
END;
$$;

CREATE OR REPLACE FUNCTION admin_seed_atp_finals_matches(
  p_season_year int,
  p_matches     jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entry   jsonb;
  v_count   int := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
  )) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

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

CREATE OR REPLACE FUNCTION admin_enter_atp_finals_result(
  p_season_year    int,
  p_match_number   int,
  p_winner_player_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (auth.role() = 'service_role' OR EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND is_admin = true
  )) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

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

-- Now that each function checks users.is_admin internally, grant EXECUTE to
-- authenticated as well (service_role keeps its existing grant from
-- migration 200; anon stays revoked).

GRANT EXECUTE ON FUNCTION admin_open_tournament(uuid, timestamptz, int)       TO authenticated;
GRANT EXECUTE ON FUNCTION admin_start_tournament(uuid)                         TO authenticated;
GRANT EXECUTE ON FUNCTION admin_seed_tournament_players(uuid, jsonb)           TO authenticated;
GRANT EXECUTE ON FUNCTION admin_enter_round_results(uuid, jsonb)               TO authenticated;
GRANT EXECUTE ON FUNCTION admin_open_qf_window(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_champion(uuid, uuid, int)                  TO authenticated;
GRANT EXECUTE ON FUNCTION admin_complete_tournament(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION admin_seed_atp_finals_matches(int, jsonb)            TO authenticated;
GRANT EXECUTE ON FUNCTION admin_enter_atp_finals_result(int, int, uuid)        TO authenticated;

COMMIT;
