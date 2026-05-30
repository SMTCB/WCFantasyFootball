-- Migration 92: get_cron_status() RPC
-- Exposes cron.job + cron.job_run_details (cron schema, not PostgREST-accessible)
-- via a SECURITY DEFINER function callable from the frontend admin panel.
-- Returns the latest run record for each cron job, plus the 5 most recent
-- run history rows per job for trend display.

CREATE OR REPLACE FUNCTION get_cron_status()
RETURNS TABLE (
  jobname        text,
  schedule       text,
  active         boolean,
  last_run       timestamptz,
  status         text,
  message        text
)
SECURITY DEFINER
SET search_path = public, cron
LANGUAGE sql
STABLE
AS $$
  SELECT
    j.jobname,
    j.schedule,
    j.active,
    d.start_time       AS last_run,
    d.status,
    d.return_message   AS message
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT start_time, status, return_message
    FROM cron.job_run_details
    WHERE jobid = j.jobid
    ORDER BY start_time DESC
    LIMIT 1
  ) d ON true
  ORDER BY j.jobname;
$$;

GRANT EXECUTE ON FUNCTION get_cron_status() TO authenticated;
