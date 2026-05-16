-- Migration 49: Add tournament_id to squads
--
-- Squads currently have no competition scope: a squad in an EPL league and a
-- squad in a La Liga league are indistinguishable at the data layer. This
-- migration adds tournament_id so squads can be correctly scoped per competition,
-- which is a prerequisite for cross-league / multi-competition support.
--
-- Steps:
--   1. Add nullable column (safe to add online)
--   2. Backfill from leagues.tournament_id
--   3. Default any orphaned rows to EPL ('426') — current only active tournament
--   4. Set NOT NULL now that all rows are populated
--   5. Replace UNIQUE constraint to include tournament_id

ALTER TABLE squads ADD COLUMN IF NOT EXISTS tournament_id TEXT REFERENCES tournaments(forza_id);

-- Backfill from the squad's parent league
UPDATE squads s
SET    tournament_id = l.tournament_id
FROM   leagues l
WHERE  s.league_id       = l.id
  AND  l.tournament_id   IS NOT NULL
  AND  s.tournament_id   IS NULL;

-- Fallback for any orphaned squads (leagues without tournament_id set)
UPDATE squads
SET    tournament_id = '426'
WHERE  tournament_id IS NULL;

-- Safe to enforce NOT NULL now
ALTER TABLE squads ALTER COLUMN tournament_id SET NOT NULL;

-- Replace old 3-column unique with 4-column (includes tournament_id)
ALTER TABLE squads DROP CONSTRAINT IF EXISTS squads_league_id_user_id_matchday_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS squads_league_tournament_user_matchday_unique
  ON squads (league_id, tournament_id, user_id, matchday_id);
