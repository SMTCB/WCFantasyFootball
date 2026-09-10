-- Migration 290: UCL (tournament 1593) scoring parity with World Cup (429)
--
-- Migration 175 (Scoring v2 Bucket A, 2026-06-13) raised goal points and
-- turned on tackle/interception/key_pass/shot_on_target/big_chance_created
-- scoring for all positions -- but only for the World Cup (429), because
-- tournament 1593 (UCL) didn't exist yet. UCL was later set up on the
-- pre-Bucket-A defaults and never got this update, even though the
-- subsequent Scoring v3 phases (migrations 285, 287) were applied to both
-- tournaments as one shared ruleset going forward. Found 2026-09-10 when
-- Bruno Fernandes and Zalazar (both MID) were awarded 4 pts for a goal
-- instead of 5.
--
-- This migration replaces UCL's GK/DEF/MID/FWD rules with WC's current
-- values wholesale (not just `goal`), bringing UCL into full parity:
--   - goal: GK 5->8, DEF 5->6, MID 4->5, FWD unchanged at 4
--   - tackle/interception/key_pass/big_chance_created/shot_on_target now
--     scored for positions that previously scored 0 for them
--   - MID clean_sheet: 0 -> 1
--   - two fields move the other way to match WC: FWD big_chance_created
--     1 -> 0.5, MID shot_on_target 0.5 -> 0.25 (UCL had drifted ahead of
--     WC on these two, not behind)
-- As a side effect, this also fixes BACKLOG P3 (2026-09-06): UCL's MID/FWD
-- rows used the legacy key `conceded_per_goal` instead of
-- `conceded_2plus_penalty` -- a full replace naturally drops the stale key.
-- UNIVERSAL rules are untouched (already identical between tournaments).

UPDATE scoring_rules SET rules = '{
  "assist": 3,
  "big_chance_created": 0.5,
  "clean_sheet": 4,
  "conceded_2plus_penalty": -0.5,
  "goal": 8,
  "interception": 0.25,
  "key_pass": 0.25,
  "penalty_saved": 5,
  "penalty_scored": 3,
  "save": 0.5,
  "shot_on_target": 0.5,
  "tackle": 0.5
}'::jsonb WHERE tournament_id = '1593' AND position = 'GK';

UPDATE scoring_rules SET rules = '{
  "assist": 3,
  "big_chance_created": 0.5,
  "clean_sheet": 4,
  "conceded_2plus_penalty": -0.5,
  "goal": 6,
  "interception": 0.25,
  "key_pass": 0.25,
  "penalty_saved": 0,
  "penalty_scored": 3,
  "save": 0,
  "shot_on_target": 0.5,
  "tackle": 0.5
}'::jsonb WHERE tournament_id = '1593' AND position = 'DEF';

UPDATE scoring_rules SET rules = '{
  "assist": 3,
  "big_chance_created": 0.5,
  "clean_sheet": 1,
  "conceded_2plus_penalty": 0,
  "goal": 5,
  "interception": 0.25,
  "key_pass": 0.25,
  "penalty_saved": 0,
  "penalty_scored": 3,
  "save": 0,
  "shot_on_target": 0.25,
  "tackle": 0.5
}'::jsonb WHERE tournament_id = '1593' AND position = 'MID';

UPDATE scoring_rules SET rules = '{
  "assist": 3,
  "big_chance_created": 0.5,
  "clean_sheet": 0,
  "conceded_2plus_penalty": 0,
  "goal": 4,
  "interception": 0.25,
  "key_pass": 0.25,
  "penalty_saved": 0,
  "penalty_scored": 3,
  "save": 0,
  "shot_on_target": 0.25,
  "tackle": 0.5
}'::jsonb WHERE tournament_id = '1593' AND position = 'FWD';
