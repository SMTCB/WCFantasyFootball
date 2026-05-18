-- Migration 63: Add configuration columns to leagues table
-- Adds columns needed for competition-agnostic league configuration:
-- - squad_size: number of players in the final squad (default 15)
-- - draft_list_size: number of players managers rank in draft phase (default 30)
-- - draft_position_caps: JSON object with position limits during draft
-- - position_limits: JSON object with position limits for the final squad
-- - min_formation: JSON object with minimum players per position

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS squad_size INTEGER DEFAULT 15;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_list_size INTEGER DEFAULT 30;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_position_caps JSONB DEFAULT '{"GK":4,"DEF":10,"MID":10,"FWD":6}'::jsonb;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS position_limits JSONB DEFAULT '{"GK":2,"DEF":5,"MID":5,"FWD":3}'::jsonb;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS min_formation JSONB DEFAULT '{"GK":1,"DEF":3,"MID":2,"FWD":1}'::jsonb;

-- Update any existing leagues to have the correct draft_list_size
-- Draft mode leagues should have draft_list_size = 30 (not 15)
-- (Classic mode inherits the default 30 which applies to draft submission)
UPDATE leagues SET draft_list_size = 30 WHERE draft_list_size IS NULL OR draft_list_size = 15;
