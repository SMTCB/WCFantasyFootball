-- Cup Pool Management (S10)
-- Controls which players are available for new picks in cup leagues.
-- Pool = players from clubs still active in the cup.
-- Managers may HOLD eliminated players (they score 0); pool only
-- restricts NEW acquisitions.

-- 1. Seed active clubs for a cup league
--    Call this when a league transitions into cup mode.
--    Inserts one row per distinct club found in the players table.
CREATE OR REPLACE FUNCTION seed_cup_clubs(p_league_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO cup_active_clubs (league_id, club_id)
  SELECT DISTINCT p_league_id, club
  FROM   players
  WHERE  club IS NOT NULL AND club <> ''
  ON CONFLICT (league_id, club_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- 2. Eliminate a club from the cup
--    Stamps eliminated_at; does NOT touch existing squad allocations.
CREATE OR REPLACE FUNCTION eliminate_cup_club(p_league_id UUID, p_club_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE cup_active_clubs
  SET    eliminated_at = NOW()
  WHERE  league_id = p_league_id
  AND    club_id   = p_club_id
  AND    eliminated_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'club_not_found'
      USING DETAIL = format('Club %s is not active in league %s.', p_club_id, p_league_id);
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Restore a club (undo elimination — admin correction)
CREATE OR REPLACE FUNCTION restore_cup_club(p_league_id UUID, p_club_id TEXT)
RETURNS void AS $$
BEGIN
  UPDATE cup_active_clubs
  SET    eliminated_at = NULL
  WHERE  league_id = p_league_id AND club_id = p_club_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Get available players for a cup league
--    Returns players whose club is still active.
--    For non-cup leagues (no cup_active_clubs rows) returns ALL players.
CREATE OR REPLACE FUNCTION get_cup_available_players(p_league_id UUID)
RETURNS SETOF players AS $$
DECLARE
  cup_rows INT;
BEGIN
  SELECT COUNT(*) INTO cup_rows
  FROM   cup_active_clubs
  WHERE  league_id = p_league_id;

  -- No cup clubs seeded → league is not in cup mode, return full pool
  IF cup_rows = 0 THEN
    RETURN QUERY SELECT * FROM players ORDER BY price DESC;
    RETURN;
  END IF;

  -- Return only players from active clubs
  RETURN QUERY
    SELECT p.*
    FROM   players p
    JOIN   cup_active_clubs cac ON cac.club_id = p.club
    WHERE  cac.league_id    = p_league_id
    AND    cac.eliminated_at IS NULL
    ORDER  BY p.price DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- 5. Get pool stats for relaxation formula (S11)
CREATE OR REPLACE FUNCTION get_cup_pool_stats(p_league_id UUID)
RETURNS JSON AS $$
DECLARE
  total_players  INT;
  active_clubs   INT;
  total_clubs    INT;
BEGIN
  SELECT COUNT(*) INTO total_players
  FROM   get_cup_available_players(p_league_id);

  SELECT COUNT(*) FILTER (WHERE eliminated_at IS NULL),
         COUNT(*)
  INTO   active_clubs, total_clubs
  FROM   cup_active_clubs
  WHERE  league_id = p_league_id;

  RETURN json_build_object(
    'available_players', total_players,
    'active_clubs',      active_clubs,
    'total_clubs',       total_clubs
  );
END;
$$ LANGUAGE plpgsql STABLE;
