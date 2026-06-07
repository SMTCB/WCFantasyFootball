-- Migration 146: MD3 international friendly seed
-- Adds Netherlands-Uzbekistan, France-Northern Ireland, Spain-Peru as matchday 3
-- for tournament 623 (international friendlies used in TEST_2_H2H_DRAFT smoke test).
--
-- Kickoffs (all 2026-06-08/09):
--   f-1220207331  Netherlands vs Uzbekistan   Jun 8 18:45 UTC
--   f-1220143503  France vs Northern Ireland  Jun 8 19:10 UTC
--   f-1220140980  Spain vs Peru               Jun 9 02:00 UTC
--
-- Player sources:
--   Netherlands, France, Spain, Uzbekistan → copied from WC 2026 (tournament 429)
--   Peru, Northern Ireland                 → synthetic players, prices ROUND(3.5 + RANDOM()*1.0, 1)

-- ── 1. Assign matchday_id for the 3 new fixtures ─────────────────────────────
UPDATE fixtures
   SET matchday_id = '623-r3'
 WHERE id IN ('f-1220207331', 'f-1220143503', 'f-1220140980')
   AND (matchday_id IS NULL OR matchday_id != '623-r3');

-- ── 2. Matchday deadline for 623-r3 ──────────────────────────────────────────
-- Deadline 45 min before first kickoff (Jun 8 18:45 UTC → 18:00 UTC)
INSERT INTO matchday_deadlines (matchday_id, tournament_id, deadline_at)
VALUES ('623-r3', '623', '2026-06-08T18:00:00Z')
ON CONFLICT (matchday_id) DO UPDATE SET deadline_at = EXCLUDED.deadline_at;

-- ── 3. Copy WC players (Netherlands, France, Spain, Uzbekistan) to t623 ──────
-- New IDs: fp-{forza_player_id}-623 — same pricing as WC squad.
-- ON CONFLICT on (id) → skip if already seeded.
INSERT INTO players (id, name, position, nationality, club, tournament_id, forza_player_id, forza_team_id, price, is_active)
SELECT
  concat('fp-', forza_player_id, '-623')   AS id,
  name,
  position,
  nationality,
  club,
  '623'                                    AS tournament_id,
  forza_player_id,
  forza_team_id,
  price,
  true                                     AS is_active
FROM players
WHERE tournament_id = '429'
  AND club IN ('Netherlands', 'France', 'Spain', 'Uzbekistan')
  AND is_active = true
  AND forza_player_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ── 4. Peru synthetic players ─────────────────────────────────────────────────
INSERT INTO players (id, name, position, nationality, club, tournament_id, forza_player_id, price, is_active) VALUES
-- GK
('fp-syn-peru-001-623', 'Pedro Gallese',        'GK',  'Peru', 'Peru', '623', 'syn-peru-001', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-002-623', 'Carlos Cáceda',        'GK',  'Peru', 'Peru', '623', 'syn-peru-002', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
-- DEF
('fp-syn-peru-003-623', 'Luis Advíncula',       'DEF', 'Peru', 'Peru', '623', 'syn-peru-003', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-004-623', 'Anderson Santamaría',  'DEF', 'Peru', 'Peru', '623', 'syn-peru-004', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-005-623', 'Alexander Callens',    'DEF', 'Peru', 'Peru', '623', 'syn-peru-005', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-006-623', 'Aldo Corzo',           'DEF', 'Peru', 'Peru', '623', 'syn-peru-006', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-007-623', 'Marcos López',         'DEF', 'Peru', 'Peru', '623', 'syn-peru-007', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-008-623', 'Nilson Loyola',        'DEF', 'Peru', 'Peru', '623', 'syn-peru-008', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-009-623', 'Luis Abram',           'DEF', 'Peru', 'Peru', '623', 'syn-peru-009', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
-- MID
('fp-syn-peru-010-623', 'Renato Tapia',         'MID', 'Peru', 'Peru', '623', 'syn-peru-010', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-011-623', 'Yoshimar Yotún',       'MID', 'Peru', 'Peru', '623', 'syn-peru-011', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-012-623', 'Pedro Aquino',         'MID', 'Peru', 'Peru', '623', 'syn-peru-012', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-013-623', 'Wilder Cartagena',     'MID', 'Peru', 'Peru', '623', 'syn-peru-013', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-014-623', 'Sergio Peña',          'MID', 'Peru', 'Peru', '623', 'syn-peru-014', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-015-623', 'Christofer Gonzales',  'MID', 'Peru', 'Peru', '623', 'syn-peru-015', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-016-623', 'Andy Polo',            'MID', 'Peru', 'Peru', '623', 'syn-peru-016', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-017-623', 'Raziel García',        'MID', 'Peru', 'Peru', '623', 'syn-peru-017', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
-- FWD
('fp-syn-peru-018-623', 'Gianluca Lapadula',    'FWD', 'Peru', 'Peru', '623', 'syn-peru-018', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-019-623', 'Edison Flores',        'FWD', 'Peru', 'Peru', '623', 'syn-peru-019', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-020-623', 'Alex Valera',          'FWD', 'Peru', 'Peru', '623', 'syn-peru-020', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-021-623', 'Bryan Reyna',          'FWD', 'Peru', 'Peru', '623', 'syn-peru-021', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-022-623', 'Kevin Quevedo',        'FWD', 'Peru', 'Peru', '623', 'syn-peru-022', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-peru-023-623', 'José Guerrero',        'FWD', 'Peru', 'Peru', '623', 'syn-peru-023', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Northern Ireland synthetic players ─────────────────────────────────────
INSERT INTO players (id, name, position, nationality, club, tournament_id, forza_player_id, price, is_active) VALUES
-- GK
('fp-syn-nir-001-623', 'Bailey Peacock-Farrell', 'GK',  'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-001', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-002-623', 'Conor Hazard',           'GK',  'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-002', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
-- DEF
('fp-syn-nir-003-623', 'Jonny Evans',            'DEF', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-003', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-004-623', 'Daniel Ballard',         'DEF', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-004', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-005-623', 'Paddy McNair',           'DEF', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-005', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-006-623', 'Ciaran Brown',           'DEF', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-006', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-007-623', 'Trai Hume',              'DEF', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-007', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-008-623', 'Conor Bradley',          'DEF', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-008', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-009-623', 'Stuart Dallas',          'DEF', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-009', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
-- MID
('fp-syn-nir-010-623', 'Ali McCann',             'MID', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-010', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-011-623', 'Jordan Thompson',        'MID', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-011', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-012-623', 'Niall McGinn',           'MID', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-012', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-013-623', 'Shayne Lavery',          'MID', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-013', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-014-623', 'Shane Ferguson',         'MID', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-014', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-015-623', 'Jordan Jones',           'MID', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-015', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-016-623', 'Dale Taylor',            'MID', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-016', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-017-623', 'Daniel Candeias',        'MID', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-017', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
-- FWD
('fp-syn-nir-018-623', 'Dion Charles',           'FWD', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-018', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-019-623', 'Liam Boyce',             'FWD', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-019', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-020-623', 'Kyle Lafferty',          'FWD', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-020', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-021-623', 'Paul Smyth',             'FWD', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-021', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-022-623', 'Conor Washington',       'FWD', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-022', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true),
('fp-syn-nir-023-623', 'Josh Magennis',          'FWD', 'Northern Ireland', 'Northern Ireland', '623', 'syn-nir-023', ROUND((3.5 + RANDOM()*1.0)::NUMERIC,1), true)
ON CONFLICT (id) DO NOTHING;
