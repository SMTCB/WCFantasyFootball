-- Cron job: run draft lottery for any league whose deadline has just passed.
-- Requires pg_cron + pg_net extensions (enabled by default on Supabase).
-- Runs every 5 minutes; only fires the Edge Function for leagues that are
-- past deadline and still have pending submissions.

SELECT cron.schedule(
  'run-draft-lottery',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/run-draft-lottery',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := row_to_json(t)::text
  )
  FROM (
    SELECT l.id AS league_id
    FROM   leagues l
    WHERE  l.draft_deadline IS NOT NULL
    AND    l.draft_deadline <= NOW()
    AND    EXISTS (
      SELECT 1
      FROM   draft_submissions ds
      WHERE  ds.league_id = l.id
      AND    ds.status = 'pending'
    )
  ) t;
  $$
);
