-- 193_cup_elimination_require_loss.sql
--
-- Bug: sync_cup_eliminations() eliminated a club purely on "no future scheduled
-- fixture exists yet" — it never checked the result of the club's last finished
-- match. Whenever Forza was slow to publish the next knockout round's draw
-- (observed 2026-06-29, Round of 32 -> Round of 16), BOTH the winner and the
-- loser of an already-decided match got eliminated. Confirmed wrongly eliminated:
-- Brazil (won 2-1 v Japan) and Türkiye (won 3-2 v USA) — see BACKLOG.
--
-- Fix: only eliminate a club whose most recent finished fixture shows them as
-- the strict loser (score comparison). If the last finished match was a win or
-- a draw (e.g. unresolved shootout — fixtures table doesn't carry a shootout
-- winner), do NOT eliminate; wait for clearer data. This is a strictly narrower
-- condition than before — it can only prevent wrongful eliminations, never cause
-- a new one that wasn't already happening.

CREATE OR REPLACE FUNCTION public.sync_cup_eliminations(p_league_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tournament_id     TEXT;
  v_active_count      INT;
  v_clubs_with_future INT;
  v_eliminated_count  INT := 0;
  rec                 RECORD;
  v_future_count      INT;
  v_last_finished_at  TIMESTAMPTZ;
  v_last_result       RECORD;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;

  -- Self-heal: reinstate any club already marked eliminated that now has a real
  -- future fixture (the sync cron caught up after a premature elimination).
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
    SELECT COUNT(*) INTO v_future_count FROM fixtures f
     WHERE (f.home_team = rec.club_id OR f.away_team = rec.club_id
         OR f.home_team_forza_id::text = rec.club_id
         OR f.away_team_forza_id::text = rec.club_id)
       AND f.status != 'finished'
       AND f.kickoff_at > NOW()
       AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id);
    IF v_future_count = 0 THEN
      -- Race guard: only eliminate once 6h have passed since this club's last
      -- finished fixture, so the fixture sync cron has time to publish their
      -- next-round match before we declare them out.
      SELECT MAX(f.kickoff_at) INTO v_last_finished_at FROM fixtures f
       WHERE (f.home_team = rec.club_id OR f.away_team = rec.club_id
           OR f.home_team_forza_id::text = rec.club_id
           OR f.away_team_forza_id::text = rec.club_id)
         AND f.status = 'finished'
         AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id);
      IF v_last_finished_at IS NOT NULL AND NOW() - v_last_finished_at > interval '6 hours' THEN
        -- New guard: confirm this club actually LOST its most recent finished
        -- fixture before eliminating. Skip (leave active) on a win or a draw —
        -- a draw means the result is undetermined from this table (e.g. went
        -- to a penalty shootout) and we'd rather under-eliminate than wrongly
        -- knock out a club that actually advanced.
        SELECT f.home_team, f.away_team, f.home_score, f.away_score
          INTO v_last_result
          FROM fixtures f
         WHERE (f.home_team = rec.club_id OR f.away_team = rec.club_id
             OR f.home_team_forza_id::text = rec.club_id
             OR f.away_team_forza_id::text = rec.club_id)
           AND f.status = 'finished'
           AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id)
         ORDER BY f.kickoff_at DESC
         LIMIT 1;

        IF v_last_result IS NOT NULL AND (
             (v_last_result.home_team = rec.club_id AND v_last_result.home_score < v_last_result.away_score)
          OR (v_last_result.away_team = rec.club_id AND v_last_result.away_score < v_last_result.home_score)
        ) THEN
          PERFORM eliminate_cup_club(p_league_id, rec.club_id);
          v_eliminated_count := v_eliminated_count + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN v_eliminated_count;
END;
$function$
;
