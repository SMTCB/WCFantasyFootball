-- Migration 90: E2E test bug fixes (session 52, 2026-05-29)
--
-- BUG-E2E-03: place_bid ON CONFLICT DO NOTHING silently drops re-bids
--   The UNIQUE(listing_id, bidder_id) constraint combined with ON CONFLICT DO NOTHING
--   meant that any subsequent bid by the same user on the same listing was silently
--   ignored — only the first bid was ever recorded. Fix: upsert so each user's row
--   always reflects their latest (highest) bid.
--
-- BUG-E2E-05: get_transfer_window_status returns 'no_window' for leagues that use
--   matchday_deadlines for window enforcement instead of the transfer_windows table.
--   The admin panel showed "TRANSFER WINDOW ● CLOSED" even though process-transfer
--   (which reads matchday_deadlines) was correctly allowing transfers. Fix: add a
--   matchday_deadlines fallback to get_transfer_window_status.
--
-- BUG-E2E-06: process-transfer SELL path left active auction_listings open after
--   the player was sold. The winning bidder could receive a player the seller no
--   longer owns. Fix handled in Edge Function (index.js) — no DB migration needed,
--   but this migration documents the fix.

-- ── BUG-E2E-03: place_bid — upsert so re-bids update the existing row ───────

CREATE OR REPLACE FUNCTION public.place_bid(p_listing_id uuid, p_bid_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_listing auction_listings;
  v_min_bid  NUMERIC;
BEGIN
  SELECT * INTO v_listing FROM auction_listings WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Listing not found');
  END IF;

  IF v_listing.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction is not open');
  END IF;

  IF v_listing.deadline_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction deadline passed');
  END IF;

  v_min_bid := GREATEST(v_listing.starting_bid, v_listing.current_bid + v_listing.min_increment);

  IF p_bid_amount < v_min_bid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bid too low. Minimum: ' || v_min_bid);
  END IF;

  -- Update current bid + highest bidder on the listing
  UPDATE auction_listings
  SET current_bid        = p_bid_amount,
      highest_bidder_id  = auth.uid(),
      updated_at         = NOW()
  WHERE id = p_listing_id;

  -- Upsert bid history: update existing row for this bidder rather than dropping
  -- re-bids. This means each user has exactly one row per listing, always showing
  -- their latest (highest) bid — preserving a clean audit trail.
  INSERT INTO auction_bids (listing_id, league_id, bidder_id, amount, placed_at)
  VALUES (p_listing_id, v_listing.league_id, auth.uid(), p_bid_amount, NOW())
  ON CONFLICT (listing_id, bidder_id)
    DO UPDATE SET amount = EXCLUDED.amount, placed_at = EXCLUDED.placed_at;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── BUG-E2E-05: get_transfer_window_status — matchday_deadlines fallback ────

CREATE OR REPLACE FUNCTION public.get_transfer_window_status(p_league_id uuid)
RETURNS json LANGUAGE plpgsql STABLE AS $$
DECLARE
  win              transfer_windows;
  v_tournament_id  text;
  v_next_deadline  timestamptz;
BEGIN
  -- 1. Check for an active transfer_windows row (canonical path for EPL leagues)
  win := get_active_transfer_window(p_league_id);
  IF win IS NOT NULL THEN
    RETURN json_build_object(
      'status',              'open',
      'closes_at',           win.closes_at,
      'transfers_remaining', win.transfers_remaining,
      'window_type',         win.window_type
    );
  END IF;

  -- 2. Check for a future transfer_windows row (upcoming)
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

  -- 3. Fallback: use matchday_deadlines for tournament-based leagues (e.g. WC).
  --    If a future deadline exists, the window is effectively open — process-transfer
  --    uses the same matchday_deadlines logic for enforcement.
  SELECT l.tournament_id INTO v_tournament_id
  FROM   leagues l WHERE l.id = p_league_id;

  IF v_tournament_id IS NOT NULL THEN
    SELECT deadline_at INTO v_next_deadline
    FROM   matchday_deadlines
    WHERE  tournament_id = v_tournament_id
      AND  deadline_at   > NOW()
    ORDER  BY deadline_at ASC LIMIT 1;

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
