-- Reverse-standings draft cron (S12)
-- Fires for cup leagues that are in 'group_stage' phase and whose
-- draft_deadline has passed with pending submissions.
-- Runs every 5 minutes alongside the lottery cron.

SELECT cron.schedule(
  'run-reverse-standings-draft',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/run-reverse-standings-draft',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := row_to_json(t)::text
  )
  FROM (
    SELECT l.id AS league_id
    FROM   leagues l
    WHERE  l.cup_phase       = 'group_stage'
    AND    l.draft_deadline IS NOT NULL
    AND    l.draft_deadline  <= NOW()
    AND    EXISTS (
      SELECT 1
      FROM   draft_submissions ds
      WHERE  ds.league_id = l.id
      AND    ds.status    = 'pending'
    )
  ) t;
  $$
);
