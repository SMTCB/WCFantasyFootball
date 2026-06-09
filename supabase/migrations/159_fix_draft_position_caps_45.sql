-- Migration 159: fix draft_position_caps for 45-slot wish lists
--
-- Migration 156 raised draft_list_size to 45 but left draft_position_caps unchanged.
-- Old caps (GK:4 + DEF:10 + MID:10 + FWD:6 = 30) meant auto-fill could never exceed
-- 30 players regardless of the 45-slot list size.
--
-- New caps are 3x the squad position limits (2 GK / 5 DEF / 5 MID / 3 FWD):
--   GK:6 + DEF:15 + MID:15 + FWD:9 = 45
--
-- Applied to all noduplicate leagues with draft_list_size = 45, so caps and list
-- size stay consistent. Leagues with custom caps outside these values are unaffected
-- because we target format = 'noduplicate' AND draft_list_size = 45 specifically.

UPDATE leagues
SET draft_position_caps = '{"GK": 6, "DEF": 15, "MID": 15, "FWD": 9}'::jsonb
WHERE format = 'noduplicate'
  AND draft_list_size = 45;
