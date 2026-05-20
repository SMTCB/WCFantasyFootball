-- Migration 63: Add UNIQUE constraint on fantasy_points (squad_id, matchday_id)
--
-- Without this, upsert onConflict:'squad_id,matchday_id' in rollupSquads silently
-- inserts new rows instead of updating existing ones, causing stale squad totals
-- to persist across re-runs of calculate-scores.

ALTER TABLE public.fantasy_points
  ADD CONSTRAINT fantasy_points_squad_matchday_unique
  UNIQUE (squad_id, matchday_id);
