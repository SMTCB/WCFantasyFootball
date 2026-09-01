-- Migration 275: undo migration 274's unintended reactivation side effect
--
-- cron.unschedule() + cron.schedule() (the pattern used by 274, matching every
-- prior cron-editing migration in this project) always creates the new job
-- with active = true — there is no way to pass an initial active state to
-- cron.schedule(). All 12 jobs 274 touched were active = false beforehand
-- (they'd been turned off, unrelated to this session's credential fix), so
-- applying 274 silently turned them all back on. Caught and manually reverted
-- via cron.alter_job() within minutes of applying 274, before any of them
-- fired — this migration exists only so the migration files replay to the
-- same state that's actually live, for audit-trail accuracy. No bearer or
-- schedule changes here, active status only.

SELECT cron.alter_job(job_id := jobid, active := false)
FROM cron.job
WHERE jobname IN (
  'award-season-trophies',
  'calculate-scores-late-finishers',
  'calculate-scores-live',
  'calculate-scores-post-match',
  'check-cron-health',
  'generate-frontpage-editions',
  'ingest-match-events-live',
  'resolve-finished-bets',
  'run-draft-lottery',
  'run-reverse-standings-draft',
  'run-wishlist-draft',
  'sync-cup-eliminations'
);
