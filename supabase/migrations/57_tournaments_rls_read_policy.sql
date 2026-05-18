-- Migration 57: Add RLS read policy for tournaments table
--
-- Problem: RLS is enabled on tournaments but no policies exist.
-- Default Postgres behaviour: all rows blocked for everyone (including authenticated users).
-- Result: fetchTournaments() always returns [], so the Competition selector never shows options.
--
-- Fix: Allow authenticated users to SELECT all tournaments.
-- The UI already filters to available_for_league_creation=true; the policy just grants access.

CREATE POLICY "Authenticated users can read tournaments"
ON tournaments
FOR SELECT
TO authenticated
USING (true);
