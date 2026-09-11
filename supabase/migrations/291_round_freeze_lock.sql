-- 291_round_freeze_lock.sql
-- Fixes a race condition in calculate-scores/rollupSquads (CODE-RACE-1, found
-- 2026-09-11 auditing Champions Eder 26/27). When two or more fixtures in the
-- same round finish within milliseconds of each other, each triggers its own
-- Edge Function invocation, and more than one can see roundComplete=true and
-- attempt the one-time "freeze" pass (v31 guard, migration-era comment in
-- calculate-scores/index.js) concurrently. Each invocation's reads of
-- player_match_stats (fullRoundLookup) and fantasy_points (existingBD) are
-- taken several round-trips apart, not atomically — so a concurrent
-- invocation's writes can land in between, producing a `total` that is
-- silently missing one fixture's contribution. Once written, the v31 guard
-- blocks all future recompute for that round, so the wrong total is
-- permanent (proven for Champions Eder squad 23741f29-a94e-4ff1-ad4d-
-- 4bf288c0d330, matchday 1593-r1: stored total 45 vs recomputed 63, the -18
-- diff being exactly fixture f-1221211717's dropped contribution).
--
-- This table is a mutex, not a data table: only the first invocation to
-- INSERT a row for a given matchday_id may proceed with the freeze pass; any
-- other concurrent invocation hits the PRIMARY KEY unique-violation and backs
-- off (logs a warning, returns as a no-op), exactly like the existing v31
-- "already frozen" guard. See rollupSquads() in calculate-scores/index.js.
--
-- RLS enabled with no policies: only the service role (bypasses RLS) writes
-- here, same convention as round_backups (migration 190).

CREATE TABLE IF NOT EXISTS public.round_freeze_locks (
  matchday_id           text        PRIMARY KEY,
  locked_by_fixture_id  text,
  locked_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.round_freeze_locks ENABLE ROW LEVEL SECURITY;
-- Intentionally no RLS policies — service role only.
