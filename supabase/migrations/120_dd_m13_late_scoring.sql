-- Migration 120: DD-M13 — post-match scoring coverage for late-finishing WC matches
--
-- Problem 1: calculate-scores-live cron used an expired anon JWT (exp Aug 2024).
--   The function requires service-role or valid user JWT → every call returned 401.
--   The live ingest chain (ingest-match-events → calculate-scores) already handles
--   real-time scoring correctly; this cron was dead weight. Fixed: service-role key.
--
-- Problem 2: calculate-scores-post-match runs once at 22:30 UTC daily.
--   WC matches with extra time can finish at 23:30+ UTC (South American kick-offs,
--   ETz games), leaving a ~23h gap before the safety net re-scores them.
--   The live ingest chain handles final scoring when Forza reports status='after',
--   but if that final ingest pass fails there is no catch-up until the next day.
--   Added: calculate-scores-late-finishers at 23:30 and 00:30 UTC, 3h window.
--
-- NOTE: Service-role JWT is intentionally the same token already present in
-- migrations 110, 111, 119 and other cron bodies (DD-M15 tracks key rotation).
-- Applied directly to prod via Supabase MCP — reproduced here for audit trail.

-- Fix 1: calculate-scores-live — replace expired anon key with service-role key
SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'calculate-scores-live'),
  command := $CMD$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/calculate-scores',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <service-role-key-see-other-crons>'
      ),
      body    := jsonb_build_object('fixture_id', f.id)
    )
    FROM fixtures f WHERE f.status = 'live';
  $CMD$
);

-- Fix 2: new late-finisher safety net cron (23:30 and 00:30 UTC, 3h window)
SELECT cron.schedule(
  'calculate-scores-late-finishers',
  '30 23,0 * * *',
  $CMD$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/calculate-scores',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <service-role-key-see-other-crons>'
      ),
      body    := jsonb_build_object('fixture_id', f.id)
    )
    FROM fixtures f
    WHERE f.status = 'finished'
      AND f.kickoff_at > NOW() - INTERVAL '3 hours';
  $CMD$
);
