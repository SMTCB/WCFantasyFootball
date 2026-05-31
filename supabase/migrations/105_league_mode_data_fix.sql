-- Migration 105: league_mode data fix, sync trigger, sync_cup_eliminations(), and
-- auto-elimination cron job.
-- Session 61 — Phase 2 backend: league_mode correctness + cup elimination automation.

-- ── 1. Fix existing league_mode data ─────────────────────────────────────────
-- Migration 104 added league_mode with DEFAULT 'draft', so every existing league
-- (including 'classic' format ones) got league_mode='draft'.  Correct now.

UPDATE leagues
SET league_mode = CASE
  WHEN format::text = 'noduplicate' THEN 'draft'
  ELSE 'classic'
END;

-- ── 2. Trigger: keep league_mode in sync with format ─────────────────────────
-- Any future INSERT or UPDATE that changes format will automatically set the
-- correct league_mode value, so create_league() and any direct UPDATE need not
-- be aware of the mapping.

CREATE OR REPLACE FUNCTION sync_league_mode()
RETURNS TRIGGER AS $$
BEGIN
  NEW.league_mode := CASE
    WHEN NEW.format::text = 'noduplicate' THEN 'draft'
    ELSE 'classic'
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_league_mode ON leagues;

CREATE TRIGGER trg_sync_league_mode
BEFORE INSERT OR UPDATE OF format ON leagues
FOR EACH ROW EXECUTE FUNCTION sync_league_mode();

-- ── 3. sync_cup_eliminations(p_league_id UUID) ───────────────────────────────
-- Checks each still-active club in cup_active_clubs for this league and
-- eliminates any that have no remaining future fixtures.
--
-- Safety guard: if ALL active clubs have 0 future fixtures (fixture data not yet
-- available from the API), the function does nothing and returns 0.
--
-- Returns: count of clubs eliminated in this call.

CREATE OR REPLACE FUNCTION sync_cup_eliminations(p_league_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament_id     TEXT;
  v_active_count      INT;
  v_clubs_with_future INT;
  v_eliminated_count  INT := 0;
  rec                 RECORD;
  v_future_count      INT;
BEGIN
  -- Get the league's tournament_id so we scope fixture checks correctly.
  SELECT tournament_id INTO v_tournament_id
  FROM leagues
  WHERE id = p_league_id;

  -- Count how many clubs are currently active (not yet eliminated).
  SELECT COUNT(*) INTO v_active_count
  FROM cup_active_clubs
  WHERE league_id = p_league_id
    AND eliminated_at IS NULL;

  -- Nothing to do if no active clubs exist.
  IF v_active_count = 0 THEN
    RETURN 0;
  END IF;

  -- Count how many active clubs have at least one future fixture.
  -- If the count is 0, fixture data hasn't arrived yet — abort to avoid
  -- mass-eliminating clubs on stale data.
  SELECT COUNT(DISTINCT cac.club_id) INTO v_clubs_with_future
  FROM cup_active_clubs cac
  WHERE cac.league_id    = p_league_id
    AND cac.eliminated_at IS NULL
    AND EXISTS (
      SELECT 1 FROM fixtures f
      WHERE (
        f.home_team           = cac.club_id
        OR f.away_team        = cac.club_id
        OR f.home_team_forza_id::text = cac.club_id
        OR f.away_team_forza_id::text = cac.club_id
      )
      AND f.status   != 'completed'
      AND f.kickoff_at > NOW()
      AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id)
    );

  -- Safety guard: if NO active club has future fixtures, fixture data not yet
  -- available — do nothing.
  IF v_clubs_with_future = 0 THEN
    RETURN 0;
  END IF;

  -- Iterate over each active club and eliminate those with no future fixtures.
  FOR rec IN
    SELECT cac.club_id
    FROM cup_active_clubs cac
    WHERE cac.league_id    = p_league_id
      AND cac.eliminated_at IS NULL
  LOOP
    SELECT COUNT(*) INTO v_future_count
    FROM fixtures f
    WHERE (
      f.home_team           = rec.club_id
      OR f.away_team        = rec.club_id
      OR f.home_team_forza_id::text = rec.club_id
      OR f.away_team_forza_id::text = rec.club_id
    )
    AND f.status   != 'completed'
    AND f.kickoff_at > NOW()
    AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id);

    IF v_future_count = 0 THEN
      PERFORM eliminate_cup_club(p_league_id, rec.club_id);
      v_eliminated_count := v_eliminated_count + 1;
    END IF;
  END LOOP;

  RETURN v_eliminated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION sync_cup_eliminations(UUID) TO service_role;

-- ── 4. Cron: auto-elimination every 6 hours ──────────────────────────────────
-- Calls the eliminate-cup-club edge function in "auto" mode so it can loop
-- over all cup leagues and call sync_cup_eliminations() for each.
-- Staggered 30 min after sync-wc-fixtures-6h so fixture data is fresh.

SELECT cron.schedule(
  'sync-cup-eliminations',
  '30 */6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/eliminate-cup-club',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
      ),
      body    := '{"mode": "auto"}'::jsonb
    );
  $$
);
