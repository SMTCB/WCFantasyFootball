-- Migration 140: Reset round_transfers counters accumulated pre-competition
--
-- Root cause: managers in draft leagues who made buy/sell transfers after the
-- draft ran (but before the first match kicked off) had those moves counted
-- against their per-round budget. This caused TRANSFER_LIMIT_REACHED errors
-- immediately on round 1 — they used all 3 slots before the competition started.
--
-- fix: process-transfer now passes p_matchday_id=NULL (bypassing the limit) when
-- no configured matchday has a live/finished fixture. This migration clears
-- any stale counters already accumulated so affected managers are unblocked.
--
-- Safe: only resets squads in leagues whose tournament has ZERO live/finished
-- fixtures across all configured matchdays (matchday_deadlines). Leagues mid-
-- or post-competition are untouched.

UPDATE squads s
SET round_transfers = '{}'
WHERE s.round_transfers != '{}'
  AND s.league_id IN (
    SELECT l.id
    FROM leagues l
    WHERE NOT EXISTS (
      SELECT 1
      FROM fixtures f
      JOIN matchday_deadlines md
        ON md.tournament_id = l.tournament_id
       AND md.matchday_id   = f.matchday_id
      WHERE f.tournament_id = l.tournament_id
        AND f.status IN ('live', 'finished')
    )
  );
