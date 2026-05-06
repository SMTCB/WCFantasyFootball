-- Migration 21: Set up cron job for syncing player status from Forza API
-- Periodically calls sync-player-status Edge Function for all tournaments
-- where sync_enabled = true

-- NOTE: This migration must be run manually via Supabase dashboard since
-- pg_cron extension setup requires special permissions. See instructions below:
--
-- SETUP INSTRUCTIONS (Dashboard):
-- 1. Go to Supabase Dashboard → Your Project → SQL Editor
-- 2. Create a new query and paste the SQL below
-- 3. Run to enable pg_cron and pg_net extensions:

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 4. Then run this query to set up the cron job:

SELECT cron.schedule(
  'sync-player-status',
  '0 */12 * * *',  -- Every 12 hours (0:00 and 12:00 UTC)
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-player-status',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := row_to_json(t)::text
  )
  FROM (
    SELECT t.forza_id
    FROM   tournaments t
    WHERE  t.sync_enabled = true
  ) t;
  $$
);

-- ACTIVATION:
-- To start syncing player status, update the tournaments table:
-- UPDATE tournaments SET sync_enabled = true WHERE forza_id = '426';
--
-- VERIFICATION:
-- Check cron jobs: SELECT * FROM cron.job;
-- Check job runs: SELECT * FROM cron.job_run_details ORDER BY end_time DESC LIMIT 10;
