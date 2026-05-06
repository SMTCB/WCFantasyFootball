-- Migration 19: Fix create_league RPC — cast p_format TEXT → league_format enum
-- The previous function body inserted p_format (TEXT) directly into the format column
-- (league_format enum), which Postgres rejects without an explicit cast.

CREATE OR REPLACE FUNCTION create_league(
  p_name    TEXT,
  p_format  TEXT,
  p_user_id UUID
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_league    leagues%ROWTYPE;
  v_join_code TEXT;
BEGIN
  -- Generate a short join code
  v_join_code := upper(substring(md5(random()::text) for 6));

  INSERT INTO leagues (name, format, created_by, join_code)
  VALUES (
    p_name,
    p_format::league_format,   -- explicit cast: text → enum
    p_user_id,
    v_join_code
  )
  RETURNING * INTO v_league;

  -- Insert creator as commissioner member
  INSERT INTO league_members (league_id, user_id, role)
  VALUES (v_league.id, p_user_id, 'commissioner')
  ON CONFLICT (league_id, user_id) DO NOTHING;

  RETURN row_to_json(v_league);
END;
$$;
