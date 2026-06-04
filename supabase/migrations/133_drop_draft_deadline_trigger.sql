-- Migration 133: Drop draft_deadline_check trigger on draft_submissions
--
-- The draft deadline is now informational only. The lottery is always manually
-- triggered by the commissioner via the admin panel — it never auto-runs on a
-- deadline. Therefore, blocking submissions after the deadline is wrong:
-- managers should be able to update their wishlist until the admin actually
-- runs the lottery.
--
-- The run-draft-lottery cron was also disabled (active=false) in prod as part
-- of this change — the cron.alter_job call is not idempotent in SQL, so
-- it was done once directly and is not repeated here.

DROP TRIGGER IF EXISTS draft_deadline_check ON draft_submissions;
DROP TRIGGER IF EXISTS check_draft_submission_deadline ON draft_submissions;
