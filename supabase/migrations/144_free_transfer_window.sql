-- Migration 144: Free transfer window — commissioner-controlled unlimited window
--
-- Allows the commissioner to open a time-bounded unlimited transfer window for
-- any league, at any point during the season. Bypasses the matchday deadline
-- lock, the live-fixture lock, and the 3/round transfer limit. Normal constraints
-- (budget, position cap, club cap, draft ownership) still apply.
--
-- Use cases:
--   • Between group stage and knockout stage (the most common need)
--   • After a draft runs late and managers need more time to adjust
--   • Any period where the commissioner wants to give a "free pass"
--
-- Implementation:
--   • A 'unlimited' transfer_windows row (window_type='unlimited',
--     transfers_remaining=NULL) is created by the commissioner.
--   • get_transfer_window_status() already reads manual windows first, so
--     the UI (TransferWindowBanner) will show OPEN · UNLIMITED automatically.
--   • process-transfer/index.js checks for an active 'unlimited' window and
--     bypasses all deadline/live-fixture/limit checks when one is found.
--
-- Schema change:
--   round_number was NOT NULL with a UNIQUE (league_id, round_number) constraint.
--   Free windows don't belong to a specific round, so we allow NULL.
--   PostgreSQL treats NULLs as distinct in unique constraints, so multiple
--   time-bounded free windows can coexist without conflicting.

ALTER TABLE transfer_windows
  ALTER COLUMN round_number DROP NOT NULL;
