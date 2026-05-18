-- Migration 60: Setup cron jobs for WC tournament data sync
--
-- Syncs fixtures and players for WC tournament (429) on a schedule:
-- - Sync players every 6 hours
-- - Sync fixtures every 6 hours
--
-- These jobs call the existing Edge Functions to pull from Forza API

SELECT cron.schedule(
  'sync-wc-players-6h',
  '0 */6 * * *',
  $$
    SELECT
      net.http_post(
        url := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-players',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := jsonb_build_object('tournament_id', '429')
      ) as req
  $$
);

SELECT cron.schedule(
  'sync-wc-fixtures-6h',
  '0 */6 * * *',
  $$
    SELECT
      net.http_post(
        url := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-fixtures',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
        ),
        body := jsonb_build_object('tournament_id', '429')
      ) as req
  $$
);
