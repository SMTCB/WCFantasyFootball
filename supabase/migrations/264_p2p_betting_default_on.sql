-- Group Bets (p2p_betting_enabled) should be opt-out, not opt-in: on by default for
-- every Clubhouse, with owners able to switch it off to restrict betting to 1:1 challenges.
-- Flips the column default and backfills every existing Clubhouse currently set to false —
-- there's no way to distinguish "still on the old implicit default" from "an owner
-- deliberately turned it off," so this backfill re-enables it everywhere.

ALTER TABLE circles ALTER COLUMN p2p_betting_enabled SET DEFAULT true;

UPDATE circles SET p2p_betting_enabled = true WHERE p2p_betting_enabled = false;
