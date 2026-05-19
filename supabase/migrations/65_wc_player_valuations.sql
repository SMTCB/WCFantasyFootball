-- Migration 65: World Cup player valuations
-- Purpose: Add realistic valuations for World Cup 2026 players (tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968')
--
-- Pricing strategy (4-8M range):
--   Budget per squad: 100M for 15 players (11 starters + 4 bench)
--   Average spend: ~6.67M per player
--   Distribution tiers:
--     Tier S (Elite):   8.0–7.5   (Star players, World-class talent)
--     Tier A (Top):     7.0–6.0   (International regulars, playmakers)
--     Tier B (Quality): 6.0–5.5   (Quality depth, experienced players)
--     Tier C (Solid):   5.5–5.0   (Solid rotation options)
--     Tier D (Budget):  5.0–4.5   (Budget-conscious picks, young talents)
--     Tier E (Bench):   4.5–4.0   (Deep bench, injury cover)

-- ─── 1. Set position-based default prices for all WC players ────────────────────
-- Using these as baseline defaults; named overrides will refine tier allocation

UPDATE players
SET price = 5.0
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND position = 'GK'
AND price IS NULL;

UPDATE players
SET price = 5.0
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND position = 'DEF'
AND price IS NULL;

UPDATE players
SET price = 5.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND position = 'MID'
AND price IS NULL;

UPDATE players
SET price = 6.0
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND position = 'FWD'
AND price IS NULL;

-- ─── 2. Named price overrides by tier ──────────────────────────────────────────

-- ── Tier S: World-class stars ──────────────────────────────────────────────────

-- Kylian Mbappé (FWD, France/Real Madrid)
UPDATE players
SET price = 8.0
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Mbappé%' OR name ILIKE '%Mbappe%');

-- Jude Bellingham (MID, England/Real Madrid)
UPDATE players
SET price = 7.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Bellingham%');

-- Vinicius Jr (FWD, Brazil/Real Madrid)
UPDATE players
SET price = 7.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Vinicius%');

-- Neymar (FWD, Brazil)
UPDATE players
SET price = 7.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Neymar%');

-- ── Tier A: Top international players ──────────────────────────────────────────

-- Erling Haaland (FWD, Norway) — NOTE: Norway didn't qualify, placeholder
-- UPDATE players SET price = 7.0 WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968' AND name ILIKE '%Haaland%';

-- Rodri (MID, Spain/Manchester City)
UPDATE players
SET price = 7.0
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Rodri%' AND name NOT ILIKE '%Rodrigo%');

-- Florian Wirtz (MID, Germany/Bayer Leverkusen)
UPDATE players
SET price = 7.0
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Wirtz%');

-- Luka Modric (MID, Croatia/Real Madrid)
UPDATE players
SET price = 6.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Modric%' OR name ILIKE '%Modrić%');

-- Luciano Vietto (FWD, Argentina)
UPDATE players
SET price = 6.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Vietto%');

-- Phil Foden (MID, England/Manchester City)
UPDATE players
SET price = 6.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Foden%');

-- Bukayo Saka (MID, England/Arsenal)
UPDATE players
SET price = 6.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Saka%');

-- Gianluigi Donnarumma (GK, Italy/Paris Saint-Germain)
UPDATE players
SET price = 6.0
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Donnarumma%');

-- ── Tier B: Quality depth players ──────────────────────────────────────────────

-- Sergei Milinković-Savić (MID, Serbia)
UPDATE players
SET price = 5.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Milinković%' OR name ILIKE '%Milinkovic%');

-- Pedri (MID, Spain/Barcelona)
UPDATE players
SET price = 5.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND (name ILIKE '%Pedri%');

-- Vinícius (any other variation) — generic quality MID
UPDATE players
SET price = 5.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND position = 'MID'
AND price IS NULL;

-- ── Tier C: Solid rotation options ────────────────────────────────────────────

-- Generic assignment for unpriced defenders (international regulars)
UPDATE players
SET price = 5.0
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND position = 'DEF'
AND price IS NULL;

-- ── Tier D: Budget players ────────────────────────────────────────────────────

-- Generic assignment for unpriced goalkeepers
UPDATE players
SET price = 4.5
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND position = 'GK'
AND price IS NULL;

-- ── Apply final defaults to catch any remaining unpriced players ───────────────

UPDATE players
SET price = 4.0
WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
AND price IS NULL;

-- ─── Summary ──────────────────────────────────────────────────────────────────
-- Verify with:
--
--   SELECT position, COUNT(*), MIN(price), MAX(price), ROUND(AVG(price),2) AS avg_price
--   FROM players WHERE tournament_id = '30b6ad7a-7503-409e-b10f-0c74eeb46968'
--   GROUP BY position ORDER BY position;
--
-- Expected: GK avg ~4.5–5.0, DEF ~5.0–5.5, MID ~5.5–6.0, FWD ~6.0–6.5
-- Budget distribution should allow squads at ~85–90M with room to upgrade star players
