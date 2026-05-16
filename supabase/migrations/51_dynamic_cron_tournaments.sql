-- Migration 51: Dynamic cron jobs — loop over sync_enabled tournaments
--
-- Previous cron jobs (migrations 26, 32) hardcoded tournament_id = "426" (EPL).
-- Adding a second competition (La Liga, Serie A, etc.) would require a new manual
-- migration for every cron job. This migration replaces the hardcoded jobs with a
-- single orchestrator function that queries all sync_enabled tournaments at runtime.
--
-- Pattern: sync_all_active_tournaments() loops over tournaments.sync_enabled = true
-- and invokes sync-player-status, sync-players, and sync-fixtures for each.
-- Adding a new competition only requires: UPDATE tournaments SET sync_enabled = true.
--
-- Note: migration 32 introduced a parameter bug — cron bodies used "tournament_id"
-- but Edge Functions expect "forza_id". This migration corrects that too.

-- ── Orchestrator function ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION sync_all_active_tournaments()
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  t          RECORD;
  base_url   TEXT;
  auth_hdr   JSONB;
  body_text  TEXT;
BEGIN
  base_url := current_setting('app.supabase_url');
  auth_hdr := jsonb_build_object(
    'Content-Type',  'application/json',
    'Authorization', 'Bearer ' || current_setting('app.service_role_key')
  );

  FOR t IN SELECT forza_id FROM tournaments WHERE sync_enabled = true LOOP
    body_text := '{"forza_id":"' || t.forza_id || '"}';

    -- Sync player availability (injuries, suspensions)
    PERFORM net.http_post(
      url     := base_url || '/functions/v1/sync-player-status',
      headers := auth_hdr,
      body    := body_text
    );

    -- Sync player master data (squads, valuations)
    PERFORM net.http_post(
      url     := base_url || '/functions/v1/sync-players',
      headers := auth_hdr,
      body    := body_text
    );

    -- Sync fixtures and matchday deadlines
    PERFORM net.http_post(
      url     := base_url || '/functions/v1/sync-fixtures',
      headers := auth_hdr,
      body    := body_text
    );
  END LOOP;
END;
$$;

-- ── Replace hardcoded cron jobs ────────────────────────────────────────────────
-- Unschedule the old per-tournament jobs (which hardcoded "426")
SELECT cron.unschedule('sync-player-status') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-player-status');
SELECT cron.unschedule('sync-players-daily') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-players-daily');
SELECT cron.unschedule('sync-fixtures')      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-fixtures');

-- Schedule a single dynamic job that loops over all active tournaments.
-- Runs every 6 hours — covers both the player status (every 12h) and
-- fixtures (needed before each matchday) without over-fetching.
SELECT cron.schedule(
  'sync-all-active-tournaments',
  '0 */6 * * *',
  $$SELECT sync_all_active_tournaments();$$
);
