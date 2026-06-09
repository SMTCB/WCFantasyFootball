-- Migration 159: Add r5 knockout fixtures for tournament 623 unit-test league
--
-- Purpose: enables the knockout-phase draft test by giving the league a
-- genuine r5 matchday_id. Two fake QF-style matches use teams already in
-- the DB (Argentina, Portugal, England, Spain — all have real players seeded).
--
-- The matchday_deadline is set to 2026-06-20 20:00 UTC (well in the future),
-- so run-draft-lottery will stamp knockout squads with matchday_id='623-r5'.

-- 1. Two fake knockout fixtures (round_number=5 = QF tier in the 623 schedule)
INSERT INTO fixtures (id, tournament_id, matchday_id, round_number, home_team, away_team, kickoff_at, status, competition)
VALUES
  ('f-623-r5-01', '623', '623-r5', 5, 'Argentina', 'Portugal', '2026-06-25 19:00:00+00', 'scheduled', 'International Friendlies Jun 2026 · QF'),
  ('f-623-r5-02', '623', '623-r5', 5, 'England',   'Spain',    '2026-06-25 21:45:00+00', 'scheduled', 'International Friendlies Jun 2026 · QF')
ON CONFLICT (id) DO UPDATE
  SET matchday_id   = EXCLUDED.matchday_id,
      round_number  = EXCLUDED.round_number,
      kickoff_at    = EXCLUDED.kickoff_at,
      status        = EXCLUDED.status;

-- 2. Matchday deadline for r5 (before first kickoff — 2026-06-25 17:00 UTC)
INSERT INTO matchday_deadlines (tournament_id, matchday_id, deadline_at)
VALUES ('623', '623-r5', '2026-06-25 17:00:00+00')
ON CONFLICT (matchday_id) DO UPDATE
  SET deadline_at = EXCLUDED.deadline_at;

-- 3. Club-cap rule for r5 already exists (cap=4) from migration 158.
--    No action needed — get_club_cap('623','623-r5') returns 4 correctly.
