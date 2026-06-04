-- Migration 131: Fix get_cup_available_players cross-tournament leak
--
-- Bug: the cup path joined cup_active_clubs by club name (e.g. "France") but
-- had no tournament_id filter. Players from ALL tournaments with matching club
-- names were returned — causing Gonçalo Ramos (and others) to appear twice in
-- the draft pool (once from tournament 623, once from WC 429, etc.).
--
-- Fix: look up tournament_id before the cup/non-cup branch and apply it in both
-- query paths.

CREATE OR REPLACE FUNCTION get_cup_available_players(p_league_id uuid)
RETURNS SETOF players LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  cup_rows        INT;
  v_tournament_id TEXT;
BEGIN
  -- Always resolve the league's tournament first (needed in both paths)
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;

  SELECT COUNT(*) INTO cup_rows
  FROM   cup_active_clubs
  WHERE  league_id = p_league_id;

  IF cup_rows = 0 THEN
    -- Non-cup league: return full tournament player pool
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

  -- Cup league: restrict to active clubs AND this tournament's players
  RETURN QUERY
    SELECT p.*
    FROM   players p
    JOIN   cup_active_clubs cac ON cac.club_id = p.club
    WHERE  cac.league_id     = p_league_id
    AND    cac.eliminated_at IS NULL
    AND    p.tournament_id   = v_tournament_id
    ORDER  BY p.price DESC;
END;
$$;
