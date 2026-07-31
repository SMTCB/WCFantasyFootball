-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 251 — B-13-F1 / B-13-TENNIS: archive/active toggle for Paddocks
-- and Player Boxes (parity with B-13's league archive, migrations 244/245).
--
-- Unlike leagues, `paddocks` has no UPDATE RLS policy at all (all writes go
-- through SECURITY DEFINER RPCs), and `player_boxes`'s UPDATE policy only
-- recognizes `created_by = auth.uid()`, not circle-owner admin rights. So
-- instead of a direct client `.update()` per sport, this migration adds one
-- shared RPC, `set_competition_archived`, built on `is_competition_admin()`
-- (migration 243 / ADMIN-1) which already generalizes ownership across
-- league/paddock/player_box.
--
-- F1/tennis have no cron jobs and no paddock/box-scoped scoring pipeline
-- (score-f1-race, score-tennis-tournament, score-atp-finals are all manual,
-- global, per-user) — so unlike migration 245, there is no background job
-- that needs to be taught to skip archived rows here.
--
-- Run from the Supabase-linked PC:
--   npx supabase db query --linked --file supabase/migrations/251_paddock_playerbox_archive_toggle.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. Schema ─────────────────────────────────────────────────────────────

ALTER TABLE paddocks ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE paddocks ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE player_boxes ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;
ALTER TABLE player_boxes ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ─── 2. set_competition_archived ───────────────────────────────────────────
-- Shared archive/unarchive RPC for paddocks and player_boxes. Leagues keep
-- their existing direct-.update() path (useCommissioner.js) — not touched.

CREATE OR REPLACE FUNCTION set_competition_archived(
  p_competition_type text,
  p_competition_id   uuid,
  p_archived         boolean
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF p_competition_type NOT IN ('paddock', 'player_box') THEN
    RETURN json_build_object('error', 'INVALID_TYPE');
  END IF;

  IF NOT is_competition_admin(p_competition_type, p_competition_id) THEN
    RETURN json_build_object('error', 'NOT_AUTHORIZED');
  END IF;

  IF p_competition_type = 'paddock' THEN
    UPDATE paddocks
    SET archived = p_archived,
        archived_at = CASE WHEN p_archived THEN now() ELSE NULL END
    WHERE id = p_competition_id;

    IF NOT FOUND THEN
      RETURN json_build_object('error', 'NOT_FOUND');
    END IF;
  ELSE
    UPDATE player_boxes
    SET archived = p_archived,
        archived_at = CASE WHEN p_archived THEN now() ELSE NULL END
    WHERE id = p_competition_id;

    IF NOT FOUND THEN
      RETURN json_build_object('error', 'NOT_FOUND');
    END IF;
  END IF;

  RETURN json_build_object('ok', true, 'archived', p_archived);
END;
$$;

REVOKE ALL ON FUNCTION set_competition_archived(text, uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION set_competition_archived(text, uuid, boolean) TO authenticated;

-- ─── 3. get_my_paddocks — add archived/archived_at ─────────────────────────
-- Full re-issue from migration 192 (append-only convention). DROP first since
-- adding OUT columns changes the function's row type, which CREATE OR REPLACE
-- cannot do in place.

DROP FUNCTION IF EXISTS get_my_paddocks();

CREATE OR REPLACE FUNCTION get_my_paddocks()
RETURNS TABLE (
  paddock_id   uuid,
  name         text,
  invite_code  text,
  role         text,
  member_count bigint,
  season       integer,
  archived     boolean,
  archived_at  timestamptz
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.invite_code,
    pm.role,
    COUNT(*) OVER (PARTITION BY p.id) AS member_count,
    p.season,
    p.archived,
    p.archived_at
  FROM paddock_members pm
  JOIN paddocks p ON p.id = pm.paddock_id
  WHERE pm.user_id = auth.uid()
  ORDER BY pm.joined_at;
END;
$$;
GRANT EXECUTE ON FUNCTION get_my_paddocks() TO authenticated;

-- ─── 4. get_my_player_boxes — add archived/archived_at ─────────────────────
-- Full re-issue from migration 197 (append-only convention). DROP first, same
-- reason as get_my_paddocks above.

DROP FUNCTION IF EXISTS get_my_player_boxes(int);

CREATE OR REPLACE FUNCTION get_my_player_boxes(p_season_year int DEFAULT NULL)
RETURNS TABLE (
  player_box_id uuid,
  name          text,
  invite_code   text,
  member_count  bigint,
  season_year   int,
  is_owner      boolean,
  archived      boolean,
  archived_at   timestamptz
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    pb.id,
    pb.name,
    pb.invite_code,
    COUNT(pbm2.user_id),
    pb.season_year,
    (pb.created_by = auth.uid()),
    pb.archived,
    pb.archived_at
  FROM player_boxes pb
  JOIN player_box_members pbm  ON pbm.player_box_id = pb.id AND pbm.user_id = auth.uid()
  LEFT JOIN player_box_members pbm2 ON pbm2.player_box_id = pb.id
  WHERE (p_season_year IS NULL OR pb.season_year = p_season_year)
  GROUP BY pb.id
  ORDER BY pb.created_at DESC;
END;
$$;

-- ─── 5. get_clubhouse_competitions — add archived to f1/tennis branches ────
-- Full re-issue from migration 216 (append-only convention). Football branch
-- unchanged — leagues.archived isn't wired into this RPC either, so no
-- behavior change there.

CREATE OR REPLACE FUNCTION get_clubhouse_competitions(p_circle_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('error', 'NOT_MEMBER');
  END IF;

  RETURN json_build_object(
    'football', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',     l.id,
        'name',   l.name,
        'format', l.format,
        'sport',  'football'
      ) ORDER BY l.name), '[]'::json)
      FROM circle_leagues cl
      JOIN leagues l ON l.id = cl.league_id
      WHERE cl.circle_id = p_circle_id
    ),
    'f1', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',       p.id,
        'name',     p.name,
        'sport',    'f1',
        'archived', p.archived
      ) ORDER BY p.name), '[]'::json)
      FROM circle_paddocks cp
      JOIN paddocks p ON p.id = cp.paddock_id
      WHERE cp.circle_id = p_circle_id
    ),
    'tennis', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',       pb.id,
        'name',     pb.name,
        'sport',    'tennis',
        'archived', pb.archived
      ) ORDER BY pb.name), '[]'::json)
      FROM circle_player_boxes cpb
      JOIN player_boxes pb ON pb.id = cpb.player_box_id
      WHERE cpb.circle_id = p_circle_id
    )
  );
END;
$$;

COMMIT;
