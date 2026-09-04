-- Migration 281: Clubhouse (circles) archive/active toggle
-- Mirrors migration 244 (leagues) / the paddock+player_box archive columns:
-- owner can archive a Clubhouse to hide it from switchers/dashboards without
-- deleting anything. Extends the existing update_circle_settings RPC (migration
-- 195) rather than adding a new one, matching how that RPC already handles
-- name/is_public/p2p_betting_enabled as optional partial updates.
-- FULLY ADDITIVE: new columns + CREATE OR REPLACE on two existing functions.

BEGIN;

ALTER TABLE circles ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false NOT NULL;
ALTER TABLE circles ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE OR REPLACE FUNCTION update_circle_settings(
  p_circle_id      uuid,
  p_name           text    DEFAULT NULL,
  p_is_public      bool    DEFAULT NULL,
  p_p2p_enabled    bool    DEFAULT NULL,
  p_archived       bool    DEFAULT NULL
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
    WHERE circle_id = p_circle_id AND user_id = v_user_id AND role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;
  UPDATE circles
  SET
    name                = COALESCE(NULLIF(trim(p_name), ''), name),
    is_public            = COALESCE(p_is_public,             is_public),
    p2p_betting_enabled  = COALESCE(p_p2p_enabled,           p2p_betting_enabled),
    archived             = COALESCE(p_archived,              archived),
    archived_at          = CASE
                              WHEN p_archived IS TRUE  THEN now()
                              WHEN p_archived IS FALSE THEN NULL
                              ELSE archived_at
                            END
  WHERE id = p_circle_id;
  RETURN json_build_object('ok', true);
END;
$$;

-- get_my_circles() feeds the "pick a Clubhouse for this new competition" picker
-- on the Paddock/Player Box creation screens — an archived Clubhouse shouldn't
-- be offered as a home for a brand-new competition.
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
  WHERE cm.user_id = auth.uid() AND c.archived = false
  ORDER BY c.name;
$$;

COMMIT;
