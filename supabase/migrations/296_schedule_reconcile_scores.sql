-- Migration 296: schedule reconcile-scores (detection-only score auditor)
--
-- reconcile-scores (PR #1011) has been deployed but never wired to a schedule, so a
-- frozen round whose stored total drifts from player_match_stats is only caught when a
-- user notices. This adds a daily run.
--
-- Scoped to tournaments with status = 'active' and to rounds that already have a
-- round_backups row (i.e. frozen rounds) — the finished World Cup (429) has ~45
-- known, deliberately-left-alone discrepancies, and an unscoped run would re-alert
-- on all of them. New UCL rounds are picked up automatically as their backup lands.
--
-- Auth: the service bearer is read at apply time from the existing
-- calculate-scores-post-match cron command, so no key is committed to git (the
-- older migrations 86/90/91/181/240 hardcoded one — do not copy that pattern).
-- Idempotent: unschedules any prior job of the same name first.

DO $mig$
DECLARE
  v_bearer text;
BEGIN
  SELECT (regexp_match(command, 'Bearer ([A-Za-z0-9._-]+)'))[1]
    INTO v_bearer
    FROM cron.job
   WHERE jobname = 'calculate-scores-post-match';

  IF v_bearer IS NULL THEN
    RAISE EXCEPTION 'migration 296: could not read the service bearer from calculate-scores-post-match';
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'reconcile-scores-daily';

  PERFORM cron.schedule(
    'reconcile-scores-daily',
    '17 7 * * *',
    format($cron$
      SELECT net.http_post(
        url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/reconcile-scores',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'Authorization', 'Bearer %s'
        ),
        body    := jsonb_build_object('matchday_id', b.matchday_id)
      )
      FROM round_backups b
      JOIN tournaments t ON t.forza_id = split_part(b.matchday_id, '-r', 1)
      WHERE t.status = 'active';
    $cron$, v_bearer)
  );
END
$mig$;
