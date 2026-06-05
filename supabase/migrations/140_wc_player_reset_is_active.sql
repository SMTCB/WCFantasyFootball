-- Migration 140: WC player reset + is_active soft-delete
--
-- 1. Add is_active column to players (soft-delete flag)
-- 2. Clear FK references in dependent tables that block deletion (NO ACTION constraints)
-- 3. Delete all WC players (tournament_id 426 + 429) for a clean resync
--
-- Safe to run: fantasy_points/transfers have no WC rows; cascade tables
-- (player_match_stats, player_status, auction_listings, daily_jokers,
--  player_availability_flags, trade_proposals, trade_listings) auto-delete.

-- ── 1. Add is_active column ────────────────────────────────────────────────
ALTER TABLE players ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- ── 2. Clear NO ACTION FK refs that would block deletion ──────────────────

-- squads: clear captain_id, joker_player_id, players array, starting_xi
-- for all squads belonging to WC leagues
UPDATE squads s
SET
  captain_id     = NULL,
  joker_player_id = NULL,
  players        = '{}',
  starting_xi    = '{}'
FROM leagues l
WHERE s.league_id = l.id
  AND l.tournament_id IN ('426', '429');

-- match_events: null out player_id for WC fixtures (keeps the event row for history)
UPDATE match_events me
SET player_id = NULL
FROM fixtures f
WHERE me.fixture_id = f.id
  AND f.tournament_id IN ('426', '429');

-- top_scorer_predictions: null out player refs
UPDATE top_scorer_predictions
SET
  predicted_player_id   = NULL,
  actual_top_scorer_id  = NULL
WHERE predicted_player_id LIKE 'fp-%-426'
   OR predicted_player_id LIKE 'fp-%-429'
   OR actual_top_scorer_id LIKE 'fp-%-426'
   OR actual_top_scorer_id LIKE 'fp-%-429';

-- matchday_recaps: null out player refs
UPDATE matchday_recaps
SET
  best_player_id  = NULL,
  captain_id      = NULL,
  joker_player_id = NULL
WHERE best_player_id  LIKE 'fp-%-426' OR best_player_id  LIKE 'fp-%-429'
   OR captain_id      LIKE 'fp-%-426' OR captain_id      LIKE 'fp-%-429'
   OR joker_player_id LIKE 'fp-%-426' OR joker_player_id LIKE 'fp-%-429';

-- ── 3. Delete all WC players (cascades handle the rest) ───────────────────
DELETE FROM players WHERE tournament_id IN ('426', '429');
