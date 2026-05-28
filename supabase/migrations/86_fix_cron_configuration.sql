-- Migration 86: Fix cron jobs using unconfigured current_setting()
--
-- Issue: 5 cron jobs (created in migrations 67, 72) use current_setting('app.supabase_url')
-- and current_setting('app.service_role_key'), but these PostgreSQL settings are NOT
-- configured in the environment. This causes these crons to fail at runtime.
--
-- Solution: Rewrite these crons to use hardcoded URLs like the other working crons.
-- Affected crons:
--   - ingest-match-events-live (jobid 46)
--   - calculate-scores-post-match (jobid 8)
--   - sync-wc-players-6h (jobid ?)
--   - sync-wc-fixtures-6h (jobid ?)
--   - resolve-finished-bets (jobid 53) [CONFIRMED FAILING: "unrecognized configuration parameter"]

-- Unschedule the broken crons
SELECT cron.unschedule('ingest-match-events-live')    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingest-match-events-live');
SELECT cron.unschedule('calculate-scores-post-match') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calculate-scores-post-match');
SELECT cron.unschedule('sync-wc-players-6h')          WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-wc-players-6h');
SELECT cron.unschedule('sync-wc-fixtures-6h')         WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-wc-fixtures-6h');
SELECT cron.unschedule('resolve-finished-bets')       WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resolve-finished-bets');

-- Re-schedule with hardcoded URLs (matching the pattern from other working crons)
-- Bearer token: anon key from config.toml (eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...)

SELECT cron.schedule(
  'ingest-match-events-live',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/ingest-match-events',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgyOTc5ODcsImV4cCI6MTcyMzg3Mzk4N30.LAeWx39REi6K2L46bY2g3PlvEaWM7p7TJdEZxtvXq8c'),
      body    := jsonb_build_object('forza_match_id', f.forza_match_id)
    )
    FROM fixtures f
    WHERE f.status = 'live'
      AND f.forza_match_id IS NOT NULL;
  $$
);

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
    WHERE f.status = 'after'
      AND f.kickoff_at > NOW() - INTERVAL '24 hours';
  $$
);

SELECT cron.schedule(
  'sync-wc-players-6h',
  '2 */6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-players',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgyOTc5ODcsImV4cCI6MTcyMzg3Mzk4N30.LAeWx39REi6K2L46bY2g3PlvEaWM7p7TJdEZxtvXq8c'),
      body    := jsonb_build_object('forza_id', '429')
    );
  $$
);

SELECT cron.schedule(
  'sync-wc-fixtures-6h',
  '4 */6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-fixtures',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgyOTc5ODcsImV4cCI6MTcyMzg3Mzk4N30.LAeWx39REi6K2L46bY2g3PlvEaWM7p7TJdEZxtvXq8c'),
      body    := jsonb_build_object('forza_id', '429')
    );
  $$
);

SELECT cron.schedule(
  'resolve-finished-bets',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/resolve-bets',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDgyOTc5ODcsImV4cCI6MTcyMzg3Mzk4N30.LAeWx39REi6K2L46bY2g3PlvEaWM7p7TJdEZxtvXq8c'),
      body    := '{}'::jsonb
    )
  $$
);
