-- BUG-09: get_cup_available_players returned ALL players across all tournaments (~2250)
-- for non-cup leagues (no cup_active_clubs rows). EPL draft managers saw WC/CAF players.
-- Fix: when no cup clubs are seeded, filter by the league's own tournament_id.

CREATE OR REPLACE FUNCTION get_cup_available_players(p_league_id UUID)
RETURNS SETOF players AS $$
DECLARE
  cup_rows       INT;
  v_tournament_id TEXT;
BEGIN
  SELECT COUNT(*) INTO cup_rows
  FROM   cup_active_clubs
  WHERE  league_id = p_league_id;

  IF cup_rows = 0 THEN
    -- Non-cup league: return only players from this league's tournament.
    -- Fall back to all players only if no tournament is linked (shouldn't happen in prod).
    SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;

    IF v_tournament_id IS NOT NULL THEN
      RETURN QUERY
        SELECT * FROM players
        WHERE  tournament_id = v_tournament_id
        ORDER  BY price DESC;
    ELSE
      RETURN QUERY SELECT * FROM players ORDER BY price DESC;
    END IF;
    RETURN;
  END IF;

  -- Cup league: return only players from clubs still active in the cup pool.
  RETURN QUERY
    SELECT p.*
    FROM   players p
    JOIN   cup_active_clubs cac ON cac.club_id = p.club
    WHERE  cac.league_id    = p_league_id
    AND    cac.eliminated_at IS NULL
    ORDER  BY p.price DESC;
END;
$$ LANGUAGE plpgsql STABLE;
