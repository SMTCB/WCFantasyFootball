-- ✅ APPLIED TO PRODUCTION 2026-06-28 (v2 session)
-- Migration 193: fix two bugs reported same day as migration 192.
--
-- BUG 1 — false club eliminations (Portugal, Colombia, etc. wrongly marked eliminated).
-- sync_cup_eliminations() eliminated a club the instant it had zero *currently synced*
-- future fixtures. Knockout-round fixtures (r4+) only get written into `fixtures` once
-- Forza publishes the bracket draw, which lags behind the group stage finishing — so
-- the 00:30 UTC cron ran in the gap and eliminated 14 clubs in "Draft Mundial 26" alone
-- that had genuinely advanced (verified: they now have a real future fixture).
-- Fix: (a) self-heal — every run, reinstate any "eliminated" club that now has a future
-- fixture; (b) guard new eliminations behind a 6h buffer since the club's last finished
-- fixture, giving the fixture sync cron (every 30 min) time to publish the next round
-- before we declare elimination — same reopen-buffer convention already used by
-- get_transfer_window_status.
--
-- BUG 2 — top banner shows the wrong message for the knockout-transition unlimited
-- window added in migration 192. get_transfer_window_status() never knew about
-- club_cap_rules.unlimited_transfers, so the natural between-rounds 'matchday' window
-- type was returned even when the round is actually fully unlimited — the banner then
-- shows the generic "Free transfers available · extra buys cost points" copy instead of
-- "Unlimited transfers". Fix: when the active round (next/current matchday's round
-- suffix) has unlimited_transfers=true for a classic league, return window_type
-- ='unlimited' so the banner picks the accurate copy already wired up for that case.

-- ── Fix 1: self-healing + race-guarded sync_cup_eliminations ─────────────────────────

CREATE OR REPLACE FUNCTION public.sync_cup_eliminations(p_league_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_tournament_id     TEXT;
  v_active_count      INT;
  v_clubs_with_future INT;
  v_eliminated_count  INT := 0;
  rec                 RECORD;
  v_future_count      INT;
  v_last_finished_at  TIMESTAMPTZ;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;

  -- Self-heal: reinstate any club already marked eliminated that now has a real
  -- future fixture (the sync cron caught up after a premature elimination).
  UPDATE cup_active_clubs cac
  SET eliminated_at = NULL
  WHERE cac.league_id = p_league_id
    AND cac.eliminated_at IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM fixtures f
       WHERE (f.home_team = cac.club_id OR f.away_team = cac.club_id
           OR f.home_team_forza_id::text = cac.club_id
           OR f.away_team_forza_id::text = cac.club_id)
         AND f.status != 'finished'
         AND f.kickoff_at > NOW()
         AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id)
    );

  SELECT COUNT(*) INTO v_active_count FROM cup_active_clubs WHERE league_id = p_league_id AND eliminated_at IS NULL;
  IF v_active_count = 0 THEN RETURN 0; END IF;
  SELECT COUNT(DISTINCT cac.club_id) INTO v_clubs_with_future
    FROM cup_active_clubs cac
   WHERE cac.league_id = p_league_id AND cac.eliminated_at IS NULL
     AND EXISTS (
       SELECT 1 FROM fixtures f
        WHERE (f.home_team = cac.club_id OR f.away_team = cac.club_id
            OR f.home_team_forza_id::text = cac.club_id
            OR f.away_team_forza_id::text = cac.club_id)
          AND f.status != 'finished'
          AND f.kickoff_at > NOW()
          AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id)
     );
  IF v_clubs_with_future = 0 THEN RETURN 0; END IF;

  FOR rec IN SELECT cac.club_id FROM cup_active_clubs cac WHERE cac.league_id = p_league_id AND cac.eliminated_at IS NULL LOOP
    SELECT COUNT(*) INTO v_future_count FROM fixtures f
     WHERE (f.home_team = rec.club_id OR f.away_team = rec.club_id
         OR f.home_team_forza_id::text = rec.club_id
         OR f.away_team_forza_id::text = rec.club_id)
       AND f.status != 'finished'
       AND f.kickoff_at > NOW()
       AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id);
    IF v_future_count = 0 THEN
      -- Race guard: only eliminate once 6h have passed since this club's last
      -- finished fixture, so the fixture sync cron has time to publish their
      -- next-round match before we declare them out.
      SELECT MAX(f.kickoff_at) INTO v_last_finished_at FROM fixtures f
       WHERE (f.home_team = rec.club_id OR f.away_team = rec.club_id
           OR f.home_team_forza_id::text = rec.club_id
           OR f.away_team_forza_id::text = rec.club_id)
         AND f.status = 'finished'
         AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id);
      IF v_last_finished_at IS NOT NULL AND NOW() - v_last_finished_at > interval '6 hours' THEN
        PERFORM eliminate_cup_club(p_league_id, rec.club_id);
        v_eliminated_count := v_eliminated_count + 1;
      END IF;
    END IF;
  END LOOP;
  RETURN v_eliminated_count;
END;
$function$;

