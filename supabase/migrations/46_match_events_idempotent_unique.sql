-- Migration 46: Add unique constraint to match_events for idempotent ingestion
--
-- ingest-match-events previously deleted all events for a fixture before re-inserting
-- them on every run. This is non-idempotent: two concurrent runs can interleave their
-- DELETE and INSERT, causing one run to wipe the other's events (silent data loss).
--
-- Fix: add a partial unique index on (fixture_id, type, minute, player_id) so the
-- Edge Function can use INSERT ... ON CONFLICT DO NOTHING (upsert with ignoreDuplicates)
-- instead of delete + insert.
--
-- The index is partial (WHERE player_id IS NOT NULL) because substitution events
-- can have a null player_id (player subbed off not in our DB); those are less
-- critical for scoring and retain the old delete+re-insert path for now.

CREATE UNIQUE INDEX IF NOT EXISTS match_events_ingest_unique
  ON match_events (fixture_id, type, minute, player_id)
  WHERE player_id IS NOT NULL;
