-- Migration 240: schedule check-cron-health (OPS-2 part c, final piece)
--
-- get_cron_failure_streaks() (migration 223) and the check-cron-health Edge
-- Function (PR #724) have been code-complete but never wired to a schedule.
-- This adds the hourly cron entry so failed-cron alerting actually runs.
--
-- Same net.http_post + hardcoded service_role bearer pattern as every other
-- Edge-Function-invoking cron in this project (see migrations 86/90/91/181) —
-- current_setting()-based auth doesn't resolve inside pg_cron's session here.

SELECT cron.schedule(
  'check-cron-health',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/check-cron-health',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
      ),
      body    := '{}'::jsonb
    );
  $$
);
