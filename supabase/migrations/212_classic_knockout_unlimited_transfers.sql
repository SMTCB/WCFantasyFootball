-- ✅ APPLIED TO PRODUCTION 2026-06-28 (v2 session)
-- Migration 192: automatic unlimited transfers for classic leagues during the
-- group→knockout transition.
--
-- Previously, classic leagues only got unlimited transfers if a commissioner
-- manually flipped league_config.free_transfers = true. There was no built-in
-- rule for the group→knockout boundary, even though every manager needs to
-- rebuild a chunk of their squad around eliminated nations at that point.
--
-- This reuses club_cap_rules (already keyed by tournament_id + round_suffix,
-- the same table that drives the per-round club cap) so a single row edit can
-- change which round gets the unlimited-transfer treatment for any tournament.
-- Seeded for round_suffix='r4' (Round of 32 — the first knockout round) on
-- both WC tournaments (429, 623), matching the documented r4=R32 boundary.
--
-- The existing manual league_config.free_transfers toggle is untouched and
-- still works independently — either condition being true lifts the cap.

ALTER TABLE club_cap_rules
  ADD COLUMN IF NOT EXISTS unlimited_transfers boolean NOT NULL DEFAULT false;

UPDATE club_cap_rules
SET unlimited_transfers = true
WHERE tournament_id IN ('429', '623')
  AND round_suffix = 'r4';
