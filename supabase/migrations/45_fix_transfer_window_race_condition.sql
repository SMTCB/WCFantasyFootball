-- Migration 45: Fix transfer window race condition — add FOR UPDATE lock
--
-- enforce_transfer_window() previously used get_active_transfer_window() (a STABLE
-- SQL function) to read the window, then issued a separate UPDATE to decrement
-- transfers_remaining. Because STABLE functions don't hold row locks, two concurrent
-- transfers for the same league could both read the same transfers_remaining value
-- and both decrement, allowing the limit to be exceeded (double-spend).
--
-- Fix: inline the SELECT with FOR UPDATE inside the trigger so the row is locked
-- for the duration of the transaction before the decrement.

CREATE OR REPLACE FUNCTION enforce_transfer_window()
RETURNS TRIGGER AS $$
DECLARE
  win transfer_windows;
BEGIN
  -- Lock the window row to prevent concurrent decrement races.
  -- FOR UPDATE holds the lock until this transaction commits/rolls back.
  SELECT * INTO win
  FROM   transfer_windows
  WHERE  league_id = NEW.league_id
    AND  opens_at  <= NOW()
    AND  closes_at  > NOW()
  ORDER  BY opens_at DESC
  LIMIT  1
  FOR UPDATE;

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

    -- Safe to decrement now — row is locked for this transaction
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
