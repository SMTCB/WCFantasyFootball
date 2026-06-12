-- Migration 174: fix get_transfer_window_status ignoring "unlimited" windows
--
-- Reported: commissioner toggled EMERGENCY TRANSFERS ON for "Munaial '26"
-- (PR #517's useFreeTransferWindow inserts a transfer_windows row with
-- window_type='unlimited', round_number=NULL, transfers_remaining=NULL — the
-- same shape migration 144's Free Transfer Window card has always written),
-- but PLAYER MARKET still showed "WINDOW CLOSED — Opens in 5d 20h".
--
-- Root cause: get_transfer_window_status does
--   win := get_active_transfer_window(p_league_id);
--   IF win IS NOT NULL THEN RETURN ...status:'open'...
-- `win` is a `transfer_windows` composite. Per SQL row-comparison semantics,
-- `ROW(...) IS NOT NULL` is only TRUE if *every* field is non-null, and
-- `IS NULL` only TRUE if *every* field is null. A found row with
-- round_number=NULL AND transfers_remaining=NULL (true for every 'unlimited'
-- window, by design) is neither — so `win IS NOT NULL` evaluates to FALSE
-- even though a matching row was returned, and the function falls through to
-- the matchday-deadline branch.
--
-- Fix: check `win.id IS NOT NULL` instead (id is NOT NULL / primary key —
-- unambiguous "row found" test) in both the active-window and
-- future-window checks.

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

  -- 1. Active manual transfer_windows row (EPL / commissioner-controlled,
  --    including emergency/free 'unlimited' windows)
  win := get_active_transfer_window(p_league_id);
  IF win.id IS NOT NULL THEN
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
  IF win.id IS NOT NULL THEN
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
