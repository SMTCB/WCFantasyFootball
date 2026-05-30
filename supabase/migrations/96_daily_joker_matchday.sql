-- Migration 96: Change daily_jokers unique scope from calendar-day to matchday
--
-- Previously: one joker per user per league per calendar date (joker_date).
-- Now: one joker per user per league per matchday_id (e.g. '426-r6').
-- This ensures a single joker slot for the entire matchday even if it spans
-- multiple calendar days (WC group stage, UCL rounds, etc.).
--
-- Backward compat: joker_date column is kept for historical records.
-- Old per-day unique constraint is dropped; new partial unique index enforces
-- the matchday-scoped uniqueness only for rows where matchday_id IS NOT NULL.

-- 1. Add matchday_id column (nullable for backward compat with existing rows)
ALTER TABLE daily_jokers
  ADD COLUMN IF NOT EXISTS matchday_id TEXT;

-- 2. Drop old per-day unique constraint
--    Name from migration 10: UNIQUE(user_id, league_id, joker_date)
ALTER TABLE daily_jokers
  DROP CONSTRAINT IF EXISTS daily_jokers_user_id_league_id_joker_date_key;

-- 3. Partial unique index: enforce one joker per matchday when matchday_id is set
CREATE UNIQUE INDEX IF NOT EXISTS daily_jokers_user_league_matchday_uq
  ON daily_jokers(user_id, league_id, matchday_id)
  WHERE matchday_id IS NOT NULL;

-- 4. Index for efficient matchday queries
CREATE INDEX IF NOT EXISTS idx_daily_jokers_user_matchday
  ON daily_jokers(user_id, matchday_id)
  WHERE matchday_id IS NOT NULL;
