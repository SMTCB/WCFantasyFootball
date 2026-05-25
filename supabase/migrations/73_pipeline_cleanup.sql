-- Migration 73: Pipeline cleanup
-- I4/DATA-7: Unschedule duplicate hardcoded EPL sync crons left behind by migration 63.
--   Migration 51 established sync_all_active_tournaments() as the single orchestrator
--   that loops over all sync_enabled tournaments. Migration 63 then re-created per-
--   tournament crons for forza_id=426 (EPL) that duplicate every call the orchestrator
--   already makes. Remove the three duplicates; the orchestrator remains.
-- DATA-10: Remove stale fantasy_points rows where matchday_id='current' (seed artifact)
--   and add a CHECK constraint so the format is enforced going forward.

-- ── I4 / DATA-7: Remove duplicate hardcoded EPL sync crons ────────────────────
-- After this migration the canonical schedule is:
--   sync-all-active-tournaments  every 6h   — dynamic, loops sync_enabled tournaments
--   ingest-match-events-live     every 5min — per live fixture
--   calculate-scores-post-match  22:30 UTC  — per recently-finished fixture
--   run-draft-lottery            every 15min
--   auto-open-transfer-window    every 2h
--   sync-wc-players-6h           2 */6      — WC-specific until WC is sync_enabled=true
--   sync-wc-fixtures-6h          4 */6      — same
--   resolve-finished-bets        every 15min

SELECT cron.unschedule('sync-player-status')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-player-status');

SELECT cron.unschedule('sync-players-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-players-daily');

SELECT cron.unschedule('sync-fixtures')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-fixtures');

-- ── DATA-10: Clean stale fantasy_points rows ───────────────────────────────────
-- matchday_id='current' was written by early seed scripts and tests.
-- The canonical format is '{tournament_forza_id}-r{round_number}' e.g. '426-r35'.
DELETE FROM public.fantasy_points WHERE matchday_id = 'current';

-- Enforce the canonical format going forward.
-- Allows integers-dash-r-integers: '426-r35', '429-r1', etc.
ALTER TABLE public.fantasy_points
  DROP CONSTRAINT IF EXISTS fantasy_points_matchday_id_format;

ALTER TABLE public.fantasy_points
  ADD CONSTRAINT fantasy_points_matchday_id_format
  CHECK (matchday_id ~ '^[0-9]+-r[0-9]+$');
