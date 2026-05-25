-- Migration 78: dead code cleanup
-- Drops the obsolete calculate_player_points SQL function (and dependents).
-- The calculate-scores edge function reads scoring_rules directly; this SQL
-- function was superseded by migration 53 and is no longer called anywhere.

DROP FUNCTION IF EXISTS public.calculate_player_points(TEXT, TEXT, JSONB, JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.calculate_player_points(TEXT, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS public.calculate_player_points CASCADE;
