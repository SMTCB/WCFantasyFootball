-- Migration 255: schedule run-wishlist-draft (safety net)
--
-- Primary allocation path rides auto-open-transfer-window's existing 2h cron
-- (see _shared/wishlistDraft.ts called inline from that function) — this job
-- is NOT the main trigger. It exists purely as a recovery path: if the inline
-- call inside auto-open-transfer-window fails transiently for a league, this
-- cron self-discovers any league+round with pending submissions and an
-- already-open transfer window but no `processed_at` stamp, and resolves it.
-- Hourly cadence — frequent enough to catch a missed round quickly without
-- being the primary driver.
--
-- Same net.http_post + hardcoded service_role bearer pattern as every other
-- Edge-Function-invoking cron in this project (see migrations 86/90/91/181/
--240/249). Known repo-wide anti-pattern (plaintext JWT committed to git),
-- carried forward here for consistency — flagged, not fixed, in this PR.
--
-- Registered inactive on creation, same as every other cron since the
-- 2026-07-31 maintenance-mode freeze (see docs/platform_revision/CUTOVER_PLAN.md).
-- Requires separate explicit approval to flip active in a live session.
--
-- NOTE: a direct `UPDATE cron.job SET active = false ...` here fails with
-- "permission denied for table job" — cron.schedule() creates the job row
-- owned by a role this connection can't UPDATE directly. cron.alter_job()
-- is SECURITY DEFINER and is the correct way to flip `active` post-creation.

SELECT cron.schedule(
  'run-wishlist-draft',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/run-wishlist-draft',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
      ),
      body    := '{}'::jsonb
    );
  $$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'run-wishlist-draft'),
  active := false
);
