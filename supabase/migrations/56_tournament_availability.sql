-- Migration 56: Tournament availability control
--
-- Problem: Tournaments with sync_enabled=true appear in league creation UI,
-- but we need to control visibility separately from syncing. Example: WC should
-- sync data but not be selectable in league creation until it's ready.
--
-- Solution: Add available_for_league_creation flag to decouple syncing from
-- user-facing availability.

-- Add column to control user visibility in league creation
ALTER TABLE tournaments
ADD COLUMN available_for_league_creation BOOLEAN NOT NULL DEFAULT false;

-- Set EPL (426) as available (it's production-ready)
UPDATE tournaments
SET available_for_league_creation = true
WHERE forza_id = '426';

-- WC and other tournaments remain unavailable until explicitly enabled
-- (They can still sync data via sync_enabled = true)
