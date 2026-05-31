-- AUDIT-57-11: get_transfer_window_status always returned status:'open' for WC/
-- tournament leagues as long as any future deadline existed, even seconds after
-- a round locked. Managers saw "Window Open · Closes in 32 days" immediately
-- after their squad was locked.
--
-- Fix: introduce a 6-hour "recovery window" after each matchday deadline.
-- During that gap the banner shows "Window Closed · Opens in X". After 6h the
-- window is genuinely open for the next round's transfers.
--
-- The 6-hour gap is generous: WC deadlines are ~2h before kickoff, matches run
-- ~2h, and the 6h window covers roughly the full match evening before managers
-- need to swap for the next round.

CREATE OR REPLACE FUNCTION public.get_transfer_window_status(p_league_id uuid)
RETURNS json LANGUAGE plpgsql STABLE AS $$
DECLARE
  win              transfer_windows;
  v_tournament_id  text;
  v_prev_deadline  timestamptz;
  v_next_deadline  timestamptz;
  v_reopen_at      timestamptz;
BEGIN
  -- 1. Active transfer_windows row (canonical path for EPL leagues)
  win := get_active_transfer_window(p_league_id);
  IF win IS NOT NULL THEN
    RETURN json_build_object(
      'status',              'open',
      'closes_at',           win.closes_at,
      'transfers_remaining', win.transfers_remaining,
      'window_type',         win.window_type
    );
  END IF;

  -- 2. Future transfer_windows row (EPL upcoming)
  SELECT * INTO win
  FROM   transfer_windows
  WHERE  league_id = p_league_id AND opens_at > NOW()
  ORDER  BY opens_at ASC LIMIT 1;

  IF win IS NOT NULL THEN
    RETURN json_build_object(
      'status',      'upcoming',
      'opens_at',    win.opens_at,
      'window_type', win.window_type
    );
  END IF;

  -- 3. Matchday-deadline path (WC / tournament leagues)
  SELECT l.tournament_id INTO v_tournament_id
  FROM   leagues l WHERE l.id = p_league_id;

  IF v_tournament_id IS NOT NULL THEN
    -- Most recent past deadline
    SELECT deadline_at INTO v_prev_deadline
    FROM   matchday_deadlines
    WHERE  tournament_id = v_tournament_id AND deadline_at <= NOW()
    ORDER  BY deadline_at DESC LIMIT 1;

    -- Next upcoming deadline
    SELECT deadline_at INTO v_next_deadline
    FROM   matchday_deadlines
    WHERE  tournament_id = v_tournament_id AND deadline_at > NOW()
    ORDER  BY deadline_at ASC LIMIT 1;

    -- Within 6 hours after a deadline: show "Window Closed · Opens in X"
    -- so managers understand their round-N squad is locked.
    IF v_prev_deadline IS NOT NULL
       AND NOW() < v_prev_deadline + INTERVAL '6 hours'
       AND v_next_deadline IS NOT NULL
    THEN
      v_reopen_at := v_prev_deadline + INTERVAL '6 hours';
      RETURN json_build_object(
        'status',      'upcoming',
        'opens_at',    v_reopen_at,
        'window_type', 'matchday'
      );
    END IF;

    -- Outside recovery window and next deadline exists: window is open
    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status',              'open',
        'closes_at',           v_next_deadline,
        'transfers_remaining', NULL,
        'window_type',         'matchday'
      );
    END IF;
  END IF;

  RETURN json_build_object('status', 'no_window');
END;
$$;
