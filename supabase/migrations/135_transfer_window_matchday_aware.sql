-- Migration 135: Transfer window closes for the full matchday, reopens after last match
--
-- Previous behaviour: window reopened 6h after the matchday DEADLINE regardless
-- of when the last match finished — leaving the market open mid-matchday.
--
-- New behaviour:
--   Close: at the matchday deadline (first kickoff, as set by sync)
--   Stay closed: until the last kickoff of that matchday + 2h match buffer + 6h scoring
--   Reopen: automatically once that timestamp passes
--
-- The 2h buffer covers 90 min + 30 min extra time + ceremonies. Combined with
-- the 6h scoring window the market is closed for ~8h from the last kickoff.
-- This is also a natural fallback for stuck-fixture cases — no explicit handling needed.
--
-- Applies to both WC/cup leagues (matchday-deadline path) and any classic league
-- that has matchday_deadlines without a manual transfer_windows row.

CREATE OR REPLACE FUNCTION get_transfer_window_status(p_league_id uuid)
RETURNS json LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  win                  transfer_windows;
  v_tournament_id      text;
  v_prev_deadline      timestamptz;
  v_prev_matchday_id   text;
  v_next_deadline      timestamptz;
  v_reopen_hours       int := 6;
  v_last_kickoff       timestamptz;
  v_reopen_at          timestamptz;
BEGIN
  -- Per-league reopen hours (default 6)
  SELECT (config_value #>> '{}')::int INTO v_reopen_hours
    FROM league_config
   WHERE league_id = p_league_id AND config_key = 'transfer_reopen_hours';
  IF v_reopen_hours IS NULL THEN v_reopen_hours := 6; END IF;

  -- 1. Active manual transfer_windows row (EPL / commissioner-controlled)
  win := get_active_transfer_window(p_league_id);
  IF win IS NOT NULL THEN
    RETURN json_build_object(
      'status',              'open',
      'closes_at',           win.closes_at,
      'transfers_remaining', win.transfers_remaining,
      'window_type',         win.window_type
    );
  END IF;

  -- 2. Future manual transfer_windows row
  SELECT * INTO win
    FROM transfer_windows
   WHERE league_id = p_league_id AND opens_at > NOW()
   ORDER BY opens_at ASC LIMIT 1;
  IF win IS NOT NULL THEN
    RETURN json_build_object('status', 'upcoming', 'opens_at', win.opens_at, 'window_type', win.window_type);
  END IF;

  -- 3. Matchday-deadline path
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;
  IF v_tournament_id IS NULL THEN RETURN json_build_object('status', 'no_window'); END IF;

  -- Most recent past deadline and its matchday_id
  SELECT deadline_at, matchday_id
    INTO v_prev_deadline, v_prev_matchday_id
    FROM matchday_deadlines
   WHERE tournament_id = v_tournament_id AND deadline_at <= NOW()
   ORDER BY deadline_at DESC LIMIT 1;

  -- Next future deadline
  SELECT deadline_at INTO v_next_deadline
    FROM matchday_deadlines
   WHERE tournament_id = v_tournament_id AND deadline_at > NOW()
   ORDER BY deadline_at ASC LIMIT 1;

  -- No past deadline yet: open until first matchday
  IF v_prev_deadline IS NULL THEN
    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status', 'open', 'closes_at', v_next_deadline,
        'transfers_remaining', NULL, 'window_type', 'matchday'
      );
    END IF;
    RETURN json_build_object('status', 'no_window');
  END IF;

  -- Find the last kickoff of the current matchday (to determine reopen time)
  IF v_prev_matchday_id IS NOT NULL THEN
    SELECT MAX(kickoff_at) INTO v_last_kickoff
      FROM fixtures
     WHERE matchday_id    = v_prev_matchday_id
       AND tournament_id  = v_tournament_id;
  END IF;

  -- reopen_at = last kickoff + 2h match buffer + N hours scoring window
  -- Fallback: deadline + N hours if no fixtures found for this matchday_id
  IF v_last_kickoff IS NOT NULL THEN
    v_reopen_at := v_last_kickoff
                 + interval '2 hours'
                 + (v_reopen_hours || ' hours')::interval;
  ELSE
    v_reopen_at := v_prev_deadline + (v_reopen_hours || ' hours')::interval;
  END IF;

  -- Past reopen_at → open until next deadline
  IF NOW() >= v_reopen_at THEN
    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status', 'open', 'closes_at', v_next_deadline,
        'transfers_remaining', NULL, 'window_type', 'matchday'
      );
    END IF;
    RETURN json_build_object('status', 'no_window');
  END IF;

  -- Still within the matchday window — closed, show estimated reopen time
  RETURN json_build_object(
    'status',      'upcoming',
    'opens_at',    v_reopen_at,
    'window_type', 'matchday'
  );
END;
$$;
