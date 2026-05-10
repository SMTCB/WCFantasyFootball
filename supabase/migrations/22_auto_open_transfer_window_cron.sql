-- Migration 22: Cron job for auto-opening transfer windows
-- When a matchday ends (all fixtures finished), automatically opens
-- a transfer window for the next matchday

-- Schedule: Run every 2 hours to check for completed matchdays
-- The Edge Function checks each active league independently

SELECT cron.schedule(
  'auto-open-transfer-window',
  '0 */2 * * *',  -- Every 2 hours
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/auto-open-transfer-window',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::text
  )
  $$
);
