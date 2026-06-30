-- Migration 195: sync_cup_eliminations v2 — fix two recurring elimination bugs
--
-- Bug 1: 6h guard causes false negatives for clear-loss teams (e.g. Côte d'Ivoire)
-- The guard was added to prevent Norway-type false-positives where the function ran
-- before Forza published the next-round fixture schedule. The better guard is:
-- "all other fixtures in the same matchday are also finished" — once the round is
-- completely settled, Forza has had time to publish the next bracket.
--
-- Bug 2: Draws aren't eliminated even when a team lost on penalties (e.g. Netherlands,
-- Germany). Now: for a draw, check player_match_stats.shootout_scored for both
-- nationalities in that fixture. If the club's total < opponent's total, they lost.

CREATE OR REPLACE FUNCTION sync_cup_eliminations(p_league_id UUID)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament_id     TEXT;
  v_active_count      INT;
  v_clubs_with_future INT;
  v_eliminated_count  INT := 0;
  rec                 RECORD;
  v_future_count      INT;
  v_last_result       RECORD;
  v_last_matchday_id  TEXT;
  v_pending_in_matchday INT;
  v_club_shootout     INT;
  v_opp_shootout      INT;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;

  -- Self-heal: reinstate any club already marked eliminated that now has a real
  -- future fixture (catches the race where sync ran before Forza published next round).
  UPDATE cup_active_clubs cac
  SET eliminated_at = NULL
  WHERE cac.league_id = p_league_id
    AND cac.eliminated_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM fixtures f
       WHERE (f.home_team = cac.club_id OR f.away_team = cac.club_id
           OR f.home_team_forza_id::text = cac.club_id
           OR f.away_team_forza_id::text = cac.club_id)
         AND f.status != 'finished'
         AND f.kickoff_at > NOW()
         AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id)
    );

  SELECT COUNT(*) INTO v_active_count FROM cup_active_clubs WHERE league_id = p_league_id AND eliminated_at IS NULL;
  IF v_active_count = 0 THEN RETURN 0; END IF;

  SELECT COUNT(DISTINCT cac.club_id) INTO v_clubs_with_future
    FROM cup_active_clubs cac
   WHERE cac.league_id = p_league_id AND cac.eliminated_at IS NULL
     AND EXISTS (
       SELECT 1 FROM fixtures f
        WHERE (f.home_team = cac.club_id OR f.away_team = cac.club_id
            OR f.home_team_forza_id::text = cac.club_id
            OR f.away_team_forza_id::text = cac.club_id)
          AND f.status != 'finished'
          AND f.kickoff_at > NOW()
          AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id)
     );
  IF v_clubs_with_future = 0 THEN RETURN 0; END IF;

  FOR rec IN SELECT cac.club_id FROM cup_active_clubs cac WHERE cac.league_id = p_league_id AND cac.eliminated_at IS NULL LOOP
    -- Count future fixtures for this club
    SELECT COUNT(*) INTO v_future_count FROM fixtures f
     WHERE (f.home_team = rec.club_id OR f.away_team = rec.club_id
         OR f.home_team_forza_id::text = rec.club_id
         OR f.away_team_forza_id::text = rec.club_id)
       AND f.status != 'finished'
       AND f.kickoff_at > NOW()
       AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id);

    IF v_future_count = 0 THEN
      -- Find this club's last finished fixture
      SELECT f.home_team, f.away_team, f.home_score, f.away_score, f.matchday_id, f.id AS fixture_id
        INTO v_last_result
        FROM fixtures f
       WHERE (f.home_team = rec.club_id OR f.away_team = rec.club_id
           OR f.home_team_forza_id::text = rec.club_id
           OR f.away_team_forza_id::text = rec.club_id)
         AND f.status = 'finished'
         AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id)
       ORDER BY f.kickoff_at DESC
       LIMIT 1;

      IF v_last_result IS NULL THEN CONTINUE; END IF;

      -- Guard: only eliminate once all other fixtures in the same matchday are also
      -- finished. This replaces the old 6h timer — once the round is completely
      -- settled, Forza has published the next round's bracket.
      v_last_matchday_id := v_last_result.matchday_id;
      IF v_last_matchday_id IS NOT NULL THEN
        SELECT COUNT(*) INTO v_pending_in_matchday
          FROM fixtures f
         WHERE f.matchday_id = v_last_matchday_id
           AND f.status != 'finished'
           AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id);
        IF v_pending_in_matchday > 0 THEN CONTINUE; END IF;
      END IF;

      -- Check if this club LOST (clear loss: scores differ, club was on lower side)
      IF (v_last_result.home_team = rec.club_id AND v_last_result.home_score < v_last_result.away_score)
      OR (v_last_result.away_team = rec.club_id AND v_last_result.away_score < v_last_result.home_score)
      THEN
        PERFORM eliminate_cup_club(p_league_id, rec.club_id);
        v_eliminated_count := v_eliminated_count + 1;

      -- Check penalty-shootout loss: draw on the scoreboard, but shootout data shows
      -- one team scored more. player_match_stats.shootout_scored was added in migration 192.
      ELSIF v_last_result.home_score = v_last_result.away_score THEN
        -- Sum shootout_scored for club's players vs opponent's players in this fixture
        SELECT
          COALESCE(SUM(pms.shootout_scored) FILTER (WHERE p.nationality = rec.club_id OR p.club = rec.club_id), 0),
          COALESCE(SUM(pms.shootout_scored) FILTER (WHERE p.nationality != rec.club_id AND p.club != rec.club_id), 0)
        INTO v_club_shootout, v_opp_shootout
        FROM player_match_stats pms
        JOIN players p ON p.id = pms.player_id
        WHERE pms.fixture_id = v_last_result.fixture_id
          AND (v_tournament_id IS NULL OR p.tournament_id = v_tournament_id);

        -- Eliminate only if there was a shootout AND this club scored fewer
        IF v_opp_shootout > 0 AND v_club_shootout < v_opp_shootout THEN
          PERFORM eliminate_cup_club(p_league_id, rec.club_id);
          v_eliminated_count := v_eliminated_count + 1;
        END IF;
        -- If no shootout data (genuine draw / incomplete data), leave active
      END IF;
    END IF;
  END LOOP;

  RETURN v_eliminated_count;
END;
$$;
