-- Migration 63: Fix dummy fixture live status
-- The seeded md2-f3 (Bayern vs AC Milan) is marked as 'live' in migration 12,
-- which blocks all transfers due to transfer window enforcement check.
-- Update it to 'finished' to unblock transfers while keeping test data intact.

update fixtures
set status = 'finished', minute = '90'
where id = 'md2-f3';
