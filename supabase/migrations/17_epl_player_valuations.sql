-- Migration 17: EPL player valuations + penalty_scored column
-- Purpose:
--   1. Add penalty_scored to player_match_stats (needed for FWD +1 bonus)
--   2. Seed dummy player valuations for EPL dry run (tournament_id = '426')
--      World Cup valuations will be set during the real WC data load.
--
-- Pricing strategy:
--   Budget per squad: 100M for 15 players (11 starters + 4 bench)
--   Average spend: ~6.67M per player
--   Distribution: clear tiers to make budget selection meaningful
--     Tier S  14.0–13.0  Elite forwards / attacking midfielders (1-2 in budget)
--     Tier A  11.0–9.0   Top midfielders / DPs (2-3 in budget)
--     Tier B   8.5–7.5   Quality starters
--     Tier C   7.0–6.0   Solid rotation options
--     Tier D   5.5–5.0   Budget fillers (GKs, backup defenders)
--     Tier E   4.5–4.0   Deep bench / injury cover

-- ─── 1. Add penalty_scored column to player_match_stats ─────────────────────

ALTER TABLE player_match_stats
  ADD COLUMN IF NOT EXISTS penalty_scored INTEGER DEFAULT 0;

-- ─── 2. Set position-based default prices for all EPL players ───────────────
-- These apply to every player in tournament '426' that doesn't get a named override.
-- Using name-based overrides below so the defaults cover the rest.

UPDATE players SET price = 5.0 WHERE tournament_id = '426' AND position = 'GK'  AND price IS NULL;
UPDATE players SET price = 5.0 WHERE tournament_id = '426' AND position = 'DEF' AND price IS NULL;
UPDATE players SET price = 5.5 WHERE tournament_id = '426' AND position = 'MID' AND price IS NULL;
UPDATE players SET price = 6.0 WHERE tournament_id = '426' AND position = 'FWD' AND price IS NULL;

-- ─── 3. Named price overrides ────────────────────────────────────────────────
-- Ordered by tier. All amounts in millions.
-- Player names matched against Forza's nickname or first+last combination
-- (case-insensitive ILIKE). Only applies to tournament_id = '426'.

-- ── Tier S: Elite starters ────────────────────────────────────────────────────

-- Erling Haaland (FWD, Manchester City)
UPDATE players SET price = 14.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Haaland%');

-- Mohamed Salah (FWD, Liverpool)
UPDATE players SET price = 13.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Salah%');

-- ── Tier A: Top midfielders / elite attackers ─────────────────────────────────

-- Cole Palmer (MID, Chelsea) — Forza ID confirmed: 66826838
UPDATE players SET price = 12.0 WHERE tournament_id = '426'
  AND (forza_player_id = '66826838' OR name ILIKE '%Cole Palmer%');

-- Kevin De Bruyne (MID, Manchester City)
UPDATE players SET price = 11.0 WHERE tournament_id = '426'
  AND (name ILIKE '%De Bruyne%');

-- Bukayo Saka (MID, Arsenal)
UPDATE players SET price = 10.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Saka%');

-- Martin Ødegaard (MID, Arsenal)
UPDATE players SET price = 10.0 WHERE tournament_id = '426'
  AND (name ILIKE '%degaard%' OR name ILIKE '%Odegaard%');

-- Phil Foden (MID, Manchester City)
UPDATE players SET price = 9.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Foden%');

-- Ollie Watkins (FWD, Aston Villa)
UPDATE players SET price = 9.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Watkins%');

-- Alexander Isak (FWD, Newcastle)
UPDATE players SET price = 9.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Isak%');

-- ── Tier B: Quality starters ──────────────────────────────────────────────────

-- Son Heung-min (FWD, Tottenham)
UPDATE players SET price = 8.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Son%');

-- Bruno Fernandes (MID, Manchester United)
UPDATE players SET price = 8.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Bruno Fernandes%');

-- Trent Alexander-Arnold (DEF, Liverpool) — may have left for Real Madrid mid-season
UPDATE players SET price = 8.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Alexander-Arnold%' OR name ILIKE '%Trent%');

-- James Maddison (MID, Tottenham)
UPDATE players SET price = 8.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Maddison%');

-- Dominic Solanke (FWD, Tottenham)
UPDATE players SET price = 8.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Solanke%');

-- Marcus Rashford — note: may be on loan (Aston Villa / Barcelona) during 25/26
UPDATE players SET price = 8.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Rashford%');

-- Chris Wood (FWD, Nottingham Forest)
UPDATE players SET price = 8.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Chris Wood%');

