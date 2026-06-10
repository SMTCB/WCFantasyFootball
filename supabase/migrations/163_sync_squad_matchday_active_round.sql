-- Migration 163: Self-healing squads.matchday_id sync to the active round
--
-- BUG FOUND (TEST_2_H2H_DRAFT smoke test, 2026-06-10):
--   Squad 672299ce-9d15-4e5b-b2d7-053a4d6a8b5d made 3 transfers in round 4
--   (round_transfers->'623-r4' = 3) but matchday_id was still '623-r1'.
--   SquadScreen.fetchSquad() filters fixtures/points by squad.matchday_id,
--   so the pitch showed Bruno Fernandes' round-1 score (5 pts vs Chile,
--   finished Jun 6) as if it were the current round, instead of his live
--   round-4 fixture (Portugal vs Nigeria).
--
--   Migration 161's "advance matchday_id on transfer" fix (the
--   `matchday_id = COALESCE(p_matchday_id, matchday_id)` clause already
--   live in execute_transfer_atomic) was patched into the live function
--   AFTER this squad's round-4 transfers had already executed, so this one
--   row is stuck with pre-fix state. One-time data correction below.
--
-- SYSTEMIC RISK FOR THE WC LEAGUE (429):
--   Migration 161's fix only advances matchday_id on TRANSFER. A squad that
--   makes zero transfers in a round keeps its draft-time matchday_id
--   ('429-r1') forever — once r1 finishes and r2 begins, every
--   non-transferring squad will hit this exact same stale-pitch bug.
--
-- FIX:
--   sync_squad_matchdays(): for each tournament, computes the active round
--   the same way set_lineup() does (lowest round_number with a
--   'scheduled'/'live' fixture, falling back to the highest round_number
--   once everything is finished). Advances matchday_id -> '{tournament}-rN'
--   for any squad whose matchday_id round is BEHIND the active round —
--   but only when that target matchday_id is a real configured round
--   (exists in matchday_deadlines), so non-standard pre-competition
--   matchday_ids are left alone. Run once now (backfill) and every 30 min
--   via cron (alongside flip-fixtures-live's cadence).

-- ── 1. One-time data fix for the squad found during smoke testing ───────────
UPDATE squads
SET matchday_id = '623-r4'
WHERE id = '672299ce-9d15-4e5b-b2d7-053a4d6a8b5d'
  AND matchday_id = '623-r1';

-- ── 2. Self-healing sync function ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_squad_matchdays()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_tournament_id  text;
  v_active_round   int;
  v_active_md      text;
BEGIN
  FOR v_tournament_id IN
    SELECT DISTINCT tournament_id FROM leagues WHERE tournament_id IS NOT NULL
  LOOP
    -- Active round = lowest round with a fixture still scheduled or live.
    SELECT MIN(f.round_number) INTO v_active_round
    FROM fixtures f
    WHERE f.tournament_id = v_tournament_id
      AND f.status IN ('scheduled', 'live')
      AND f.round_number IS NOT NULL;

    -- Everything finished -> active round is the last one played.
    IF v_active_round IS NULL THEN
      SELECT MAX(f.round_number) INTO v_active_round
      FROM fixtures f
      WHERE f.tournament_id = v_tournament_id
        AND f.round_number IS NOT NULL;
    END IF;

    IF v_active_round IS NULL THEN
      CONTINUE;
    END IF;

    v_active_md := v_tournament_id || '-r' || v_active_round::text;

    -- Only advance squads to a matchday that's an actual configured round.
    IF NOT EXISTS (
      SELECT 1 FROM matchday_deadlines
      WHERE tournament_id = v_tournament_id AND matchday_id = v_active_md
    ) THEN
      CONTINUE;
    END IF;

    UPDATE squads s
    SET matchday_id = v_active_md
    FROM leagues l
    WHERE s.league_id = l.id
      AND l.tournament_id = v_tournament_id
      AND s.matchday_id ~ ('^' || v_tournament_id || '-r[0-9]+$')
      AND (regexp_match(s.matchday_id, '-r([0-9]+)$'))[1]::int < v_active_round;
  END LOOP;
END;
$$;

-- ── 3. Run once now to backfill any squad already behind ─────────────────────
SELECT public.sync_squad_matchdays();

-- ── 4. Schedule every 30 min ──────────────────────────────────────────────────
SELECT cron.schedule(
  'sync-squad-matchdays',
  '*/30 * * * *',
  'SELECT public.sync_squad_matchdays();'
);
