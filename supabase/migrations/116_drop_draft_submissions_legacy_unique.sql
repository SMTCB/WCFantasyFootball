-- Migration 116: Drop legacy unique constraint on draft_submissions(league_id, user_id)
-- Migration 104 added (league_id, user_id, phase) uniqueness but never dropped the old
-- (league_id, user_id) constraint, which blocks inserting both 'group' and 'knockout'
-- submissions for the same manager in the same league.

ALTER TABLE draft_submissions
  DROP CONSTRAINT IF EXISTS draft_submissions_league_user_key;
