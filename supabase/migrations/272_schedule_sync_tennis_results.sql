-- Migration 272: schedule sync-tennis-results
--
-- Automates the tennis results-fill step that was previously 100% manual
-- (admin running admin_enter_round_results by hand after checking scores
-- themselves). sync-tennis-results (new Edge Function, this PR) fetches
-- 1 API call per active grand_slam/masters_1000 tournament and writes
-- eliminations/champion status directly.
--
-- 3x/day keeps this comfortably inside the 50 req/day RapidAPI budget even
-- with 2 tournaments active at once (6 calls/day for this cron), leaving
-- headroom for admin ad-hoc lookups (sync-tennis-players, diagnostics) on
-- the same day.
--
-- Same net.http_post pattern as every other Edge-Function-invoking cron in
-- this project (see migrations 86/90/91/181/240) — current_setting()-based
-- auth doesn't resolve inside pg_cron's session here.
--
-- NOTE (2026-09-01, never-applied fix): this migration was written but never
-- actually run against the live DB — schema_migrations and cron.job both
-- confirm 'sync-tennis-results' was never created. Since it never shipped,
-- fixing the bearer in place (rather than patching it in a later migration)
-- doesn't violate the append-only rule. The original bearer here was the
-- long-lived service_role JWT signed against SUPABASE_JWT_SECRET (Path B in
-- _shared/auth.ts) — that path silently stopped working once this project's
-- Supabase keys moved to the new sb_secret_/JWKS system (no SUPABASE_JWT_SECRET
-- env var remains, so Path B's `if (jwtSecret)` guard is always false). Using
-- ADMIN_TRIGGER_KEY (Path C) instead, same as migration 274's fix for every
-- other already-live cron on this project.
--
-- SECRET REDACTED FROM THIS FILE — this repo is public. Every prior migration
-- in this project hardcoded its bearer directly in the SQL (current_setting()
-- doesn't resolve inside pg_cron's session on hosted Supabase, so there's no
-- env-var indirection available here) — that was fine while the value in git
-- was a dead/rotated key, but this one is live, so <ADMIN_TRIGGER_KEY> below
-- is a placeholder, not the literal string to run. The real value was
-- substituted in by hand and applied directly to the live DB on 2026-09-01 —
-- current value is whatever `npx supabase secrets list` shows a hash for
-- under ADMIN_TRIGGER_KEY; ask whoever ran this migration, or rotate it fresh
-- via `npx supabase secrets set ADMIN_TRIGGER_KEY=<new value>` and re-run the
-- cron.schedule() call below with the new value substituted in — same
-- redaction applies to migrations 273 and 274.
SELECT cron.schedule(
  'sync-tennis-results',
  '0 8,14,20 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-tennis-results',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := '{}'::jsonb
    );
  $$
);
