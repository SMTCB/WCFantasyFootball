-- Migration 20: Fix players UNIQUE constraint for sync-players upsert
-- sync-players uses onConflict: 'forza_player_id,tournament_id' (composite key).
-- Migration 19 added a single-column UNIQUE on forza_player_id only — that's wrong.
-- Drop the single-column constraint and add the correct composite one.

ALTER TABLE public.players
  DROP CONSTRAINT IF EXISTS players_forza_player_id_key;

ALTER TABLE public.players
  ADD CONSTRAINT players_forza_player_id_tournament_id_key
  UNIQUE (forza_player_id, tournament_id);
