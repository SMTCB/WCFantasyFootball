-- Migration 67: Fix ingest-match-events cron (I3)
-- The existing cron sends body '{}' but the function requires {forza_match_id}.
-- Replace with a cron that iterates live fixtures and invokes the function
-- once per live fixture, using the fixture's forza_match_id.
--
-- Also fixes the calculate-scores-daily cron which sends '{}' but needs a
-- fixture reference — switch it to fire after the events cron.

-- Unschedule the broken single-call crons.
SELECT cron.unschedule('ingest-match-events')      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingest-match-events');
SELECT cron.unschedule('calculate-scores-daily')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'calculate-scores-daily');

-- New cron: for each live fixture, call ingest-match-events with its forza_match_id.
-- Runs at 15 min past every hour so it fires after sync-fixtures (21:00) is done.
SELECT cron.schedule(
  'ingest-match-events-live',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/ingest-match-events',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := jsonb_build_object('forza_match_id', f.forza_match_id)
    )
    FROM fixtures f
    WHERE f.status = 'live'
      AND f.forza_match_id IS NOT NULL;
  $$
);

-- New cron: calculate scores for each fixture that finished in the last 3 hours.
-- Runs at 22:30 UTC daily (after the 21:15 ingest window closes).
SELECT cron.schedule(
  'calculate-scores-post-match',
  '30 22 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/calculate-scores',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := jsonb_build_object('fixture_id', f.id)
    )
    FROM fixtures f
    WHERE f.status = 'after'
      AND f.kickoff_at > NOW() - INTERVAL '24 hours';
  $$
);