-- Bernardo Silva (MID, Manchester City)
UPDATE players SET price = 8.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Bernardo Silva%' OR name ILIKE '%Bernardo%');

-- Virgil van Dijk (DEF, Liverpool)
UPDATE players SET price = 7.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Van Dijk%' OR name ILIKE '%van Dijk%');

-- William Saliba (DEF, Arsenal)
UPDATE players SET price = 7.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Saliba%');

-- Jarrod Bowen (FWD/MID, West Ham)
UPDATE players SET price = 7.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Bowen%');

-- Pedro Neto (MID/FWD, Chelsea)
UPDATE players SET price = 7.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Pedro Neto%');

-- ── Tier C: Solid rotation options ────────────────────────────────────────────

-- Declan Rice (MID, Arsenal)
UPDATE players SET price = 7.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Declan Rice%');

-- Josko Gvardiol (DEF, Manchester City)
UPDATE players SET price = 7.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Gvardiol%');

-- Gabriel Magalhães (DEF, Arsenal)
UPDATE players SET price = 7.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Gabriel%Mag%' OR name ILIKE '%Gabriel Magalh%');

-- Andrew Robertson (DEF, Liverpool)
UPDATE players SET price = 7.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Robertson%');

-- Alisson (GK, Liverpool)
UPDATE players SET price = 6.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Alisson%');

-- David Raya (GK, Arsenal)
UPDATE players SET price = 6.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Raya%');

-- Rodri (MID, Manchester City — may be injured during 25/26)
UPDATE players SET price = 7.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Rodri%' AND name NOT ILIKE '%Rodrigo%');

-- Emile Smith Rowe (MID, Fulham)
UPDATE players SET price = 6.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Smith Rowe%');

-- Noni Madueke (MID, Chelsea)
UPDATE players SET price = 6.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Madueke%');

-- Pascal Groß (MID, Arsenal)
UPDATE players SET price = 6.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Gross%' OR name ILIKE '%Groß%');

-- ── Tier D: Budget GKs + defenders ────────────────────────────────────────────

-- Robert Sánchez (GK, Chelsea) — Forza ID confirmed: 539321
UPDATE players SET price = 5.5 WHERE tournament_id = '426'
  AND (forza_player_id = '539321' OR name ILIKE '%Robert S_nchez%' OR name ILIKE '%Robert Sanchez%');

-- Ederson (GK, Manchester City)
UPDATE players SET price = 5.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Ederson%');

-- Nick Pope (GK, Newcastle)
UPDATE players SET price = 5.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Nick Pope%' OR name ILIKE 'Pope');

-- Jordan Pickford (GK, Everton)
UPDATE players SET price = 5.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Pickford%');

-- Ben White (DEF, Arsenal)
UPDATE players SET price = 6.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Ben White%');

-- Kieran Trippier (DEF, Newcastle)
UPDATE players SET price = 6.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Trippier%');

-- Pedro Porro (DEF, Tottenham)
UPDATE players SET price = 6.0 WHERE tournament_id = '426'
  AND (name ILIKE '%Porro%');

-- Rico Lewis (DEF, Manchester City)
UPDATE players SET price = 5.5 WHERE tournament_id = '426'
  AND (name ILIKE '%Rico Lewis%');

-- ── Apply defaults to anything still null ─────────────────────────────────────
-- (Catches any remaining players not covered by overrides above)

UPDATE players SET price = 5.0 WHERE tournament_id = '426' AND position = 'GK'  AND price IS NULL;
UPDATE players SET price = 4.5 WHERE tournament_id = '426' AND position = 'DEF' AND price IS NULL;
UPDATE players SET price = 5.0 WHERE tournament_id = '426' AND position = 'MID' AND price IS NULL;
UPDATE players SET price = 5.5 WHERE tournament_id = '426' AND position = 'FWD' AND price IS NULL;

-- ─── Summary ──────────────────────────────────────────────────────────────────
-- After applying this migration you can verify with:
--
--   SELECT position, COUNT(*), MIN(price), MAX(price), ROUND(AVG(price),2) AS avg_price
--   FROM players WHERE tournament_id = '426'
--   GROUP BY position ORDER BY position;
--
-- Expected: GK avg ~5.0–5.5, DEF ~5.5–6.0, MID ~6.0–6.5, FWD ~6.5–7.0
-- A squad of 4-5-2 (GK/DEF/MID/FWD) with mid-tier picks should cost ~85–90M,
-- leaving headroom to upgrade 1-2 players to Tier A without busting 100M.
