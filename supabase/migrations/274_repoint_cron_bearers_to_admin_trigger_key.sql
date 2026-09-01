-- Migration 274: repoint every live HTTP-invoking cron's bearer at ADMIN_TRIGGER_KEY
--
-- _shared/auth.ts's requireServiceRole() has 3 accepted paths: (A) exact match
-- against SUPABASE_SERVICE_ROLE_KEY, (B) an old-format service_role JWT verified
-- via SUPABASE_JWT_SECRET, (C) exact match against ADMIN_TRIGGER_KEY. This
-- project's Supabase keys have moved to the new sb_secret_/JWKS system — there
-- is no SUPABASE_JWT_SECRET env var anymore, so Path B's `if (jwtSecret)` guard
-- is always false, and Path A requires the new sb_secret_... value, which none
-- of these cron bodies carry. Every cron below was still sending either an old
-- service_role JWT (Path B, dead) or a stale hex string (also dead — doesn't
-- match current SUPABASE_SERVICE_ROLE_KEY or the now-rotated ADMIN_TRIGGER_KEY).
-- Verified live via curl: both the old JWT and the old hex strings 401 against
-- check-cron-health; the freshly-rotated ADMIN_TRIGGER_KEY 200s.
--
-- All 12 jobs below are currently `active = false` in cron.job — this migration
-- fixes their credential without reactivating any of them. Reactivation is a
-- separate decision (season/tournament dependent) and out of scope here.
--
-- sync-wc-fixtures-30m / sync-wc-player-status / sync-wc-players-6h are NOT
-- included — migration 273 (also fixed this session, see that file's notes)
-- retires those 3 in favor of the generic sync-active-tournaments-* jobs.
--
-- Same net.http_post pattern as every other Edge-Function-invoking cron in
-- this project (86/90/91/181/240/272/273) — current_setting()-based auth
-- doesn't resolve inside pg_cron's session on hosted Supabase.
--
-- SECRET REDACTED FROM THIS FILE — this repo is public. See migration 272's
-- note for the full explanation; every <ADMIN_TRIGGER_KEY> placeholder below
-- was substituted with the real value by hand when this was applied to the
-- live DB on 2026-09-01.
--
-- KNOWN SIDE EFFECT, FIXED IN MIGRATION 275: cron.unschedule() +
-- cron.schedule() always creates the new job with active = true — there's no
-- way to pass an initial active state. All 12 jobs here were active = false
-- beforehand, so applying this migration as written silently reactivates all
-- of them. That was caught and reverted (see migration 275) within minutes of
-- first applying this on 2026-09-01, before any of them fired. Replaying 274
-- alone, without 275 immediately after, will turn all 12 back on.

-- ── award-season-trophies ────────────────────────────────────────────────
SELECT cron.unschedule('award-season-trophies');
SELECT cron.schedule(
  'award-season-trophies',
  '0 6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/award-season-trophies',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ── calculate-scores-late-finishers ──────────────────────────────────────
SELECT cron.unschedule('calculate-scores-late-finishers');
SELECT cron.schedule(
  'calculate-scores-late-finishers',
  '30 23,0 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/calculate-scores',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := jsonb_build_object('fixture_id', f.id)
    )
    FROM fixtures f
    WHERE f.status = 'finished' AND f.kickoff_at > NOW() - INTERVAL '3 hours';
  $$
);

-- ── calculate-scores-live ────────────────────────────────────────────────
SELECT cron.unschedule('calculate-scores-live');
SELECT cron.schedule(
  'calculate-scores-live',
  '1-59/2 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/calculate-scores',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := jsonb_build_object('fixture_id', f.id)
    )
    FROM fixtures f
    WHERE f.status = 'live';
  $$
);

-- ── calculate-scores-post-match ──────────────────────────────────────────
SELECT cron.unschedule('calculate-scores-post-match');
SELECT cron.schedule(
  'calculate-scores-post-match',
  '30 22 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/calculate-scores',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := jsonb_build_object('fixture_id', f.id)
    )
    FROM fixtures f
    WHERE f.status = 'finished' AND f.kickoff_at > NOW() - INTERVAL '24 hours';
  $$
);

-- ── check-cron-health ─────────────────────────────────────────────────────
SELECT cron.unschedule('check-cron-health');
SELECT cron.schedule(
  'check-cron-health',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/check-cron-health',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ── generate-frontpage-editions ──────────────────────────────────────────
SELECT cron.unschedule('generate-frontpage-editions');
SELECT cron.schedule(
  'generate-frontpage-editions',
  '0 5 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/generate-frontpage-edition',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := '{"mode":"cron"}'::jsonb
    );
  $$
);

-- ── ingest-match-events-live ─────────────────────────────────────────────
SELECT cron.unschedule('ingest-match-events-live');
SELECT cron.schedule(
  'ingest-match-events-live',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/ingest-match-events',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := jsonb_build_object('forza_match_id', f.forza_match_id)
    )
    FROM fixtures f
    WHERE f.forza_match_id IS NOT NULL
      AND (
        f.status = 'live'
        OR (f.status = 'finished' AND f.kickoff_at > NOW() - INTERVAL '3 hours')
      );
  $$
);

-- ── resolve-finished-bets ────────────────────────────────────────────────
SELECT cron.unschedule('resolve-finished-bets');
SELECT cron.schedule(
  'resolve-finished-bets',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/resolve-bets',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ── run-draft-lottery ─────────────────────────────────────────────────────
SELECT cron.unschedule('run-draft-lottery');
SELECT cron.schedule(
  'run-draft-lottery',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/run-draft-lottery',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ── run-reverse-standings-draft ──────────────────────────────────────────
SELECT cron.unschedule('run-reverse-standings-draft');
SELECT cron.schedule(
  'run-reverse-standings-draft',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/run-reverse-standings-draft',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ── run-wishlist-draft ────────────────────────────────────────────────────
SELECT cron.unschedule('run-wishlist-draft');
SELECT cron.schedule(
  'run-wishlist-draft',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/run-wishlist-draft',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- ── sync-cup-eliminations ─────────────────────────────────────────────────
SELECT cron.unschedule('sync-cup-eliminations');
SELECT cron.schedule(
  'sync-cup-eliminations',
  '30 */6 * * *',
  $$SELECT net.http_post(url:='https://sssmvihxtqtohisghjet.supabase.co/functions/v1/eliminate-cup-club',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer <ADMIN_TRIGGER_KEY>'),body:='{"mode":"auto"}'::jsonb);$$
);
