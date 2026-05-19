-- Migration 63: Fix http extension cron job signatures
--
-- Problem: Cron jobs were using incorrect function signatures for net.http_post():
-- - Wrong parameter order: was calling with (url, headers, body)
-- - Wrong parameter types: body was text instead of jsonb
-- - The correct signature is: http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer)
--
-- Solution: Enable the http extension and reschedule all cron jobs with correct signatures

-- Ensure http extension is enabled
CREATE EXTENSION IF NOT EXISTS http;

-- ── Unschedule all broken cron jobs ──────────────────────────────────────────
SELECT cron.unschedule('sync-player-status')           WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-player-status');
SELECT cron.unschedule('sync-players-daily')           WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-players-daily');
SELECT cron.unschedule('sync-fixtures')                WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-fixtures');
SELECT cron.unschedule('ingest-match-events')          WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingest-match-events');
SELECT cron.unschedule('calculate-scores-daily')       WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calculate-scores-daily');
SELECT cron.unschedule('sync-wc-players-6h')           WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-wc-players-6h');
SELECT cron.unschedule('sync-wc-fixtures-6h')          WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-wc-fixtures-6h');

-- ── Reschedule with correct http_post() signatures ──────────────────────────
-- All use: net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds)

-- Sync player availability status every 6 hours (for EPL, forza_id=426)
SELECT cron.schedule(
  'sync-player-status',
  '0 */6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-player-status',
      body    := jsonb_build_object('forza_id', '426'),
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
    )
  $$
);

-- Sync players daily at 9 AM UTC (for EPL)
SELECT cron.schedule(
  'sync-players-daily',
  '0 9 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-players',
      body    := jsonb_build_object('forza_id', '426'),
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
    )
  $$
);

-- Sync fixtures daily at 9 PM UTC (for EPL)
SELECT cron.schedule(
  'sync-fixtures',
  '0 21 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-fixtures',
      body    := jsonb_build_object('forza_id', '426'),
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
    )
  $$
);

-- Ingest match events daily at 9:15 PM UTC
SELECT cron.schedule(
  'ingest-match-events',
  '15 21 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/ingest-match-events',
      body    := '{}'::jsonb,
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
    )
  $$
);

-- Calculate scores daily at 10 PM UTC
SELECT cron.schedule(
  'calculate-scores-daily',
  '0 22 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/calculate-scores',
      body    := '{}'::jsonb,
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
    )
  $$
);

-- Sync WC (tournament 429) players every 6 hours
SELECT cron.schedule(
  'sync-wc-players-6h',
  '0 */6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-players',
      body    := jsonb_build_object('tournament_id', '429'),
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
    )
  $$
);

-- Sync WC (tournament 429) fixtures every 6 hours
SELECT cron.schedule(
  'sync-wc-fixtures-6h',
  '0 */6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-fixtures',
      body    := jsonb_build_object('tournament_id', '429'),
      headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.service_role_key'))
    )
  $$
);
