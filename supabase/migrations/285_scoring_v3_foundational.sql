-- Migration 285: Scoring v3 foundational rules (tournaments 429, 1593)
-- Flat +3 assist for DEF/MID/FWD (GK already 3), penalty_missed aligned to -2
-- everywhere, and new UNIVERSAL appearance/minutes_60_bonus terms replacing
-- the old per-90-minute rate. Card no-stack rule is code-only (scoring-logic.js)
-- and needs no data change. Surgical jsonb_set only -- never a full replace.

-- Assist -> 3 for DEF/MID/FWD, both tournaments (GK rows already 3, untouched)
update public.scoring_rules
set rules = jsonb_set(rules, '{assist}', '3'::jsonb)
where tournament_id in ('429', '1593')
  and position in ('DEF', 'MID', 'FWD');

-- UNIVERSAL: penalty_missed -> -2 (1593 only; 429 is already -2)
update public.scoring_rules
set rules = jsonb_set(rules, '{penalty_missed}', '-2'::jsonb)
where tournament_id = '1593'
  and position = 'UNIVERSAL';

-- UNIVERSAL: add appearance (+1) and minutes_60_bonus (+1), both tournaments
update public.scoring_rules
set rules = jsonb_set(
              jsonb_set(rules, '{appearance}', '1'::jsonb),
              '{minutes_60_bonus}', '1'::jsonb
            )
where tournament_id in ('429', '1593')
  and position = 'UNIVERSAL';
