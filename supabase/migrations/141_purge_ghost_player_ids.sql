-- Migration 141: Purge ghost player IDs from squads.players
--
-- Root cause: during UAT cleanup the players table was selectively purged
-- (nations removed, test data reset) but squads.players TEXT[] still held
-- those deleted IDs.  The result: squads report 15/15 from raw array length
-- but only 6–12 players render because the missing IDs have no matching row
-- in the players table.
--
-- Fix: remove any player ID from squads.players that no longer has a
-- corresponding row in the players table.  Also removes the same ghosts from
-- squads.starting_xi (migration 121's sanitize_starting_xi trigger will keep
-- this consistent going forward on INSERT/UPDATE, but this one-off cleans
-- existing rows that pre-date the trigger).
--
-- Affected squads confirmed by pre-migration audit:
--   E2E_DRAFT_TEST_623  (league 76358b13)  — 3 squads
--   H2H E2E League      (league e2e10001)  — 5 squads
--   Int Friendly Test   (league ce6a22aa)  — 1 squad

-- ── 1. Clean squads.players ───────────────────────────────────────────────────
UPDATE squads s
SET players = ARRAY(
  SELECT pid
  FROM unnest(s.players) AS pid
  WHERE EXISTS (SELECT 1 FROM players p WHERE p.id = pid)
)
WHERE EXISTS (
  SELECT 1
  FROM unnest(s.players) AS pid
  WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id = pid)
);

-- ── 2. Clean squads.starting_xi ───────────────────────────────────────────────
UPDATE squads s
SET starting_xi = ARRAY(
  SELECT pid
  FROM unnest(s.starting_xi) AS pid
  WHERE EXISTS (SELECT 1 FROM players p WHERE p.id = pid)
)
WHERE starting_xi IS NOT NULL
  AND array_length(starting_xi, 1) > 0
  AND EXISTS (
    SELECT 1
    FROM unnest(s.starting_xi) AS pid
    WHERE NOT EXISTS (SELECT 1 FROM players p WHERE p.id = pid)
  );
