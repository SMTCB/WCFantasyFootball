-- Increase draft_list_size default from 30 to 45 for all draft-mode leagues.
-- Covers both draft-only and draft+H2H leagues.

-- 1. Change the column default for future leagues
ALTER TABLE leagues ALTER COLUMN draft_list_size SET DEFAULT 45;

-- 2. Patch all existing draft-mode leagues that still have the old default of 30
UPDATE leagues
SET draft_list_size = 45
WHERE league_mode = 'draft'
  AND draft_list_size = 30;
