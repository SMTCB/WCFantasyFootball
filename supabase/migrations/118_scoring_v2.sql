-- Migration 118: Scoring System V2 — Additive Position-Aware Scoring
-- Replaces FPL-style scoring (BPS bonus + tier multipliers) with a clean
-- additive model where every point traces directly to a stat.
--
-- Changes:
--   1. Add key_passes + big_chances_created columns to player_match_stats
--   2. Update scoring_rules for all tournaments (426, 429, 1593) to V2 values
--
-- Design doc: docs/architecture/SCORING_APPROACH_V2.md

-- ── 1. New columns on player_match_stats ──────────────────────────────────────

ALTER TABLE player_match_stats
  ADD COLUMN IF NOT EXISTS key_passes          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS big_chances_created INTEGER NOT NULL DEFAULT 0;

-- ── 2. Update scoring_rules to V2 for all active tournaments ─────────────────
-- Key changes vs V1:
--   GK:  +assist(3), +save(0.5), conceded_per_goal removed (0), goals_conceded penalty removed
--   DEF: goal(4→5), assist(1→2), tackle/interception unchanged
--   MID: goal(5→4), assist(1→2), clean_sheet removed (0), +key_pass(0.25), +shot_on_target(0.5)
--   FWD: goal(3→4), assist(1→2), penalty_scored removed (0), +shot_on_target(0.25), +big_chance_created(1.0)
--   ALL: BPS bonus removed — no code changes needed (bonus_points stays in schema for history)
--        conceded_per_goal: 0 for all (also fixes key-name mismatch with DB's old conceded_per_2_goals key)

UPDATE scoring_rules
SET rules = '{"goal":5,"assist":3,"clean_sheet":4,"conceded_per_goal":0,"penalty_saved":5,"save":0.5,"tackle":0,"interception":0,"penalty_scored":0,"key_pass":0,"shot_on_target":0,"big_chance_created":0}'::jsonb
WHERE position = 'GK';

UPDATE scoring_rules
SET rules = '{"goal":5,"assist":2,"clean_sheet":4,"conceded_per_goal":0,"penalty_saved":0,"save":0,"tackle":0.5,"interception":0.25,"penalty_scored":0,"key_pass":0,"shot_on_target":0,"big_chance_created":0}'::jsonb
WHERE position = 'DEF';

UPDATE scoring_rules
SET rules = '{"goal":4,"assist":2,"clean_sheet":0,"conceded_per_goal":0,"penalty_saved":0,"save":0,"tackle":0,"interception":0,"penalty_scored":0,"key_pass":0.25,"shot_on_target":0.5,"big_chance_created":0}'::jsonb
WHERE position = 'MID';

UPDATE scoring_rules
SET rules = '{"goal":4,"assist":2,"clean_sheet":0,"conceded_per_goal":0,"penalty_saved":0,"save":0,"tackle":0,"interception":0,"penalty_scored":0,"key_pass":0,"shot_on_target":0.25,"big_chance_created":1.0}'::jsonb
WHERE position = 'FWD';

-- UNIVERSAL row unchanged (own_goal, red_card, yellow_card, penalty_missed)
