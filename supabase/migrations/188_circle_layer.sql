-- Migration 188: Circle layer
-- Phase 0 of the v2 sale-ready build.
-- Introduces the "circle" concept: a named group that links multiple leagues
-- across sports, with a shared cross-league feed and meta-standings.
-- FULLY ADDITIVE: creates 3 new tables + 3 new RPCs.
-- Zero changes to any existing table, column, index, policy, or function.
--
-- NOTE: all three tables are created before any RLS policy is added,
-- because the circles policy references circle_members.

BEGIN;

-- ─── 1. Create all three tables first ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS circles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  invite_code text        NOT NULL UNIQUE DEFAULT substring(gen_random_uuid()::text, 1, 8),
  created_by  uuid        NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS circle_members (
  circle_id   uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id),
  role        text        NOT NULL DEFAULT 'member'
                          CHECK (role IN ('owner', 'member')),
  joined_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, user_id)
);

CREATE TABLE IF NOT EXISTS circle_leagues (
  circle_id   uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  league_id   uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, league_id)
);

-- ─── 2. RLS — enable then add policies (after all tables exist) ───────────────

ALTER TABLE circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_leagues ENABLE ROW LEVEL SECURITY;

-- circles: members of the circle can read it
CREATE POLICY "circles_member_read" ON circles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM circle_members
      WHERE circle_members.circle_id = circles.id
        AND circle_members.user_id = auth.uid()
    )
  );

-- circle_members: members of the circle can read the full member list
CREATE POLICY "circle_members_member_read" ON circle_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = circle_members.circle_id
        AND cm.user_id = auth.uid()
    )
  );

-- circle_leagues: members of the circle can read which leagues it contains
CREATE POLICY "circle_leagues_member_read" ON circle_leagues
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM circle_members
      WHERE circle_members.circle_id = circle_leagues.circle_id
        AND circle_members.user_id = auth.uid()
    )
  );

-- ─── 3. create_circle(p_name) RPC ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_circle(p_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_circle_id uuid;
  v_code      text;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF length(trim(p_name)) = 0 THEN
    RETURN json_build_object('error', 'NAME_REQUIRED');
  END IF;

  INSERT INTO circles (name, created_by)
  VALUES (trim(p_name), v_user_id)
  RETURNING id, invite_code INTO v_circle_id, v_code;

  INSERT INTO circle_members (circle_id, user_id, role)
  VALUES (v_circle_id, v_user_id, 'owner');

  RETURN json_build_object(
    'circle_id',   v_circle_id,
    'invite_code', v_code
  );
END;
$$;

-- ─── 4. join_circle_by_code(p_code) RPC ───────────────────────────────────────

CREATE OR REPLACE FUNCTION join_circle_by_code(p_code text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_circle_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  SELECT id INTO v_circle_id
  FROM circles
  WHERE invite_code = trim(p_code);

  IF v_circle_id IS NULL THEN
    RETURN json_build_object('error', 'INVALID_CODE');
  END IF;

  IF EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = v_circle_id AND user_id = v_user_id
  ) THEN
    RETURN json_build_object('error', 'ALREADY_MEMBER');
  END IF;

  INSERT INTO circle_members (circle_id, user_id, role)
  VALUES (v_circle_id, v_user_id, 'member');

  RETURN json_build_object('circle_id', v_circle_id);
END;
$$;

-- ─── 5. get_circle_feed(p_circle_id, p_limit) RPC ────────────────────────────

CREATE OR REPLACE FUNCTION get_circle_feed(
  p_circle_id uuid,
  p_limit     int DEFAULT 50
)
RETURNS TABLE (
  id          uuid,
  league_id   uuid,
  league_name text,
  entry_type  gazette_entry_type,
  headline    text,
  bullets     jsonb,
  full_data   jsonb,
  created_at  timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    ge.id,
    ge.league_id,
    l.name AS league_name,
    ge.entry_type,
    ge.headline,
    ge.bullets,
    ge.full_data,
    ge.created_at
  FROM gazette_entries ge
  JOIN circle_leagues cl ON cl.league_id = ge.league_id
  JOIN leagues l         ON l.id = ge.league_id
  WHERE cl.circle_id = p_circle_id
  ORDER BY ge.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 200));
END;
$$;

COMMIT;
