-- Migration 287: Scoring v3 penalty goals (tournaments 429, 1593)
-- Penalty conversions score a flat +3 via penalty_scored, replacing the
-- position's per-goal rate for that event (see ingest-match-events fix:
-- a penalty goal no longer also increments the general goals tally).
-- Surgical jsonb_set only -- never a full replace.

update public.scoring_rules
set rules = jsonb_set(rules, '{penalty_scored}', '3'::jsonb)
where tournament_id in ('429', '1593')
  and position in ('GK', 'DEF', 'MID', 'FWD');
