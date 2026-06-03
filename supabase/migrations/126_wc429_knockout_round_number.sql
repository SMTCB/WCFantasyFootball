-- Migration 126 — WC 2026 (tournament 429) knockout round_number backfill + durability
-- Session 80 DD follow-up.
--
-- Problem: Forza does not number knockout matches — its `round` field is null, so
-- sync-fixtures writes fixtures.round_number = NULL for all 32 WC knockout fixtures
-- (kickoff Jun 28 → Jul 19). calculate-scores derives the scoring matchday_id from
-- round_number (`{tournament_id}-r{round_number}`) and HARD-FAILS ('critical', rollup
-- skipped) when it is null — so no knockout match would score for fantasy. The same
-- silent failure already bit tournament 1593 (UCL) historically.
--
-- Why a one-off UPDATE is not enough: sync_enabled = true for 429 and the
-- sync-wc-fixtures-30m cron re-upserts `round_number: m.round ?? null` every 30 min,
-- so any manual backfill is reverted within half an hour. sync-fixtures does NOT
-- write fixtures.matchday_id (not in its upsert row set), so matchday_id survives a
-- sync. We exploit that: store the stage in matchday_id, then re-derive round_number
-- from it on every write via a BEFORE INSERT/UPDATE trigger.
--
-- Mapping (decision: one tournament stage per fantasy round):
--   r4 = Round of 32 (16 matches)   r5 = Round of 16 (8)   r6 = Quarter-finals (4)
--   r7 = Semi-finals (2)            r8 = Final + 3rd-place play-off (2)
-- matchday_deadlines for 429-r4..r8 already exist (migration 88); their lock times are
-- corrected here to each stage's first kickoff.

BEGIN;

-- ── 1. One-time stage assignment for the 32 knockout fixtures ────────────────────────
-- Stage is read from the placeholder team labels while the bracket is still unresolved:
--   W##  = winner of match ##   (R32 = matches 73-88, R16 = 89-96, QF = 97-100, F = 101-102)
--   RU## = runner-up/loser      (3rd-place play-off)
--   group codes (1A, 2B, 3A/3B/…) have no W|RU|L prefix → those are the Round-of-32 ties.
-- The ^(?:W|RU|L)(\d+)$ anchor avoids matching the leading digit of a group code (e.g. "2A").
WITH ko AS (
  SELECT id,
         GREATEST(
           COALESCE((substring(home_team FROM '^(?:W|RU|L)(\d+)$'))::int, 0),
           COALESCE((substring(away_team FROM '^(?:W|RU|L)(\d+)$'))::int, 0)
         ) AS ref
  FROM fixtures
  WHERE tournament_id = '429' AND round_number IS NULL
),
staged AS (
  SELECT id,
         CASE
           WHEN ref = 0              THEN 4   -- Round of 32 (group qualifiers)
           WHEN ref BETWEEN 73 AND 88  THEN 5 -- Round of 16
           WHEN ref BETWEEN 89 AND 96  THEN 6 -- Quarter-finals
           WHEN ref BETWEEN 97 AND 100 THEN 7 -- Semi-finals
           WHEN ref BETWEEN 101 AND 102 THEN 8 -- Final + 3rd place
         END AS rn
  FROM ko
)
UPDATE fixtures f
SET round_number = s.rn,
    matchday_id  = '429-r' || s.rn,
    competition  = 'FIFA World Cup 2026 · Round ' || s.rn
FROM staged s
WHERE f.id = s.id AND s.rn IS NOT NULL;

-- ── 2. Durable derivation: re-fill round_number from matchday_id on every write ──────
-- Fires whenever a fixture is written with round_number NULL but a canonical
-- '{tournament}-rN' matchday_id present (exactly what sync-fixtures produces for WC
-- knockout once matchday_id is seeded above). Group-stage rows already carry a
-- non-null round_number, so the guard skips them. General across tournaments, so a
-- future UCL/CL knockout benefits the same way once its matchday_id is seeded.
CREATE OR REPLACE FUNCTION public.derive_fixture_round_number()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.round_number IS NULL
     AND NEW.matchday_id ~ '^[0-9]+-r[0-9]+$' THEN
    NEW.round_number := (substring(NEW.matchday_id FROM '-r([0-9]+)$'))::int;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_fixture_round_number ON public.fixtures;
CREATE TRIGGER trg_derive_fixture_round_number
  BEFORE INSERT OR UPDATE ON public.fixtures
  FOR EACH ROW
  EXECUTE FUNCTION public.derive_fixture_round_number();

-- ── 3. Correct knockout squad-lock deadlines to each stage's first kickoff ───────────
-- sync-fixtures skips knockout rounds when building deadlines (m.round is null), so
-- these manually-seeded rows are not clobbered by a sync. Align lock = MIN(kickoff)
-- of the stage, matching the group-stage convention.
UPDATE matchday_deadlines d
SET deadline_at = sub.first_ko
FROM (
  SELECT '429-r' || round_number AS matchday_id, MIN(kickoff_at) AS first_ko
  FROM fixtures
  WHERE tournament_id = '429' AND round_number BETWEEN 4 AND 8
  GROUP BY round_number
) sub
WHERE d.matchday_id = sub.matchday_id;

COMMIT;
