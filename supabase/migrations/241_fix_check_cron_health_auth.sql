-- Migration 241: fix check-cron-health cron auth (401 → ADMIN_TRIGGER_KEY)
--
-- Migration 240 scheduled check-cron-health using the same hardcoded legacy
-- service_role JWT bearer used by every other cron in this project. That
-- token no longer matches this function's live SUPABASE_SERVICE_ROLE_KEY env
-- (confirmed via net._http_response: first scheduled run, job 73, returned
-- 401 Unauthorized, not the 200 that cron.job_run_details.status='succeeded'
-- implied — that column only reflects SQL-level execution of the async
-- net.http_post call, never the actual HTTP response).
--
-- requireServiceRole() (_shared/auth.ts) has a third, exact-match auth path
-- for a dedicated ADMIN_TRIGGER_KEY secret, added 2026-06-28 (PR #662) for
-- exactly this class of function. A fresh ADMIN_TRIGGER_KEY was generated
-- and set via `supabase secrets set` this session, then verified working
-- end-to-end against both check-cron-health and score-tennis-tournament
-- (200 responses, correct computed output) before being hardcoded here,
-- matching the existing hardcoded-bearer pattern from migrations 86/90/91/181/240.

SELECT cron.alter_job(
  job_id := 73,
  command := $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/check-cron-health',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer 7d75c98d881d1c7785731a9e8ef3da24cbf24d9ad3c7a15220d3223f6dea5bb1'
      ),
      body    := '{}'::jsonb
    );
  $$
);
