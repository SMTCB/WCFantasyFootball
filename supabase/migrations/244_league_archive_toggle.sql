-- Migration 244: League archive/active toggle (B-13)
-- Lets a commissioner mark a finished/dormant league as archived, which pauses
-- background jobs (scoring, matchday sync, drafts, cup elimination) for it
-- without deleting anything. Purely additive — no existing column/table changed.

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false NOT NULL;
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS archived_at timestamptz;
