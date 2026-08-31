-- Migration 269: same overload-ambiguity bug as 267/268, in seed_cup_clubs()
-- this time (06_cup_pool_management.sql's 1-arg version vs 74_draft_cup_fixes.sql's
-- 2-arg version with p_tournament_id DEFAULT NULL, re-added by 122 in June).
-- Confirmed live: run-draft-lottery calls seed_cup_clubs({ p_league_id }) with
-- exactly the ambiguous 1-arg shape, silently failing (error not checked) since
-- at least 2026-06-03 — cup-format leagues in group phase never get their cup
-- clubs auto-seeded. Fix: drop the narrower overload, keep the one with
-- p_tournament_id (defaults NULL, existing callers unaffected).

DROP FUNCTION IF EXISTS public.seed_cup_clubs(uuid);
