-- Migration 245: sync_squad_matchdays() skips archived leagues (B-13)
-- Companion to migration 244 (leagues.archived). Without this, the 30-min cron
-- would keep advancing squads.matchday_id for archived leagues even though
-- calculate-scores now skips scoring them — leaving the pitch showing a round
-- with no points ever computed. Reproduces the full body from migration 163
-- (append-only; migrations are never edited in place) with one added filter.

CREATE OR REPLACE FUNCTION public.sync_squad_matchdays()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_tournament_id  text;
  v_active_round   int;
  v_active_md      text;
BEGIN
  FOR v_tournament_id IN
    SELECT DISTINCT tournament_id FROM leagues WHERE tournament_id IS NOT NULL
  LOOP
    -- Active round = lowest round with a fixture still scheduled or live.
    SELECT MIN(f.round_number) INTO v_active_round
    FROM fixtures f
    WHERE f.tournament_id = v_tournament_id
      AND f.status IN ('scheduled', 'live')
      AND f.round_number IS NOT NULL;

    -- Everything finished -> active round is the last one played.
    IF v_active_round IS NULL THEN
      SELECT MAX(f.round_number) INTO v_active_round
      FROM fixtures f
      WHERE f.tournament_id = v_tournament_id
        AND f.round_number IS NOT NULL;
    END IF;

    IF v_active_round IS NULL THEN
      CONTINUE;
    END IF;

    v_active_md := v_tournament_id || '-r' || v_active_round::text;

    -- Only advance squads to a matchday that's an actual configured round.
    IF NOT EXISTS (
      SELECT 1 FROM matchday_deadlines
      WHERE tournament_id = v_tournament_id AND matchday_id = v_active_md
    ) THEN
      CONTINUE;
    END IF;

    UPDATE squads s
    SET matchday_id = v_active_md
    FROM leagues l
    WHERE s.league_id = l.id
      AND l.tournament_id = v_tournament_id
      AND l.archived = false
      AND s.matchday_id ~ ('^' || v_tournament_id || '-r[0-9]+$')
      AND (regexp_match(s.matchday_id, '-r([0-9]+)$'))[1]::int < v_active_round;
  END LOOP;
END;
$$;
