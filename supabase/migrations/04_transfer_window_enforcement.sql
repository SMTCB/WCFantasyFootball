-- Transfer Window Enforcement (S8)
-- A trigger on the transfers table validates every insert against the
-- active transfer_windows row for that league. No client-side bypass possible.

-- 1. Helper: returns the active window for a league at a given time
CREATE OR REPLACE FUNCTION get_active_transfer_window(p_league_id UUID, p_at TIMESTAMPTZ DEFAULT NOW())
RETURNS transfer_windows AS $$
  SELECT *
  FROM   transfer_windows
  WHERE  league_id = p_league_id
  AND    opens_at  <= p_at
  AND    closes_at  > p_at
  ORDER  BY opens_at DESC
  LIMIT  1;
$$ LANGUAGE sql STABLE;

-- 2. Trigger function: validates window + decrements remaining count
CREATE OR REPLACE FUNCTION enforce_transfer_window()
RETURNS TRIGGER AS $$
DECLARE
  win transfer_windows;
BEGIN
  win := get_active_transfer_window(NEW.league_id);

  -- No open window → reject
  IF win IS NULL THEN
    RAISE EXCEPTION 'transfer_window_closed'
      USING DETAIL = 'No transfer window is currently open for this league.';
  END IF;

  -- Window open but limited → check remaining
  IF win.transfers_remaining IS NOT NULL THEN
    IF win.transfers_remaining <= 0 THEN
      RAISE EXCEPTION 'transfer_limit_reached'
        USING DETAIL = 'You have used all transfers for this window.';
    END IF;

    -- Decrement
    UPDATE transfer_windows
    SET    transfers_remaining = transfers_remaining - 1
    WHERE  id = win.id;
  END IF;

  -- Stamp the round_number from the window if not supplied
  IF NEW.round_number IS NULL THEN
    NEW.round_number := win.round_number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Attach trigger to transfers table
DROP TRIGGER IF EXISTS trg_enforce_transfer_window ON transfers;
CREATE TRIGGER trg_enforce_transfer_window
  BEFORE INSERT ON transfers
  FOR EACH ROW EXECUTE FUNCTION enforce_transfer_window();

-- 4. Position limit enforcement trigger
--    Prevents inserts that would violate squad position caps.
--    Reads current squad from draft_allocations for this league/user.
CREATE OR REPLACE FUNCTION enforce_position_limit()
RETURNS TRIGGER AS $$
DECLARE
  pos_caps  JSONB := '{"GK":2,"DEF":5,"MID":5,"FWD":3}'::jsonb;
  in_pos    TEXT;
  out_pos   TEXT;
  cur_squad TEXT[];
  pos_count INT;
  cap       INT;
BEGIN
  -- Get player_in position
  SELECT UPPER(TRIM(position)) INTO in_pos
  FROM   players WHERE id = NEW.player_in;

  -- Normalise FW → FWD
  IF in_pos = 'FW' THEN in_pos := 'FWD'; END IF;

  -- Get current squad for this user in this league
  SELECT allocated_players INTO cur_squad
  FROM   draft_allocations
  WHERE  league_id = NEW.league_id AND user_id = NEW.user_id;

  IF cur_squad IS NULL THEN RETURN NEW; END IF;

  -- Remove player_out from squad for counting
  SELECT COUNT(*) INTO pos_count
  FROM   unnest(cur_squad) pid
  JOIN   players p ON p.id = pid
  WHERE  UPPER(TRIM(p.position)) IN (in_pos, REPLACE(in_pos,'FWD','FW'))
  AND    pid <> NEW.player_out;

  cap := (pos_caps ->> in_pos)::int;

  IF cap IS NOT NULL AND pos_count >= cap THEN
    RAISE EXCEPTION 'position_limit_reached'
      USING DETAIL = format('Position %s is already at maximum (%s).', in_pos, cap);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_position_limit ON transfers;
CREATE TRIGGER trg_enforce_position_limit
  BEFORE INSERT ON transfers
  FOR EACH ROW EXECUTE FUNCTION enforce_position_limit();

-- 5. Expose window status as an RPC so the client can check
--    without doing a raw table query.
CREATE OR REPLACE FUNCTION get_transfer_window_status(p_league_id UUID)
RETURNS JSON AS $$
DECLARE
  win transfer_windows;
BEGIN
  win := get_active_transfer_window(p_league_id);
  IF win IS NULL THEN
    -- Check if there's a future window
    SELECT * INTO win
    FROM   transfer_windows
    WHERE  league_id = p_league_id AND opens_at > NOW()
    ORDER  BY opens_at ASC LIMIT 1;

    IF win IS NULL THEN
      RETURN json_build_object('status', 'no_window');
    END IF;

    RETURN json_build_object(
      'status',     'upcoming',
      'opens_at',   win.opens_at,
      'window_type', win.window_type
    );
  END IF;

  RETURN json_build_object(
    'status',               'open',
    'closes_at',            win.closes_at,
    'transfers_remaining',  win.transfers_remaining,
    'window_type',          win.window_type
  );
END;
$$ LANGUAGE plpgsql STABLE;
