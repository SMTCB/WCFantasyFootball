-- Migration 58: Cleanup tournaments — keep only Premier League
--
-- Removes World Cup tournament and all associated data.
-- Keeps Premier League 2025-26 as the sole active tournament.
--
-- Cascade delete order:
-- 1. Squads in WC leagues
-- 2. Leagues using WC tournament
-- 3. Fixtures for WC
-- 4. Players for WC
-- 5. Tournament record

DELETE FROM squads
WHERE league_id IN (SELECT id FROM leagues WHERE tournament_id = '429');

DELETE FROM leagues
WHERE tournament_id = '429';

DELETE FROM fixtures
WHERE tournament_id = '429';

DELETE FROM players
WHERE tournament_id = '429';

DELETE FROM tournaments
WHERE forza_id = '429';
