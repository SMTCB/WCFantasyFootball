-- Migration 26: Transfer window overlap prevention + pg_cron setup
--
-- Fixes:
--   #039 — prevent overlapping transfer windows per league/round
--   #018 — enable pg_cron + pg_net, schedule automated jobs
--   #040 — cron trigger for run-draft-lottery at league deadline
--
-- NOTE: After applying this migration, set the service role key via SQL editor:
--   ALTER DATABASE postgres SET "app.service_role_key" = '<your-service-role-key>';
-- Then verify cron jobs: SELECT jobname, schedule, active FROM cron.job;

-- ── Extensions ────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── App settings (supabase_url is public; service_role_key set via dashboard) ─

ALTER DATABASE postgres SET "app.supabase_url" = 'https://sssmvihxtqtohisghjet.supabase.co';

-- ── #039: Unique constraint on transfer_windows ───────────────────────────────
-- Prevents auto-open-transfer-window from creating duplicate/overlapping
-- windows for the same league and round. Root cause of the transfer window
-- enforcement false positive discovered in E2E testing (2026-05-11).

ALTER TABLE transfer_windows
  ADD CONSTRAINT transfer_windows_league_round_unique
  UNIQUE (league_id, round_number);

-- ── #018: Cron schedules ──────────────────────────────────────────────────────
-- Requires pg_cron + pg_net enabled above.
-- Jobs will execute once app.service_role_key is set (see note above).

-- 1. Sync player status from Forza API every 12 hours
SELECT cron.schedule(
  'sync-player-status',
  '0 */12 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-player-status',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{"tournament_id":"426"}'::text
  );
  $$
);

-- 2. Auto-open transfer windows every 2 hours after matchday completes
SELECT cron.schedule(
  'auto-open-transfer-window',
  '0 */2 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/auto-open-transfer-window',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::text
  );
  $$
);

-- 3. Calculate fantasy scores daily at 22:00 UTC (post-match window)
SELECT cron.schedule(
  'calculate-scores-daily',
  '0 22 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/calculate-scores',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::text
  );
  $$
);

-- 4. Sync player master data from Forza API daily at 09:00 UTC
SELECT cron.schedule(
  'sync-players-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-players',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{"tournament_id":"426"}'::text
  );
  $$
);

-- 5. #040: Run draft lottery — checks all leagues for passed deadlines every 15 min
SELECT cron.schedule(
  'run-draft-lottery',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/run-draft-lottery',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::text
  );
  $$
);
