-- ✅ APPLIED TO PRODUCTION 2026-06-29 (TRACKER row 17)
-- 216_wire_tennis_competitions.sql
-- Wire tennis player_boxes into get_clubhouse_competitions.
-- Previously the tennis branch was hard-coded to return '[]'::json.
-- Now reads from circle_player_boxes junction table (same pattern as football/F1).
--
-- Run from the Supabase-linked PC:
--   npx supabase db query --linked --file supabase/migrations/216_wire_tennis_competitions.sql

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
        'id',    p.id,
        'name',  p.name,
        'sport', 'f1'
      ) ORDER BY p.name), '[]'::json)
      FROM circle_paddocks cp
      JOIN paddocks p ON p.id = cp.paddock_id
      WHERE cp.circle_id = p_circle_id
    ),
    'tennis', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',   pb.id,
        'name', pb.name,
        'sport','tennis'
      ) ORDER BY pb.name), '[]'::json)
      FROM circle_player_boxes cpb
      JOIN player_boxes pb ON pb.id = cpb.player_box_id
      WHERE cpb.circle_id = p_circle_id
    )
  );
END;
$$;
