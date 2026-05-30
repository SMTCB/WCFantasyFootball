-- Migration 94: PILOT-04 — tiered player prices for WC 2026 (tournament_id = '429')
--
-- Formula per player: nation_base + position_adj + random_noise
--   nation_base: Tier S=7.0, A=6.0, B=5.0, C=4.0 (based on FIFA world ranking)
--   position_adj: GK=-0.5, DEF=0.0, MID=+0.5, FWD=+1.0
--   random_noise: RANDOM()*1.5 (intra-squad differentiation)
--   cap: 4.0–9.5, rounded to 1 decimal
--
-- Budget: £100M per manager, squad 15 players.
-- Elite squad (all Tier S) would cost ~£95M, forcing trade-offs.
-- Mixed squad (Tier A/B) costs ~£75–85M, leaving room for upgrades.

WITH tier_map (nationality, tier_base) AS (
  VALUES
    -- Tier S — Elite (FIFA top ~10, perennial WC contenders)
    ('France',              7.0),
    ('England',             7.0),
    ('Brazil',              7.0),
    ('Spain',               7.0),
    ('Argentina',           7.0),
    ('Germany',             7.0),
    ('Portugal',            7.0),
    ('Netherlands',         7.0),
    ('Belgium',             7.0),

    -- Tier A — Strong (regular last-16/QF nations, FIFA 11–35)
    ('USA',                 6.0),
    ('Mexico',              6.0),
    ('Uruguay',             6.0),
    ('Japan',               6.0),
    ('Republic of Korea',   6.0),
    ('Senegal',             6.0),
    ('Colombia',            6.0),
    ('Switzerland',         6.0),
    ('Norway',              6.0),
    ('Sweden',              6.0),
    ('Croatia',             6.0),
    ('Morocco',             6.0),
    ('Türkiye',             6.0),
    ('Austria',             6.0),
    ('Scotland',            6.0),

    -- Tier B — Mid (solid qualifiers, FIFA 36–70)
    ('Canada',              5.0),
    ('Australia',           5.0),
    ('Ecuador',             5.0),
    ('Saudi Arabia',        5.0),
    ('Iran',                5.0),
    ('Ghana',               5.0),
    ('Ivory Coast',         5.0),
    ('Egypt',               5.0),
    ('Algeria',             5.0),
    ('Czechia',             5.0),
    ('Bosnia & Herzegovina', 5.0),
    ('Tunisia',             5.0),
    ('Panama',              5.0),
    ('Congo DR',            5.0),

    -- Tier C — Weaker (FIFA 70+, first/second WC appearance)
    ('Paraguay',            4.0),
    ('Qatar',               4.0),
    ('Iraq',                4.0),
    ('Uzbekistan',          4.0),
    ('Jordan',              4.0),
    ('South Africa',        4.0),
    ('Curaçao',             4.0),
    ('Haiti',               4.0),
    ('Cabo Verde',          4.0),
    ('New Zealand',         4.0)
)
UPDATE players p
SET price = ROUND(
  GREATEST(4.0, LEAST(9.5,
    t.tier_base
    + CASE p.position
        WHEN 'GK'  THEN -0.5
        WHEN 'DEF' THEN  0.0
        WHEN 'MID' THEN  0.5
        WHEN 'FWD' THEN  1.0
        ELSE             0.0
      END
    + (RANDOM() * 1.5)
  ))::numeric, 1
)
FROM tier_map t
WHERE p.tournament_id = '429'
  AND p.nationality = t.nationality;

-- Players with null nationality (EPL/seeded data mixed in) — apply neutral mid-tier
UPDATE players
SET price = ROUND(GREATEST(4.0, LEAST(7.0, 5.0 + (RANDOM() * 1.5)))::numeric, 1)
WHERE tournament_id = '429'
  AND nationality IS NULL;
