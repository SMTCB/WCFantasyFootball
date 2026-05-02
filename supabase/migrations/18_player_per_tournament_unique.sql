-- Migration 18: Fix player uniqueness to be per-tournament, not global
--
-- Problem:
--   players_forza_player_id_idx enforces UNIQUE(forza_player_id) globally.
--   Forza player IDs identify real people — Bukayo Saka has the same forza_player_id
--   in EPL (Arsenal) AND in World Cup (England). With a global unique constraint,
--   syncing both tournaments overwrites his EPL record with WC data, breaking
--   EPL match ingestion for any fixture involving Arsenal.
--
-- Fix:
--   Drop the global unique index and replace with a composite unique index on
--   (forza_player_id, tournament_id). A player can exist once per tournament.
--   Internal `id` is already being set as 'fp-{forza_player_id}-{tournament_id}'
--   by sync-players (updated in this session), so primary key uniqueness holds.

-- Drop the global unique constraint
DROP INDEX IF EXISTS players_forza_player_id_idx;

-- Add the tournament-scoped composite unique index
-- Partial: only enforced when both columns are non-null (handles legacy mock rows)
CREATE UNIQUE INDEX IF NOT EXISTS players_forza_player_tournament_idx
  ON players(forza_player_id, tournament_id)
  WHERE forza_player_id IS NOT NULL
    AND tournament_id IS NOT NULL;

-- Note on the `teams` table:
--   teams.forza_team_id is also globally unique (UNIQUE NOT NULL on the column).
--   This is acceptable for EPL + WC because national teams (Portugal, Brazil)
--   and EPL clubs (Arsenal, Chelsea) are distinct Forza entities with different
--   team IDs. If a third tournament is ever added that re-uses a team (e.g., a
--   club in both EPL and a cup competition), apply the same composite fix to teams.
