-- Migration 195: Clubhouse owner settings — Phase 1E Sprint CH-8
-- Four new SECURITY DEFINER RPCs. Zero changes to existing tables, columns,
-- indexes, or policies. circles/circle_members/circle_leagues were created in
-- migration 188 (v2-only, never applied to prod as of 2026-06-23).
-- No backup required: these tables do not exist in the prod database.

BEGIN;

-- ─── 1. update_circle_settings ────────────────────────────────────────────────
-- Renames the Clubhouse and/or toggles is_public / p2p_betting_enabled.
-- Only the circle owner may call this.

CREATE OR REPLACE FUNCTION update_circle_settings(
  p_circle_id      uuid,
  p_name           text    DEFAULT NULL,
  p_is_public      bool    DEFAULT NULL,
  p_p2p_enabled    bool    DEFAULT NULL
)
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
    WHERE circle_id = p_circle_id
      AND user_id   = v_user_id
      AND role      = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  -- Only update columns whose parameter was supplied (non-NULL).
  UPDATE circles
  SET
    name               = COALESCE(NULLIF(trim(p_name), ''),   name),
    is_public          = COALESCE(p_is_public,                is_public),
    p2p_betting_enabled= COALESCE(p_p2p_enabled,             p2p_betting_enabled)
  WHERE id = p_circle_id;

  RETURN json_build_object('ok', true);
END;
$$;

-- ─── 2. kick_circle_member ────────────────────────────────────────────────────
-- Removes a member from the Clubhouse. Owner cannot kick themselves.
-- The caller must be the circle owner.

CREATE OR REPLACE FUNCTION kick_circle_member(
  p_circle_id uuid,
  p_user_id   uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id
      AND user_id   = v_caller
      AND role      = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  IF v_caller = p_user_id THEN
    RETURN json_build_object('error', 'CANNOT_KICK_SELF');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = p_user_id
  ) THEN
    RETURN json_build_object('error', 'NOT_MEMBER');
  END IF;

  DELETE FROM circle_members
  WHERE circle_id = p_circle_id AND user_id = p_user_id;

  RETURN json_build_object('ok', true);
END;
$$;

-- ─── 3. link_league_to_circle ────────────────────────────────────────────────
-- Links an existing league to the Clubhouse. Caller must be both:
--   a) the Clubhouse owner, AND
--   b) a commissioner of that league.
-- Uses ON CONFLICT DO NOTHING — safe to call if already linked.

CREATE OR REPLACE FUNCTION link_league_to_circle(
  p_circle_id uuid,
  p_league_id uuid
)
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
    WHERE circle_id = p_circle_id
      AND user_id   = v_user_id
      AND role      = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id
      AND user_id   = v_user_id
      AND role      = 'commissioner'
  ) THEN
    RETURN json_build_object('error', 'NOT_COMMISSIONER');
  END IF;

  INSERT INTO circle_leagues (circle_id, league_id)
  VALUES (p_circle_id, p_league_id)
  ON CONFLICT DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;

-- ─── 4. get_owner_linkable_leagues ───────────────────────────────────────────
-- Returns leagues where the caller is a commissioner and that are NOT yet
-- linked to the given circle. Used to populate the "link league" picker in the
-- owner SETTINGS tab.

CREATE OR REPLACE FUNCTION get_owner_linkable_leagues(p_circle_id uuid)
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
    WHERE circle_id = p_circle_id
      AND user_id   = v_user_id
      AND role      = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(json_build_object(
        'id',     l.id,
        'name',   l.name,
        'format', l.format
      ) ORDER BY l.name)
      FROM leagues l
      JOIN league_members lm ON lm.league_id = l.id
      WHERE lm.user_id = v_user_id
        AND lm.role    = 'commissioner'
        AND NOT EXISTS (
          SELECT 1 FROM circle_leagues cl
          WHERE cl.circle_id = p_circle_id
            AND cl.league_id  = l.id
        )
    ),
    '[]'::json
  );
END;
$$;

COMMIT;
