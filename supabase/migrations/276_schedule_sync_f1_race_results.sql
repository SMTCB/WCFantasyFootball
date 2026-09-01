-- Migration 276: schedule sync-f1-race-results
--
-- Automates F1AdminScreen's "⚡ FETCH FROM OPENF1" button (previously a
-- manual per-race-weekend click) — sync-f1-race-results (new Edge Function,
-- this PR) checks every 30 minutes for any race whose start time has passed
-- but has no result yet, and fills result_p1/p2/p3 + status='finished' from
-- OpenF1 (api.openf1.org) directly. OpenF1 is a free, unauthenticated public
-- API — no RapidAPI-style daily budget to protect here, unlike tennis's
-- sync-tennis-results (3x/day only, see migration 272).
--
-- DNF drivers, team-most-points, and the special-category answer are never
-- derivable from OpenF1's position endpoint and stay fully manual on
-- F1AdminScreen, as does scoring (SCORE RACE is a separate, still-manual
-- click). See docs/deployment/ADDING_A_NEW_F1_SEASON.md.
--
-- Same net.http_post + ADMIN_TRIGGER_KEY pattern as every other Edge-
-- Function-invoking cron in this project (86/90/91/181/240/272/273/274) —
-- current_setting()-based auth doesn't resolve inside pg_cron's session on
-- hosted Supabase.
--
-- SECRET REDACTED FROM THIS FILE — this repo is public. <ADMIN_TRIGGER_KEY>
-- below is a placeholder, not the literal string to run — see migration
-- 272's note for the full explanation of this pattern.
SELECT cron.schedule(
  'sync-f1-race-results',
  '*/30 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-f1-race-results',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := '{}'::jsonb
    );
  $$
);
