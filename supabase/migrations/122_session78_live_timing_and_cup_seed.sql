-- Migration 122: Session 78 — live-ingest timing (D1) + cup-seed tournament scope
--
-- D1: live match scoring had two timing gaps during the pilot's live matches:
--   (a) status only flipped scheduled→live via the 30-min sync-fixtures cron, so up
--       to ~30 min of a match could elapse before the first stat ingest.
--   (b) the live ingest cron only polled status='live' fixtures, and ingest itself
--       flips live→finished — so if the final poll missed full-time, late stats
--       (stoppage-time goals/cards, post-whistle stat finalisation) were never
--       re-fetched. The daily safety-net crons only re-SCORE existing rows; they
--       never re-INGEST from Forza.
--
-- Fixes:
--   1. flip-fixtures-live cron — flips scheduled→live straight off kickoff_at,
--      independent of the Forza sync round-trip.
--   2. ingest-match-events-live — also re-ingests fixtures that finished in the last
--      3 hours, so the final-whistle pass is guaranteed. ingest is idempotent
--      (upsert on fixture_id,player_id; calculate-scores recomputes from scratch),
--      so re-ingesting a finished match is safe.

-- ── 1. Kickoff-driven scheduled→live flip ────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'flip-fixtures-live') THEN
    PERFORM cron.unschedule('flip-fixtures-live');
  END IF;
END $$;
SELECT cron.schedule(
  'flip-fixtures-live',
  '*/2 * * * *',
  $$
  UPDATE fixtures
     SET status = 'live'
   WHERE status = 'scheduled'
     AND kickoff_at <= NOW()
     AND kickoff_at > NOW() - INTERVAL '4 hours';
  $$
);

-- ── 2. Re-ingest live AND recently-finished fixtures ─────────────────────────
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
  WHERE f.forza_match_id IS NOT NULL
    AND (
      f.status = 'live'
      OR (f.status = 'finished' AND f.kickoff_at > NOW() - INTERVAL '3 hours')
    );
  $$
);

-- ── 3. seed_cup_clubs(uuid) — scope to the league's tournament ────────────────
-- The single-arg overload seeded clubs from ALL players regardless of tournament,
-- which mixed (e.g.) EPL clubs into a World-Cup league's cup pool. Scope it to the
-- league's tournament so the knockout pool only ever contains that tournament's clubs.
CREATE OR REPLACE FUNCTION public.seed_cup_clubs(p_league_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_tournament_id text;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;
  INSERT INTO cup_active_clubs (league_id, club_id)
  SELECT DISTINCT p_league_id, club
  FROM   players
  WHERE  club IS NOT NULL AND club <> ''
    AND  (v_tournament_id IS NULL OR tournament_id = v_tournament_id)
  ON CONFLICT (league_id, club_id) DO NOTHING;
END;
$$;
