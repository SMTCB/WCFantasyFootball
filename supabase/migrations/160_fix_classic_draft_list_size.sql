-- Migration 160: patch leagues whose draft_list_size / draft_position_caps were not
-- updated by migration 156.
--
-- Migration 156 ran:
--   UPDATE leagues SET draft_list_size = 45 WHERE league_mode = 'draft'
-- This missed classic-mode leagues, leaving them with draft_list_size=30 and
-- draft_position_caps summing to 30 ({GK:4,DEF:10,MID:10,FWD:6}).
-- The auto-fill algorithm respects both limits, so it stopped at 30 even when
-- the UI showed 45 slots available.
--
-- Fix 1: ensure draft_list_size=45 for all leagues.
UPDATE leagues
SET draft_list_size = 45
WHERE draft_list_size < 45;

-- Fix 3: update column default so future leagues start with caps that sum to 45.
ALTER TABLE leagues
  ALTER COLUMN draft_position_caps
  SET DEFAULT '{"GK":6,"DEF":15,"MID":15,"FWD":9}'::jsonb;

-- Fix 2: ensure draft_position_caps sum to 45 for all leagues already on 45.
-- Old caps {GK:4,DEF:10,MID:10,FWD:6}=30 are replaced with {GK:6,DEF:15,MID:15,FWD:9}=45.
UPDATE leagues
SET draft_position_caps = '{"GK":6,"DEF":15,"MID":15,"FWD":9}'::jsonb
WHERE draft_list_size = 45
  AND (
    COALESCE((draft_position_caps->>'GK')::int,0)
    + COALESCE((draft_position_caps->>'DEF')::int,0)
    + COALESCE((draft_position_caps->>'MID')::int,0)
    + COALESCE((draft_position_caps->>'FWD')::int,0)
  ) < 45;
