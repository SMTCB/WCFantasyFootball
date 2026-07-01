-- ✅ APPLIED TO PRODUCTION 2026-06-28 (TRACKER row: session note 2026-06-28)
-- Migration 215: Clubhouse-centric model — direct circle_id FK on competition tables
-- Adds a nullable circle_id column to leagues, paddocks, and player_boxes so each
-- competition can be directly queried by Clubhouse without joining via junction tables.
-- Updates create_paddock, create_player_box, and create_league to write circle_id at
-- INSERT time (in addition to the junction row for backwards compatibility).
-- Backfills circle_id from existing junction rows.

-- ── 1. Add circle_id FK (nullable) to competition tables ─────────────────────

ALTER TABLE leagues      ADD COLUMN IF NOT EXISTS circle_id uuid REFERENCES circles(id);
ALTER TABLE paddocks     ADD COLUMN IF NOT EXISTS circle_id uuid REFERENCES circles(id);
ALTER TABLE player_boxes ADD COLUMN IF NOT EXISTS circle_id uuid REFERENCES circles(id);

-- ── 2. Backfill from junction tables ─────────────────────────────────────────

UPDATE leagues l
SET circle_id = cl.circle_id
FROM circle_leagues cl
WHERE cl.league_id = l.id AND l.circle_id IS NULL;

UPDATE paddocks p
SET circle_id = cp.circle_id
FROM circle_paddocks cp
WHERE cp.paddock_id = p.id AND p.circle_id IS NULL;

UPDATE player_boxes pb
SET circle_id = cpb.circle_id
FROM circle_player_boxes cpb
WHERE cpb.player_box_id = pb.id AND pb.circle_id IS NULL;

-- ── 3. Update create_paddock: store circle_id directly ───────────────────────
-- Previously only inserted into circle_paddocks junction; now also writes the
-- denormalized circle_id column on the paddock row itself.

CREATE OR REPLACE FUNCTION create_paddock(p_name text, p_circle_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paddock_id uuid;
  v_sport_id   uuid;
BEGIN
  SELECT id INTO v_sport_id FROM sports WHERE slug = 'f1';
  IF v_sport_id IS NULL THEN RAISE EXCEPTION 'F1_SPORT_NOT_FOUND'; END IF;

  INSERT INTO paddocks (name, created_by, sport_id, circle_id)
    VALUES (p_name, auth.uid(), v_sport_id, p_circle_id)
    RETURNING id INTO v_paddock_id;

  INSERT INTO paddock_members (paddock_id, user_id, role)
    VALUES (v_paddock_id, auth.uid(), 'owner');

  IF p_circle_id IS NOT NULL THEN
    INSERT INTO circle_paddocks (circle_id, paddock_id)
      VALUES (p_circle_id, v_paddock_id)
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_paddock_id;
END;
$$;

-- ── 4. Update create_player_box: store circle_id directly ────────────────────
-- Previously only inserted into circle_player_boxes junction; now also writes
-- the denormalized circle_id column on the player_box row itself.

CREATE OR REPLACE FUNCTION create_player_box(
  p_name        text,
  p_season_year int,
  p_circle_id   uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_box_id uuid;
  v_invite text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;

  INSERT INTO player_boxes (name, season_year, created_by, circle_id)
  VALUES (p_name, p_season_year, auth.uid(), p_circle_id)
  RETURNING id, invite_code INTO v_box_id, v_invite;

  INSERT INTO player_box_members (player_box_id, user_id)
  VALUES (v_box_id, auth.uid());

  IF p_circle_id IS NOT NULL THEN
    INSERT INTO circle_player_boxes (circle_id, player_box_id)
    VALUES (p_circle_id, v_box_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('player_box_id', v_box_id, 'invite_code', v_invite);
END;
$$;

-- ── 5. Update create_league: add p_circle_id parameter ───────────────────────
-- Based on the current h2h-enabled overload (migration 136).
-- The new 6-param signature is a NEW overload — PostgreSQL treats it as distinct
-- from the existing 5-param overload, so CREATE OR REPLACE is safe and preserves
-- all GRANT EXECUTE permissions on the existing overloads.
-- Writes circle_id on the leagues INSERT and also inserts into circle_leagues
-- junction for backwards compatibility.

CREATE OR REPLACE FUNCTION create_league(
  p_name          text,
  p_format        text,
  p_user_id       uuid,          -- ignored; auth.uid() used instead
  p_tournament_id text,
  p_h2h_enabled   boolean DEFAULT false,
  p_circle_id     uuid    DEFAULT NULL
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller    uuid := auth.uid();
  v_league    leagues%ROWTYPE;
  v_join_code text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: must be authenticated to create a league';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tournaments WHERE forza_id = p_tournament_id) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND: tournament % does not exist', p_tournament_id;
  END IF;

  v_join_code := upper(substring(md5(random()::text) for 6));

  INSERT INTO leagues (name, format, tournament_id, created_by, join_code, h2h_enabled, circle_id)
  VALUES (p_name, p_format::league_format, p_tournament_id, v_caller, v_join_code, p_h2h_enabled, p_circle_id)
  RETURNING * INTO v_league;

  INSERT INTO league_members (league_id, user_id, role)
  VALUES (v_league.id, v_caller, 'commissioner')
  ON CONFLICT (league_id, user_id) DO NOTHING;

  -- Seed league_config defaults (existing keys + H2H scoring keys)
  INSERT INTO league_config (league_id, config_key, config_value)
  VALUES
    (v_league.id, 'transfers_per_round',      '3'::jsonb),
    (v_league.id, 'transfer_reopen_hours',    '6'::jsonb),
    (v_league.id, 'transfer_wildcard_round',  'null'::jsonb),
    (v_league.id, 'club_cap_default',         '3'::jsonb),
    (v_league.id, 'club_cap_tier1_threshold', '8'::jsonb),
    (v_league.id, 'club_cap_tier1_value',     '4'::jsonb),
    (v_league.id, 'club_cap_tier2_threshold', '4'::jsonb),
    (v_league.id, 'club_cap_tier2_value',     '5'::jsonb),
    (v_league.id, 'club_cap_tier3_threshold', '2'::jsonb),
    (v_league.id, 'club_cap_tier3_value',     'null'::jsonb),
    (v_league.id, 'lineup_lock_per_fixture',  'true'::jsonb),
    (v_league.id, 'h2h_win_pts',              '5'::jsonb),
    (v_league.id, 'h2h_draw_pts',             '2'::jsonb),
    (v_league.id, 'h2h_loss_pts',             '0'::jsonb)
  ON CONFLICT (league_id, config_key) DO NOTHING;

  -- Also insert into junction table for backwards compatibility
  IF p_circle_id IS NOT NULL THEN
    INSERT INTO circle_leagues (circle_id, league_id)
    VALUES (p_circle_id, v_league.id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN row_to_json(v_league);
END;
$$;
