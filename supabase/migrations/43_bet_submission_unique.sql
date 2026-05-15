-- Migration 43: Unique constraint on bet submissions
-- Prevents a squad from submitting more than one answer per bet instance.
-- The UI already guards against this, but the DB constraint is the source of truth.

ALTER TABLE bet_submissions
  ADD CONSTRAINT bet_submissions_unique_squad_bet
  UNIQUE (bet_instance_id, squad_id);
