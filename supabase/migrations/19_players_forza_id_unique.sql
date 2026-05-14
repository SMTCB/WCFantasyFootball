-- Migration 19: Add UNIQUE constraint on players.forza_player_id
-- Required for sync-players Edge Function to upsert player data via ON CONFLICT (forza_player_id)
-- Without this constraint, the upsert fails with "no unique or exclusion constraint matching the ON CONFLICT specification"

ALTER TABLE public.players
  ADD CONSTRAINT players_forza_player_id_key UNIQUE (forza_player_id);
