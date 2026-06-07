-- Migration 148: guard sweep_void_auction_confirmations against open windows
--
-- Root cause: the sweep checked only whether a matchday deadline had passed
-- after won_at, which correctly detects "window closed after win" for
-- matchday-based leagues — but also cancelled listings in leagues with an
-- unlimited/free transfer window (migration 144) because their tournament's
-- matchday_deadlines rows still exist in the DB and were passing.
--
-- Fix: skip any listing whose league currently has an OPEN transfer window.
-- If the window is open the buyer still has a valid opportunity to confirm;
-- only void once the window closes.

CREATE OR REPLACE FUNCTION public.sweep_void_auction_confirmations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cancelled INT;
BEGIN
  WITH voided AS (
    UPDATE auction_listings al
    SET status = 'cancelled', updated_at = NOW()
    WHERE al.status = 'pending_confirmation'
      -- Window is currently CLOSED for this league — buyer has no open opportunity
      AND (get_transfer_window_status(al.league_id) ->> 'status') <> 'open'
      AND (
        -- Matchday-type: a deadline that opened after the win has since passed
        EXISTS (
          SELECT 1
          FROM matchday_deadlines md
          JOIN leagues l ON l.id = al.league_id AND l.tournament_id = md.tournament_id
          WHERE md.deadline_at > al.won_at
            AND md.deadline_at < NOW()
        )
        OR
        -- Explicit transfer window: a window that was open after the win has since closed
        EXISTS (
          SELECT 1 FROM transfer_windows tw
          WHERE tw.league_id = al.league_id
            AND tw.closes_at > al.won_at
            AND tw.closes_at < NOW()
        )
      )
    RETURNING id
  )
  SELECT COUNT(*) INTO v_cancelled FROM voided;

  RETURN v_cancelled;
END;
$$;
