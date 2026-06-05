-- Migration 139: Reset tournament 623 (Int'l Friendlies) for mini-league testing
--
-- Matchday 1 (Jun 6): Portugal-Chile, USA-Germany, Switzerland-Australia, England-New Zealand
-- Matchday 2 (Jun 7): Morocco-Norway, Croatia-Slovenia, Greece-Italy
--
-- Actions:
-- 1. Re-assign fixture matchday_ids (old r8 → r1; new r2 for Jun 7)
-- 2. Update matchday_deadlines for r1/r2; delete stale r3-r8
-- 3. Copy Morocco, Norway, Croatia players from WC (429) → 623, preserving price
-- 4. Copy Slovenia + Italy players from tournament 1593 → 623, random price £4.0–£7.0
-- 5. Delete polluting players (France, Ivory Coast, Mexico, Montenegro, Serbia, Sweden, null)

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1. FIXTURE MATCHDAY ASSIGNMENTS
-- ────────────────────────────────────────────────────────────

-- Disable the "preserve manual matchday_id" trigger so we can clear stale assignments
ALTER TABLE fixtures DISABLE TRIGGER trg_preserve_manual_matchday_id;

-- Clear stale matchday assignments from previous test rounds
UPDATE fixtures
SET matchday_id = NULL, round_number = NULL
WHERE tournament_id = '623'
  AND matchday_id IN ('623-r1', '623-r2', '623-r5');

-- Re-enable the trigger
ALTER TABLE fixtures ENABLE TRIGGER trg_preserve_manual_matchday_id;

-- Matchday 1 (Jun 6): Portugal-Chile, USA-Germany, Switzerland-Australia, England-New Zealand
-- Note: trg_derive_fixture_round_number is WC-429-specific; set round_number explicitly
UPDATE fixtures
SET matchday_id = '623-r1', round_number = 1
WHERE id IN (
  'f-1219956561',   -- Portugal vs Chile       17:45 UTC
  'f-1219539493',   -- United States vs Germany 18:30 UTC
  'f-1220119122',   -- Switzerland vs Australia 19:00 UTC
  'f-1219956489'    -- England vs New Zealand   20:00 UTC
);

-- Matchday 2 (Jun 7): Morocco-Norway, Croatia-Slovenia, Greece-Italy
UPDATE fixtures
SET matchday_id = '623-r2'
WHERE id IN (
  'f-1219721919',   -- Croatia vs Slovenia  18:45 UTC
  'f-1220119125',   -- Morocco vs Norway    19:00 UTC
  'f-1220174809'    -- Greece vs Italy      19:00 UTC
);

-- ────────────────────────────────────────────────────────────
-- 2. MATCHDAY DEADLINES
-- ────────────────────────────────────────────────────────────

-- r1 deadline: 45 min before first Jun 6 kickoff (Portugal-Chile, 17:45 UTC)
UPDATE matchday_deadlines
SET deadline_at = '2026-06-06 17:00:00+00', unlocks_at = NULL
WHERE tournament_id = '623' AND matchday_id = '623-r1';

-- r2 deadline: 45 min before first Jun 7 kickoff (Croatia-Slovenia, 18:45 UTC)
UPDATE matchday_deadlines
SET deadline_at = '2026-06-07 18:00:00+00', unlocks_at = NULL
WHERE tournament_id = '623' AND matchday_id = '623-r2';

-- Remove stale deadlines for rounds we are not using
DELETE FROM matchday_deadlines
WHERE tournament_id = '623'
  AND matchday_id IN ('623-r3', '623-r4', '623-r5', '623-r6', '623-r7', '623-r8');

-- ────────────────────────────────────────────────────────────
-- 3. COPY MOROCCO / NORWAY / CROATIA FROM WC (tournament 429)
--    Preserve existing prices
-- ────────────────────────────────────────────────────────────

INSERT INTO players (id, name, position, nationality, club, price, photo_url, forza_player_id, forza_team_id, tournament_id, birthdate, height, season_avg)
SELECT
  gen_random_uuid(),
  name, position, nationality, club, price, photo_url, forza_player_id, forza_team_id,
  '623',
  birthdate, height, season_avg
FROM players
WHERE tournament_id = '429'
  AND nationality IN ('Morocco', 'Norway', 'Croatia')
ON CONFLICT (forza_player_id, tournament_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 4a. COPY SLOVENIA FROM tournament 1593 (all 30 players)
--     Random price £4.0–£7.0
-- ────────────────────────────────────────────────────────────

INSERT INTO players (id, name, position, nationality, club, price, photo_url, forza_player_id, forza_team_id, tournament_id, birthdate, height, season_avg)
SELECT
  gen_random_uuid(),
  name, position, nationality, club,
  ROUND((4.0 + RANDOM() * 3.0)::NUMERIC, 1),
  photo_url, forza_player_id, forza_team_id,
  '623',
  birthdate, height, season_avg
FROM players
WHERE tournament_id = '1593'
  AND nationality = 'Slovenia'
ON CONFLICT (forza_player_id, tournament_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 4b. COPY ITALY FROM tournament 1593 (26 players, balanced)
--     3 GK · 9 DEF · 8 MID · 6 FWD
--     Random price £4.0–£7.0
-- ────────────────────────────────────────────────────────────

INSERT INTO players (id, name, position, nationality, club, price, photo_url, forza_player_id, forza_team_id, tournament_id, birthdate, height, season_avg)
SELECT
  gen_random_uuid(),
  name, position, nationality, club,
  ROUND((4.0 + RANDOM() * 3.0)::NUMERIC, 1),
  photo_url, forza_player_id, forza_team_id,
  '623',
  birthdate, height, season_avg
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY position ORDER BY id) AS rn
  FROM players
  WHERE tournament_id = '1593' AND nationality = 'Italy'
) ranked
WHERE (position = 'GK'  AND rn <= 3)
   OR (position = 'DEF' AND rn <= 9)
   OR (position = 'MID' AND rn <= 8)
   OR (position = 'FWD' AND rn <= 6)
ON CONFLICT (forza_player_id, tournament_id) DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 5. DELETE POLLUTING PLAYERS
--    Remove all tournament 623 players not representing a team
--    in our two matchdays (France, Ivory Coast, Mexico, etc.)
-- ────────────────────────────────────────────────────────────

-- Null out captain_id on squads referencing players about to be deleted
-- (avoids FK constraint violation; squad still exists without a captain set)
UPDATE squads
SET captain_id = NULL
WHERE league_id IN (SELECT id FROM leagues WHERE tournament_id = '623')
  AND captain_id IN (
    SELECT id FROM players
    WHERE tournament_id = '623'
      AND (
        nationality NOT IN (
          'Portugal', 'Chile',
          'USA', 'Germany',
          'Switzerland', 'Australia',
          'England', 'New Zealand',
          'Morocco', 'Norway',
          'Croatia', 'Slovenia',
          'Italy', 'Greece'
        )
        OR nationality IS NULL
      )
  );

DELETE FROM players
WHERE tournament_id = '623'
  AND (
    nationality NOT IN (
      'Portugal', 'Chile',
      'USA', 'Germany',
      'Switzerland', 'Australia',
      'England', 'New Zealand',
      'Morocco', 'Norway',
      'Croatia', 'Slovenia',
      'Italy', 'Greece'
    )
    OR nationality IS NULL
  );

COMMIT;
