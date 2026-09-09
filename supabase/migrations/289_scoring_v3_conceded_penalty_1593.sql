-- Migration 289: Bring tournament 1593's GK/DEF conceded-goals penalty into
-- parity with tournament 429 (added there by migration 175).
-- Tournament 1593's GK/DEF rows were never migrated: they still carry the
-- legacy unused `conceded_per_goal: 0` key instead of `conceded_2plus_penalty`,
-- so scoring-logic.js's `rules.conceded_2plus_penalty ?? 0` silently applies
-- no penalty at all for goals conceded, regardless of scoreline.
-- Fix: -0.5 for each goal conceded beyond the first (matches 429 exactly),
-- and drop the stale `conceded_per_goal` key (429's rows no longer have it).
-- Surgical jsonb_set / '-' operator only -- never a full replace.

update public.scoring_rules
set rules = (jsonb_set(rules, '{conceded_2plus_penalty}', '-0.5'::jsonb) - 'conceded_per_goal')
where tournament_id = '1593'
  and position in ('GK', 'DEF');
