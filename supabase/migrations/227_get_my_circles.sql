-- Migration 227: get_my_circles() RPC
-- Bug found during v2 cutover dry-run (Tennis UI pass): PlayerBoxScreen.jsx and
-- PaddockLobbyScreen.jsx both call supabase.rpc('get_my_circles') to populate a
-- clubhouse picker when creating a Player's Box / Paddock, but this RPC was never
-- defined in migration 188 (circle layer) or anywhere since. Every call 404s,
-- which blocks Tennis/F1 competition creation entirely now that circle_id is
-- NOT NULL on player_boxes/paddocks/leagues (migration 217).
-- FULLY ADDITIVE: one new RPC, no changes to existing tables/policies.

BEGIN;

CREATE OR REPLACE FUNCTION get_my_circles()
RETURNS TABLE (
  id   uuid,
  name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT c.id, c.name
  FROM circles c
  JOIN circle_members cm ON cm.circle_id = c.id
  WHERE cm.user_id = auth.uid()
  ORDER BY c.name;
$$;

COMMIT;
