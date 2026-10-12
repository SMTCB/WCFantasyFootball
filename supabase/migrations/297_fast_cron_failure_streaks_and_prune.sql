-- Migration 297: make get_cron_failure_streaks fast + prune cron run history
--
-- check-cron-health (hourly) has failed on EVERY run since it was first enabled on
-- 2026-07-28 with 'canceling statement due to statement timeout' (57014): the streak query
-- sorted all of cron.job_run_details (271,695 rows / 179 MB, never pruned, +~2,100/day) and
-- the API role's statement_timeout is 8s. The real error was hidden by String(err) -> "[object
-- Object]" until PR #1031.
--
-- 1. get_cron_failure_streaks: scan only the most recent 20,000 runs (PK index on runid).
-- 2. prune-cron-run-history: daily 04:30 UTC, delete run history older than 30 days.
-- 3. One-off: delete rows older than 30 days now (210,034 rows at the time of writing).
--    This is pg_cron's own execution log, not pilot data.

CREATE OR REPLACE FUNCTION public.get_cron_failure_streaks(p_threshold integer DEFAULT 3)
 RETURNS TABLE(jobname text, consecutive_failures integer, last_run timestamp with time zone, last_message text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
  WITH ranked AS (
    SELECT
      d.jobid,
      d.status,
      d.start_time,
      d.return_message,
      ROW_NUMBER() OVER (PARTITION BY d.jobid ORDER BY d.start_time DESC) AS rn
    FROM cron.job_run_details d
    -- Bounded scan via the primary key (runid grows with time): ~2,100 runs/day, so
    -- 20,000 runs is ~9 days — plenty for >= p_threshold runs of even a daily job.
    -- The unbounded version sorted the whole table and hit the 8s API statement timeout.
    WHERE d.runid > (SELECT COALESCE(MAX(runid), 0) - 20000 FROM cron.job_run_details)
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
$function$;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'prune-cron-run-history';
SELECT cron.schedule(
  'prune-cron-run-history',
  '30 4 * * *',
  $$DELETE FROM cron.job_run_details WHERE start_time < now() - interval '30 days'$$
);

DELETE FROM cron.job_run_details WHERE start_time < now() - interval '30 days';
