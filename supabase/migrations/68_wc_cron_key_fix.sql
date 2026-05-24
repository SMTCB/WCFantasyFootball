-- Migration 68: Fix WC sync cron body keys (I2 / 2.6.a)
-- Migrations 60 and 63 created WC sync crons sending {tournament_id: '429'}
-- but every ingestion function destructures {forza_id} and returns 400 on
-- missing key. Replace with correct key name.

-- Unschedule the broken WC crons.
SELECT cron.unschedule('sync-wc-players-6h')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-wc-players-6h');
SELECT cron.unschedule('sync-wc-fixtures-6h')  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-wc-fixtures-6h');

-- Re-create with the correct key name (forza_id instead of tournament_id).
-- Staggered by 2 minutes each to avoid thundering-herd at the top of the hour.
SELECT cron.schedule(
  'sync-wc-players-6h',
  '2 */6 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/sync-players',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := jsonb_build_object('forza_id', '429')
    );
  $$
);

SELECT cron.schedule(
  'sync-wc-fixtures-6h',
  '4 */6 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/sync-fixtures',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := jsonb_build_object('forza_id', '429')
    );
  $$
);
