-- Migration 91: Fix remaining 2 crons that still use current_setting() (PILOT-05 follow-up)
--
-- resolve-finished-bets: failing every 15 min with "unrecognized configuration parameter app.supabase_url"
-- ingest-match-events-live: silently returns 0 rows now (no live fixtures), but will fail when
--   WC matches go live on June 11 — current_setting() returns NULL, net.http_post never fires.
--
-- Fix: same pattern as migrations 86 and 90 — hardcode URL + service role bearer token.

-- 1. resolve-finished-bets (every 15 min) -----------------------------------
SELECT cron.unschedule('resolve-finished-bets');

SELECT cron.schedule(
  'resolve-finished-bets',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/resolve-bets',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- 2. ingest-match-events-live (every 5 min) ----------------------------------
SELECT cron.unschedule('ingest-match-events-live');

SELECT cron.schedule(
  'ingest-match-events-live',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/ingest-match-events',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
      ),
      body    := jsonb_build_object('forza_match_id', f.forza_match_id)
    )
    FROM fixtures f
    WHERE f.status = 'live'
      AND f.forza_match_id IS NOT NULL;
  $$
);
