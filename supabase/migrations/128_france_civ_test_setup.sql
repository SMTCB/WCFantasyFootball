-- Migration 128: France vs Côte d'Ivoire live test setup (2026-06-04, tournament 623, round 6)
--
-- 1. Assign round_number + matchday_id to the fixture (currently both null)
-- 2. Create matchday_deadlines row for 623-r6
-- 3. Copy France + CIV players from WC tournament 429 → tournament 623
--    Uses ON CONFLICT DO NOTHING — safe to re-run.

-- ─── 1. Fix the fixture ───────────────────────────────────────────────────────
UPDATE fixtures
SET
  round_number = 6,
  matchday_id  = '623-r6'
WHERE id = 'f-1220119072';

-- ─── 2. Matchday deadline ─────────────────────────────────────────────────────
INSERT INTO matchday_deadlines (matchday_id, tournament_id, deadline_at)
VALUES ('623-r6', '623', '2026-06-04 19:00:00+00')   -- 10 min before kickoff
ON CONFLICT (matchday_id) DO NOTHING;

-- ─── 3. Copy France + CIV players from tournament 429 → 623 ──────────────────
-- id format: 'fp-{forza_player_id}-623' (mirrors the existing pattern)
-- forza_team_id is identical between tournaments (France=7049, CIV=3115)
INSERT INTO players (
  id, name, position, nationality, club,
  price, photo_url, forza_player_id, forza_team_id,
  tournament_id, birthdate, height, season_avg
)
SELECT
  'fp-' || forza_player_id || '-623' AS id,
  name, position, nationality, club,
  price, photo_url, forza_player_id, forza_team_id,
  '623' AS tournament_id,
  birthdate, height, season_avg
FROM players
WHERE tournament_id = '429'
  AND club IN ('France', 'Côte d''Ivoire')
ON CONFLICT (id) DO NOTHING;
