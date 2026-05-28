-- Migration 87: Fix calculate-scores-post-match cron — wrong fixture status value
--
-- Root cause: migrations 67 and 86 used `f.status = 'after'` but the `match_status`
-- enum only has 'scheduled', 'live', 'finished'. There is no 'after' value.
-- As a result the cron's WHERE clause never matches any rows → post-match score
-- calculation has NEVER run automatically since the cron was created.
-- Manual triggering via the Admin panel (which passes fixture_id directly) still works.
--
-- Fix: replace 'after' with 'finished' (the correct post-match enum value).

SELECT cron.unschedule('calculate-scores-post-match')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calculate-scores-post-match');

SELECT cron.schedule(
  'calculate-scores-post-match',
  '30 22 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/calculate-scores',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgyOTc5ODcsImV4cCI6MTcyMzg3Mzk4N30.LAeWx39REi6K2L46bY2g3PlvEaWM7p7TJdEZxtvXq8c'),
      body    := jsonb_build_object('fixture_id', f.id)
    )
    FROM fixtures f
    WHERE f.status = 'finished'
      AND f.kickoff_at > NOW() - INTERVAL '24 hours';
  $$
);
