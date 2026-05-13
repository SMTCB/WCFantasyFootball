-- Migration 32: Update cron schedules + add missing sync jobs
--
-- Changes:
--   1. sync-player-status: 12h → 6h (user request for more frequent updates)
--   2. ADD: sync-fixtures cron job (fetch match results from Forza API)
--   3. ADD: ingest-match-events cron job (process results → player_match_stats)
--
-- Scoring pipeline dependency chain:
--   sync-fixtures (fetch results) → ingest-match-events (process stats) → calculate-scores (at 22:00 UTC)
--
-- Timing: sync-fixtures runs at 21:00 UTC (1 hour before scores), ingest-match-events at 21:15 UTC

-- ── Update sync-player-status: 12h → 6h ────────────────────────────────────────
-- Unschedule old job, reschedule with new 6-hour interval
SELECT cron.unschedule('sync-player-status');

SELECT cron.schedule(
  'sync-player-status',
  '0 */6 * * *',
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

-- ── ADD: sync-fixtures job (runs at 21:00 UTC, 1 hour before calculate-scores) ──
-- Fetches latest match results from Forza Football API
SELECT cron.schedule(
  'sync-fixtures',
  '0 21 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/sync-fixtures',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{"tournament_id":"426"}'::text
  );
  $$
);

-- ── ADD: ingest-match-events job (runs at 21:15 UTC, before calculate-scores) ──
-- Processes match results into player_match_stats table for scoring
SELECT cron.schedule(
  'ingest-match-events',
  '15 21 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/ingest-match-events',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := '{}'::text
  );
  $$
);

-- Final cron schedule summary:
-- Every 6 hours (00:00, 06:00, 12:00, 18:00 UTC):
--   sync-player-status
-- Daily 09:00 UTC:
--   sync-players (master data)
-- Daily 21:00 UTC:
--   sync-fixtures (fetch match results)
-- Daily 21:15 UTC:
--   ingest-match-events (process results → player stats)
-- Daily 22:00 UTC:
--   calculate-scores (fantasy points from player stats)
-- Every 15 minutes:
--   run-draft-lottery (check deadlines)
-- Every 2 hours:
--   auto-open-transfer-window (post-match)
