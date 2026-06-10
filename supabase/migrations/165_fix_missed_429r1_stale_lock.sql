-- Migration 165: Clear a stale 429-r1 lineup_locks entry missed by migration 162's backfill
--
-- Migration 162 cleared stale pre-competition lineup_locks->'429-r1' for 4 squads
-- in Mundial do Eder / RANKS FC (tournament 429, round 1 — all fixtures still
-- 'scheduled'). One squad in Mundial do Eder was missed:
--   xavierazcue@gmail.com (squad 6ef9a431-2326-4282-8a4e-736f0eb6b491)
--   lineup_locks->'429-r1' = ["fp-1423322-429", "fp-588619-429"]
--
-- Same root cause: set_lineup() (pre-162) appended subbed-out players to
-- lineup_locks before the round started. Server-side, migration 162 already
-- gates the PLAYER_LOCKED check on v_round_started=true, so these players
-- aren't actually blocked server-side — but SquadScreen computes
-- isLineupLocked directly from lineup_locks and blocks the swap client-side
-- before the RPC is even called (same symptom as the migration 164 bug, but
-- for pre-existing stale data rather than a newly-created lock).
--
-- Confirmed: 429-r1 has 0 live/finished fixtures (all 24 'scheduled'), and
-- this is the only squad across tournament 429 still carrying a 429-r1 lock.

UPDATE squads
SET lineup_locks = lineup_locks - '429-r1'
WHERE id = '6ef9a431-2326-4282-8a4e-736f0eb6b491';
