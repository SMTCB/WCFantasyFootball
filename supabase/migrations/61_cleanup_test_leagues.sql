-- Migration 61: Delete test/WC leagues, keep PREMIER FANTASY LEAGUE
--
-- Removes all test leagues created during development:
-- - TEST DRAFT
-- - TEST DUMMY
-- - E2E Draft Test League
-- - WC TEST
-- - WC#2
-- - WC 3
-- - WC4
-- - WC6
--
-- Cascade deletes squads and related data

DELETE FROM squads
WHERE league_id IN (
  SELECT id FROM leagues
  WHERE name IN (
    'TEST DRAFT',
    'TEST DUMMY',
    'E2E Draft Test League',
    'WC TEST',
    'WC#2',
    'WC 3',
    'WC4',
    'WC6'
  )
);

DELETE FROM leagues
WHERE name IN (
  'TEST DRAFT',
  'TEST DUMMY',
  'E2E Draft Test League',
  'WC TEST',
  'WC#2',
  'WC 3',
  'WC4',
  'WC6'
);
