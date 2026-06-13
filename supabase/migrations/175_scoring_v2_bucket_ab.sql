-- Migration 175: Scoring v2 Bucket A+B — scoring_rules update for tournament 429 (WC)
--
-- Bucket A (config-only, all positions now score):
--   big_chance_created, interception, key_pass, shot_on_target, tackle
-- Goal values increased: GK 5->8, DEF 5->6, MID 4->5, FWD unchanged at 4
-- MID clean_sheet introduced: 0 -> 1 (45/60min threshold handled in calculate-scores)
-- penalty_missed: -1 -> -2 (UNIVERSAL)
--
-- Bucket B (config half — code half in calculate-scores v26):
--   conceded_2plus_penalty: -0.5 for GK/DEF, applied to each goal conceded beyond the first
--   (GK clean-sheet 45min threshold is a calculate-scores code change, no config needed)
--
-- conceded_per_goal (legacy, unused) dropped in favour of conceded_2plus_penalty

UPDATE scoring_rules SET rules = '{
  "assist": 3,
  "big_chance_created": 0.5,
  "clean_sheet": 4,
  "conceded_2plus_penalty": -0.5,
  "goal": 8,
  "interception": 0.25,
  "key_pass": 0.25,
  "penalty_saved": 5,
  "penalty_scored": 0,
  "save": 0.5,
  "shot_on_target": 0.5,
  "tackle": 0.5
}'::jsonb WHERE tournament_id = '429' AND position = 'GK';

UPDATE scoring_rules SET rules = '{
  "assist": 2,
  "big_chance_created": 0.5,
  "clean_sheet": 4,
  "conceded_2plus_penalty": -0.5,
  "goal": 6,
  "interception": 0.25,
  "key_pass": 0.25,
  "penalty_saved": 0,
  "penalty_scored": 0,
  "save": 0,
  "shot_on_target": 0.5,
  "tackle": 0.5
}'::jsonb WHERE tournament_id = '429' AND position = 'DEF';

UPDATE scoring_rules SET rules = '{
  "assist": 2,
  "big_chance_created": 0.5,
  "clean_sheet": 1,
  "conceded_2plus_penalty": 0,
  "goal": 5,
  "interception": 0.25,
  "key_pass": 0.25,
  "penalty_saved": 0,
  "penalty_scored": 0,
  "save": 0,
  "shot_on_target": 0.25,
  "tackle": 0.5
}'::jsonb WHERE tournament_id = '429' AND position = 'MID';

UPDATE scoring_rules SET rules = '{
  "assist": 2,
  "big_chance_created": 0.5,
  "clean_sheet": 0,
  "conceded_2plus_penalty": 0,
  "goal": 4,
  "interception": 0.25,
  "key_pass": 0.25,
  "penalty_saved": 0,
  "penalty_scored": 0,
  "save": 0,
  "shot_on_target": 0.25,
  "tackle": 0.5
}'::jsonb WHERE tournament_id = '429' AND position = 'FWD';

UPDATE scoring_rules SET rules = jsonb_set(rules, '{penalty_missed}', '-2')
  WHERE tournament_id = '429' AND position = 'UNIVERSAL';
