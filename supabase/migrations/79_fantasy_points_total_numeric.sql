-- Fix fantasy_points.total column type: integer → numeric
-- Required because scoring rules use fractional points (tackles=0.5, interceptions=0.25)
-- and calculate-scores produces decimal totals like 20.45.
ALTER TABLE fantasy_points ALTER COLUMN total TYPE numeric USING total::numeric;
