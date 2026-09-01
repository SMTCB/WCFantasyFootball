-- Migration 273: replace WC-hardcoded sync crons with a generic active-tournament loop
--
-- sync-wc-fixtures-30m, sync-wc-player-status, sync-wc-players-6h each had
-- forza_id = '429' (the World Cup's Forza tournament ID) baked directly into
-- the pg_cron job body. The edge functions themselves (sync-fixtures,
-- sync-players, sync-player-status) are already tournament-agnostic — they
-- take forza_id as a parameter and gate on tournaments.sync_enabled — but
-- nothing was ever calling them with any forza_id other than '429'. Onboarding
-- UCL (forza_id '1593', already registered in `tournaments`, sync_enabled =
-- false, see today's migrations) would have required a second hand-written,
-- hardcoded set of crons mirroring this one, repeating the mistake forever.
--
-- Fix: one generic PL/pgSQL wrapper that loops over every row in
-- `tournaments WHERE sync_enabled = true` and calls the given edge function
-- once per row. Activating a future tournament is then just:
--   UPDATE tournaments SET sync_enabled = true WHERE forza_id = '<id>';
-- No new cron, no new migration.
--
-- current_setting()-based auth doesn't resolve inside pg_cron's session on
-- hosted Supabase, same reason as every other Edge-Function-invoking cron in
-- this project (86/90/91/181/240/272).
--
-- NOTE (2026-09-01, never-applied fix): like 272, this migration was written
-- but never actually run — schema_migrations and cron.job both confirm
-- sync-active-tournaments-* never existed and sync-wc-fixtures-30m/
-- sync-wc-player-status/sync-wc-players-6h are all still live (just inactive).
-- The bearer originally carried forward here from those 3 jobs
-- ('38f7d3e4...199f71') no longer authenticates against any Path in
-- _shared/auth.ts — verified live via curl against check-cron-health
-- (401, same as the old service_role JWT). Fixed in place, same as 272,
-- since this never shipped. Uses ADMIN_TRIGGER_KEY (Path C), rotated this
-- session — see migration 274 for the same fix applied to every other
-- already-live cron.
--
-- SECRET REDACTED FROM THIS FILE — this repo is public. See migration 272's
-- note for the full explanation; <ADMIN_TRIGGER_KEY> below is a placeholder,
-- substituted with the real value by hand when this was applied to the live
-- DB on 2026-09-01.

SELECT cron.unschedule('sync-wc-fixtures-30m');
SELECT cron.unschedule('sync-wc-player-status');
SELECT cron.unschedule('sync-wc-players-6h');

CREATE OR REPLACE FUNCTION cron_sync_active_tournaments(p_function_name text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN SELECT forza_id FROM tournaments WHERE sync_enabled = true LOOP
    PERFORM net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/' || p_function_name,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := jsonb_build_object('forza_id', t.forza_id)
    );
  END LOOP;
END;
$$;

SELECT cron.schedule(
  'sync-active-tournaments-fixtures-30m',
  '*/30 * * * *',
  $$SELECT cron_sync_active_tournaments('sync-fixtures');$$
);

SELECT cron.schedule(
  'sync-active-tournaments-player-status-6h',
  '0 */6 * * *',
  $$SELECT cron_sync_active_tournaments('sync-player-status');$$
);

SELECT cron.schedule(
  'sync-active-tournaments-players-6h',
  '2 */6 * * *',
  $$SELECT cron_sync_active_tournaments('sync-players');$$
);
