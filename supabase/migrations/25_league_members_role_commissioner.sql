-- Migration 25: Add 'commissioner' to league_members role check constraint
-- The create_league RPC inserts role='commissioner' but the constraint
-- only allowed 'member' and 'admin'. This migration widens the constraint.

ALTER TABLE league_members
  DROP CONSTRAINT IF EXISTS league_members_role_check;

ALTER TABLE league_members
  ADD CONSTRAINT league_members_role_check
  CHECK (role IN ('member', 'admin', 'commissioner'));
