-- Migration 249: schedule award-season-trophies (ARCH-1d)
--
-- Same net.http_post + hardcoded service_role bearer pattern as every other
-- Edge-Function-invoking cron in this project (see migrations 86/90/91/181/240).
--
-- Registered inactive on creation: all other crons were frozen 2026-07-31
-- (post v2 cutover, site walled behind MAINTENANCE_MODE) and this one must
-- not start firing ahead of that group. It gets re-enabled alongside the
-- other 19 at Phase 4 reopen (see docs/platform_revision/CUTOVER_PLAN.md).
-- Daily cadence — season boundaries move in days/weeks, not minutes.

-- NOTE: a direct `UPDATE cron.job SET active = false ...` here fails with
-- "permission denied for table job" — cron.schedule() creates the job row
-- owned by a role this connection can't UPDATE directly. cron.alter_job()
-- is SECURITY DEFINER and is the correct way to flip `active` post-creation.

SELECT cron.schedule(
  'award-season-trophies',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/award-season-trophies',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
      ),
      body    := '{}'::jsonb
    );
  $$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'award-season-trophies'),
  active := false
);