-- One-off correction: re-run the self-heal across every league right now so the
-- 14 wrongly-eliminated clubs (Portugal, Colombia, Brazil, Spain, Netherlands, etc.)
-- are reinstated immediately rather than waiting for the next 6h cron tick.
DO $$
DECLARE
  v_league_id uuid;
BEGIN
  FOR v_league_id IN SELECT DISTINCT league_id FROM cup_active_clubs WHERE eliminated_at IS NOT NULL LOOP
    PERFORM sync_cup_eliminations(v_league_id);
  END LOOP;
END $$;

-- ── Fix 2: get_transfer_window_status reflects the knockout-unlimited rule ───────────

CREATE OR REPLACE FUNCTION public.get_transfer_window_status(p_league_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
  win                   transfer_windows;
  v_tournament_id       text;
  v_league_mode         text;
  v_prev_deadline       timestamptz;
  v_prev_matchday_id    text;
  v_next_deadline       timestamptz;
  v_next_matchday_id    text;
  v_reopen_hours        int;
  v_round_number        int;
  v_last_kickoff        timestamptz;
  v_reopen_at           timestamptz;
  v_active_round_suffix text;
  v_knockout_unlimited  boolean := false;
BEGIN
  SELECT (config_value #>> '{}')::int INTO v_reopen_hours
    FROM league_config
   WHERE league_id = p_league_id AND config_key = 'transfer_reopen_hours';

  win := get_active_transfer_window(p_league_id);
  IF win.id IS NOT NULL THEN
    RETURN json_build_object(
      'status',              'open',
      'closes_at',           win.closes_at,
      'transfers_remaining', win.transfers_remaining,
      'window_type',         win.window_type
    );
  END IF;

  SELECT * INTO win
    FROM transfer_windows
   WHERE league_id = p_league_id AND opens_at > NOW()
   ORDER BY opens_at ASC LIMIT 1;
  IF win.id IS NOT NULL THEN
    RETURN json_build_object('status', 'upcoming', 'opens_at', win.opens_at, 'window_type', win.window_type);
  END IF;

  SELECT tournament_id, league_mode INTO v_tournament_id, v_league_mode FROM leagues WHERE id = p_league_id;
  IF v_tournament_id IS NULL THEN RETURN json_build_object('status', 'no_window'); END IF;

  SELECT deadline_at, matchday_id
    INTO v_prev_deadline, v_prev_matchday_id
    FROM matchday_deadlines
   WHERE tournament_id = v_tournament_id AND deadline_at <= NOW()
   ORDER BY deadline_at DESC LIMIT 1;

  SELECT deadline_at, matchday_id INTO v_next_deadline, v_next_matchday_id
    FROM matchday_deadlines
   WHERE tournament_id = v_tournament_id AND deadline_at > NOW()
   ORDER BY deadline_at ASC LIMIT 1;

  -- Active round for the unlimited-transfers check: the round about to be played
  -- (next deadline's matchday_id) if known, else the round that just closed.
  v_active_round_suffix := split_part(COALESCE(v_next_matchday_id, v_prev_matchday_id, ''), '-', 2);
  IF v_league_mode = 'classic' AND v_active_round_suffix <> '' THEN
    SELECT unlimited_transfers INTO v_knockout_unlimited
      FROM club_cap_rules
     WHERE tournament_id = v_tournament_id AND round_suffix = v_active_round_suffix;
    v_knockout_unlimited := COALESCE(v_knockout_unlimited, false);
  END IF;

  IF v_prev_deadline IS NULL THEN
    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status', 'open', 'closes_at', v_next_deadline,
        'transfers_remaining', NULL,
        'window_type', CASE WHEN v_knockout_unlimited THEN 'unlimited' ELSE 'matchday' END
      );
    END IF;
    RETURN json_build_object('status', 'no_window');
  END IF;

  IF v_reopen_hours IS NULL THEN
    IF v_prev_matchday_id IS NOT NULL THEN
      v_round_number := split_part(v_prev_matchday_id, '-r', 2)::int;
    END IF;
    IF v_round_number IS NOT NULL AND v_round_number <= 3 THEN
      v_reopen_hours := 1;
    ELSE
      v_reopen_hours := 6;
    END IF;
  END IF;

  IF v_prev_matchday_id IS NOT NULL THEN
    SELECT MAX(kickoff_at) INTO v_last_kickoff
      FROM fixtures
     WHERE matchday_id   = v_prev_matchday_id
       AND tournament_id = v_tournament_id;
  END IF;

  IF v_last_kickoff IS NOT NULL THEN
    v_reopen_at := v_last_kickoff
                 + interval '2 hours'
                 + (v_reopen_hours || ' hours')::interval;
  ELSE
    v_reopen_at := v_prev_deadline + (v_reopen_hours || ' hours')::interval;
  END IF;

  IF NOW() >= v_reopen_at THEN
    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status', 'open', 'closes_at', v_next_deadline,
        'transfers_remaining', NULL,
        'window_type', CASE WHEN v_knockout_unlimited THEN 'unlimited' ELSE 'matchday' END
      );
    END IF;
    RETURN json_build_object('status', 'no_window');
  END IF;

  RETURN json_build_object(
    'status',      'upcoming',
    'opens_at',    v_reopen_at,
    'window_type', 'matchday'
  );
END;
$function$;
