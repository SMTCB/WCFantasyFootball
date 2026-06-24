-- 191: Retroactive clean sheet fix for R2 (five DEF players)
--
-- Root cause: ingest-match-events stored clean_sheet = (conceded = 0 AND mins >= 60),
-- baking in a 60-min gate. DEF/GK only need 45 min in calculate-scores scorePlayer().
-- Fix deployed in PR #616 (2026-06-23), but R2 is roundComplete so the v29 guard
-- blocks calculate-scores from re-running for any of these fixtures.
--
-- Affected players (clean_sheet was false, our session set it to true,
-- but fantasy_points and breakdown were never recomputed):
--   Cristian Romero   (ARG, DEF, 57 min, fixture f-1219435615)
--   Thomas Meunier    (BEL, DEF, 58 min, fixture f-1219435598)
--   Derek Cornelius   (CAN, DEF, 45 min, fixture f-1219435450)
--   Moïse Bombito     (CAN, DEF, 45 min, fixture f-1219435450)
--   Saleh Hardani     (IRN, DEF, 45 min, fixture f-1219435598)
--
-- Joao Cancelo and Nelson Semedo (POR, DEF, 45 min) were already correct (breakdown_cs=4).
-- Only 5 pilot squads had any of these players in their R2 effective_xi.
-- None of the affected players were captains in any of these squads (+4 flat, no multiplier).

-- Step 1: Fix player_match_stats — add +4 to fantasy_points, set breakdown.clean_sheet = 4
UPDATE player_match_stats
SET
  fantasy_points = fantasy_points + 4,
  breakdown      = jsonb_set(breakdown, '{clean_sheet}', '4'::jsonb)
WHERE id IN (
  'ce1d40bf-f630-4403-b305-4a8847ecaf84',  -- Cristian Romero
  '96f4347d-fa94-4802-a43a-387184b6fdc8',  -- Thomas Meunier
  '408d99f8-d676-4d2d-90da-3bfd5f8efa0a',  -- Derek Cornelius
  'e58743c6-46f7-45d9-9125-9637911fb0ed',  -- Moïse Bombito
  '5e862e97-ca5b-499e-bb53-77a3ac6a6c68'   -- Saleh Hardani
);

-- Step 2: Fix fantasy_points rows for the 5 affected pilot squads
-- Each gets +4 on total and the relevant fixture bucket in points_breakdown.fixtures

-- Oliver Knott — Romero in effective_xi, fixture f-1219435615 (48→52)
UPDATE fantasy_points
SET
  total             = total + 4,
  points_breakdown  = jsonb_set(
    points_breakdown,
    ARRAY['fixtures', 'f-1219435615'],
    to_jsonb((points_breakdown -> 'fixtures' ->> 'f-1219435615')::numeric + 4)
  )
WHERE id = 'e4dc900d-2215-4c8b-9c69-0a9247d1d177';

-- SB7 — Meunier in effective_xi, fixture f-1219435598 (66→70)
UPDATE fantasy_points
SET
  total             = total + 4,
  points_breakdown  = jsonb_set(
    points_breakdown,
    ARRAY['fixtures', 'f-1219435598'],
    to_jsonb((points_breakdown -> 'fixtures' ->> 'f-1219435598')::numeric + 4)
  )
WHERE id = 'e3945b7c-8e97-4d7e-9286-eaeb119300dc';

-- Titan — Romero in effective_xi, fixture f-1219435615 (48→52)
UPDATE fantasy_points
SET
  total             = total + 4,
  points_breakdown  = jsonb_set(
    points_breakdown,
    ARRAY['fixtures', 'f-1219435615'],
    to_jsonb((points_breakdown -> 'fixtures' ->> 'f-1219435615')::numeric + 4)
  )
WHERE id = 'b2bc2d5b-d4a4-4f2a-898b-f2f7aa3b477c';

-- tommyazcue — Romero in effective_xi, fixture f-1219435615 (78→82)
UPDATE fantasy_points
SET
  total             = total + 4,
  points_breakdown  = jsonb_set(
    points_breakdown,
    ARRAY['fixtures', 'f-1219435615'],
    to_jsonb((points_breakdown -> 'fixtures' ->> 'f-1219435615')::numeric + 4)
  )
WHERE id = '463a4956-2132-4ae5-8d7d-7c51209affe0';

-- Zepp — Romero in effective_xi, fixture f-1219435615 (62→66)
UPDATE fantasy_points
SET
  total             = total + 4,
  points_breakdown  = jsonb_set(
    points_breakdown,
    ARRAY['fixtures', 'f-1219435615'],
    to_jsonb((points_breakdown -> 'fixtures' ->> 'f-1219435615')::numeric + 4)
  )
WHERE id = '82538d04-2ba8-47fc-ac53-4ac4746b3ff1';

-- Step 3: Re-aggregate league_members.total_points for the 5 affected users.
-- The UPDATE triggers trg_recompute_ranks automatically (migration 69).
UPDATE league_members lm
SET total_points = (
  SELECT COALESCE(SUM(fp.total), 0)
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE s.user_id = lm.user_id
    AND s.league_id = lm.league_id
)
WHERE (lm.user_id, lm.league_id) IN (
  ('93303a68-83f2-4ce0-9368-33074faeeaa6'::uuid, 'f5f75bd9-3d87-42d4-a4d0-fbafddc9e610'::uuid), -- Oliver Knott
  ('d0f0cb5a-2327-45f0-aec2-4086dff07402'::uuid, 'a4c59f59-40ce-424b-a4ae-d4b7b5c256ab'::uuid), -- SB7
  ('324b0fcd-cfca-4b41-90ce-f50cc2a4b242'::uuid, 'dc54f38f-6cdd-45c4-8a26-84c7fb42316c'::uuid), -- Titan
  ('9b521778-d7cd-4213-a131-2fea4a11f028'::uuid, '70b874f0-ad78-4072-a535-3adbaa8545c7'::uuid), -- tommyazcue
  ('96e3073d-85df-47ca-bf36-694e11a81d13'::uuid, 'da4ef2e2-f099-4120-abe0-2087369a4163'::uuid)  -- Zepp
);
