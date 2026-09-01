-- Migration 277: rotate ADMIN_TRIGGER_KEY and repoint every cron/function that
-- carries it as a hardcoded bearer token.
--
-- Why: while shipping migration 276 (sync-f1-race-results cron), the current
-- live ADMIN_TRIGGER_KEY value (rotated earlier the same day by migrations
-- 272-275) was not available in this session to embed in 276's bearer. Rather
-- than ask the user to dig up a value that's easy to lose track of, generated
-- a brand-new key and rotated everything that depends on it in one pass.
--
-- Uses cron.alter_job() (pg_cron 1.6.4, confirmed installed) to update ONLY
-- the `command` column of each job, leaving `schedule` and `active` fully
-- untouched — this avoids the exact bug migration 275 had to fix (unschedule
-- + reschedule always resets active = true). All 12 of the jobs below are
-- currently `active = false` (frozen 2026-07-31, see DD-P0-2) and must stay
-- that way; only sync-tennis-results is active = true and must also stay
-- that way. alter_job's active parameter defaults to NULL ("no change") when
-- omitted, so simply not passing it is sufficient.
--
-- Also repoints cron_sync_active_tournaments() (plpgsql function backing the
-- 3 sync-active-tournaments-* jobs), which carries its own hardcoded bearer
-- inside the function body rather than in cron.job.command.
--
-- Not touched (confirmed via prosrc grep): trigger_wc2026_sync,
-- sync_wc_players, load_wc_teams — retired WC-hardcoded functions, no longer
-- referenced by any cron.job row, dead code left over from before the
-- generic sync-active-tournaments-* pattern existed. Rotating their stale
-- embedded bearer has no operational effect since nothing calls them.
--
-- SECRET REDACTED FROM THIS FILE — this repo is public. <ADMIN_TRIGGER_KEY>
-- below is a placeholder, not the literal string to run — see migration
-- 272's note for the full explanation of this pattern.

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'award-season-trophies'),
  command := $$
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

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'calculate-scores-late-finishers'),
  command := $$
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

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'calculate-scores-live'),
  command := $$
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

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'calculate-scores-post-match'),
  command := $$
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

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'check-cron-health'),
  command := $$
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

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'generate-frontpage-editions'),
  command := $$
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

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'ingest-match-events-live'),
  command := $$
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

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'resolve-finished-bets'),
  command := $$
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

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'run-draft-lottery'),
  command := $$
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

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'run-reverse-standings-draft'),
  command := $$
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

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'run-wishlist-draft'),
  command := $$
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

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'sync-cup-eliminations'),
  command := $$SELECT net.http_post(url:='https://sssmvihxtqtohisghjet.supabase.co/functions/v1/eliminate-cup-club',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer <ADMIN_TRIGGER_KEY>'),body:='{"mode":"auto"}'::jsonb);$$
);

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'sync-tennis-results'),
  command := $$
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

CREATE OR REPLACE FUNCTION public.cron_sync_active_tournaments(p_function_name text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
$function$;
