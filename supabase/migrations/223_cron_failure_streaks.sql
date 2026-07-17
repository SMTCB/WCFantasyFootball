-- Migration 223: get_cron_failure_streaks() RPC
-- OPS-2 part (c) — failed-cron alerting, last remaining OPS-2 code piece.
--
-- For each active cron job, walks its run history (newest first) and counts
-- how many of the most recent runs failed consecutively, stopping at the
-- first non-failed run (or counting all rows if every recorded run failed).
-- Returns only jobs whose consecutive-failure streak meets/exceeds p_threshold.
--
-- Companion to get_cron_status() (migration 92), which only surfaces the
-- single latest run per job — that's enough for the admin panel's live view,
-- but not enough to detect "this job has been silently broken for the last
-- 3+ runs" without a human staring at a dashboard. This RPC is the piece a
-- scheduled check can call unattended.
--
-- Query directly:
--   SELECT * FROM get_cron_failure_streaks();       -- default threshold 3
--   SELECT * FROM get_cron_failure_streaks(5);       -- custom threshold

CREATE OR REPLACE FUNCTION get_cron_failure_streaks(p_threshold int DEFAULT 3)
RETURNS TABLE (
  jobname             text,
  consecutive_failures int,
  last_run            timestamptz,
  last_message        text
)
SECURITY DEFINER
SET search_path = public, cron
LANGUAGE sql
STABLE
AS $$
  WITH ranked AS (
    SELECT
      d.jobid,
      d.status,
      d.start_time,
      d.return_message,
      ROW_NUMBER() OVER (PARTITION BY d.jobid ORDER BY d.start_time DESC) AS rn
    FROM cron.job_run_details d
  ),
  first_success AS (
    SELECT jobid, MIN(rn) AS first_ok_rn
    FROM ranked
    WHERE status <> 'failed'
    GROUP BY jobid
  ),
  run_counts AS (
    SELECT jobid, COUNT(*) AS total_runs
    FROM ranked
    GROUP BY jobid
  ),
  latest AS (
    SELECT DISTINCT ON (jobid) jobid, start_time AS last_run, return_message AS last_message
    FROM ranked
    WHERE rn = 1
  ),
  streaks AS (
    SELECT
      j.jobid,
      j.jobname,
      COALESCE(fs.first_ok_rn - 1, rc.total_runs, 0) AS consecutive_failures
    FROM cron.job j
    LEFT JOIN first_success fs ON fs.jobid = j.jobid
    LEFT JOIN run_counts rc    ON rc.jobid = j.jobid
    WHERE j.active = true
  )
  SELECT
    s.jobname,
    s.consecutive_failures::int,
    l.last_run,
    l.last_message
  FROM streaks s
  LEFT JOIN latest l ON l.jobid = s.jobid
  WHERE s.consecutive_failures >= p_threshold
  ORDER BY s.consecutive_failures DESC, s.jobname;
$$;

-- Service role only — this is consumed by an Edge Function (check-cron-health),
-- not the client. No GRANT to authenticated (unlike get_cron_status, which the
-- admin panel calls directly with a user JWT).
