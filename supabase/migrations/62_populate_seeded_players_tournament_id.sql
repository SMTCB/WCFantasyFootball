-- Migration 62: Populate tournament_id for seeded players
-- The seed players (p1-p7) don't have tournament_id set, which breaks auto-fill
-- when querying by tournament. This migration assigns them to 'wc2026' (the demo league's tournament).

update players
set tournament_id = 'wc2026'
where id in ('p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7')
  and tournament_id is null;
