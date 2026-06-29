-- 217_circle_id_not_null.sql
-- Enforce that every competition (league, paddock, player_box) belongs to a clubhouse.
--
-- ⚠️  APPROVAL GATE — do NOT run this without completing the pre-flight check below.
--
-- PRE-FLIGHT (run first, show results to the user, wait for explicit "yes proceed"):
--
--   SELECT id, name FROM leagues      WHERE circle_id IS NULL;
--   SELECT id, name FROM paddocks     WHERE circle_id IS NULL;
--   SELECT id, name FROM player_boxes WHERE circle_id IS NULL;
--
-- All three queries must return 0 rows before applying NOT NULL.
-- Any orphaned rows must be assigned to a clubhouse (or archived/deleted) first.
-- Save the query results to backups/orphans_pre_217_*.json as per pilot safeguard rules.
--
-- Run from the Supabase-linked PC (only after the above is confirmed empty):
--   npx supabase db query --linked --file supabase/migrations/217_circle_id_not_null.sql

ALTER TABLE leagues      ALTER COLUMN circle_id SET NOT NULL;
ALTER TABLE paddocks     ALTER COLUMN circle_id SET NOT NULL;
ALTER TABLE player_boxes ALTER COLUMN circle_id SET NOT NULL;
