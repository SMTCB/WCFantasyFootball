-- Migration 280: daily safety-net sweep for stale tennis tournaments
--
-- Why: Wimbledon sat in `roster_open` for weeks after its real-world end
-- date because no admin ever called admin_start_tournament — the whole
-- sync-tennis-results / score-tennis-tournament pipeline (including the
-- Part A auto-score-on-champion trigger added to sync-tennis-results this
-- same session) only ever looks at tournaments already in `in_progress` or
-- `qf_captain_open`. A tournament that never left `upcoming`/`roster_open`
-- is invisible to that pipeline forever, and would stay "available" in the
-- app indefinitely with no automated way to notice.
--
-- This is the backstop: once a day, sweep for any tennis tournament whose
-- end_date is more than 3 days in the past and force it out of an open
-- state, so nothing stays visible/joinable long after the real event ended.
--
-- Behavior by current status:
--   - in_progress / qf_captain_open (tournament was started -- most likely
--     already has real results, but champion detection may have missed for
--     some reason: non-power-of-two draw, walkover, API hiccup, etc.)
--     -> re-invoke score-tennis-tournament. That function scores whatever
--     rosters exist and calls admin_complete_tournament itself -- same call
--     Part A's auto-trigger makes, and idempotent if already scored/completed.
--   - upcoming / roster_open (never started -- an admin forgot to open it)
--     -> nothing to score (no results were ever pulled), so directly flip
--     to completed. Rare path; only fires when a tournament's real-world
--     end date has already passed by 3+ days with zero admin action taken.
--
-- SECRET REDACTED FROM THIS FILE — this repo is public. <ADMIN_TRIGGER_KEY>
-- below is a placeholder, not the literal string to run — see migration
-- 272's note for the full explanation of this pattern. The real value was
-- substituted in by hand and applied directly to the live DB without ever
-- being printed to a log, by extracting it at runtime from the existing
-- sync-tennis-results cron.job row rather than typing it out.

CREATE OR REPLACE FUNCTION public.tennis_stale_tournament_sweep()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT id FROM tennis_tournaments
    WHERE status IN ('in_progress', 'qf_captain_open')
      AND end_date < CURRENT_DATE - INTERVAL '3 days'
  LOOP
    PERFORM net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/score-tennis-tournament',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ADMIN_TRIGGER_KEY>'
      ),
      body    := jsonb_build_object('tournament_id', t.id)
    );
  END LOOP;

  UPDATE tennis_tournaments
  SET status = 'completed'
  WHERE status IN ('upcoming', 'roster_open')
    AND end_date < CURRENT_DATE - INTERVAL '3 days';
END;
$function$;

SELECT cron.schedule(
  'tennis-stale-tournament-sweep',
  '0 6 * * *',
  $$SELECT public.tennis_stale_tournament_sweep();$$
);
