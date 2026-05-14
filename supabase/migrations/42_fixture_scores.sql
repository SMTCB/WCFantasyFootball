-- Add score columns to fixtures table for match result tracking
ALTER TABLE fixtures
ADD COLUMN IF NOT EXISTS home_score INTEGER,
ADD COLUMN IF NOT EXISTS away_score INTEGER;

COMMENT ON COLUMN fixtures.home_score IS 'Final score for home team (null until match finishes)';
COMMENT ON COLUMN fixtures.away_score IS 'Final score for away team (null until match finishes)';
