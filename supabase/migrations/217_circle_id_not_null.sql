-- 217_circle_id_not_null.sql
-- Enforce that every competition (league, paddock, player_box) belongs to a clubhouse.
--
-- ============================================================================
-- 🛑🛑🛑 DO NOT RUN THIS MIGRATION UNTIL THE WORLD CUP PILOT ENDS 🛑🛑🛑
-- ============================================================================
-- This hits the SAME PRODUCTION DATABASE that runs the live World Cup pilot
-- (project sssmvihxtqtohisghjet — no dev/staging split). Pre-flight check run
-- 2026-06-29 found 18 orphan `leagues` rows, 7 of which are REAL, CURRENTLY-
-- ACTIVE PILOT LEAGUES with real users mid-tournament: Mundial do Eder,
-- Mundial Gordo Vai a Baliza, RANKS FC World Cup Fantasy, Draft Mundial 26,
-- Munaial '26, FIXO DRAFT MUNDIAL 26, Miami WC Fantasy Testers.
--
-- Applying NOT NULL while those leagues have no circle_id will either fail
-- this migration outright or corrupt live pilot data mid-competition.
--
-- This is a deep-impact, pilot-blocking action, NOT a routine "run after
-- pre-flight" migration. Hold off until the World Cup pilot has ended
-- (target ~July 2026, Week-12 merge gate per SALE_READY_PROJECT_PLAN.md)
-- AND an explicit clubhouse-mapping decision has been made for those 7
-- leagues. Orphan snapshot: backups/orphans_pre_217_20260629.json.
-- ============================================================================
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
-- Run from the Supabase-linked PC (only after the above is confirmed empty
-- AND the pilot has ended):
--   npx supabase db query --linked --file supabase/migrations/217_circle_id_not_null.sql

ALTER TABLE leagues      ALTER COLUMN circle_id SET NOT NULL;
ALTER TABLE paddocks     ALTER COLUMN circle_id SET NOT NULL;
ALTER TABLE player_boxes ALTER COLUMN circle_id SET NOT NULL;
