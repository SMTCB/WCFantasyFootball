-- 111_session66b_h1_budget_reservation.sql
-- H1: place_bid — add budget reservation check
-- Before accepting a bid, sum all open auctions where the caller is currently the
-- highest bidder (their "reserved" budget that will be debited at settlement).
-- The new bid must fit within budget_remaining minus reserved bids.
-- No schema change needed — pure query-time enforcement.

CREATE OR REPLACE FUNCTION public.place_bid(
  p_listing_id UUID,
  p_bid_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing    auction_listings;
  v_min_bid    NUMERIC;
  v_squad_id   UUID;
  v_budget     NUMERIC;
  v_reserved   NUMERIC;
  v_available  NUMERIC;
BEGIN
  -- Lock the listing row to prevent concurrent bids overwriting each other
  SELECT * INTO v_listing FROM auction_listings WHERE id = p_listing_id FOR UPDATE;

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

  -- Lock the bidder's squad row to prevent budget double-spend across concurrent bids
  SELECT id, budget_remaining
    INTO v_squad_id, v_budget
    FROM squads
   WHERE league_id = v_listing.league_id
     AND user_id   = auth.uid()
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF v_squad_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  -- Sum the caller's currently-winning bids on OTHER open auctions in this league.
  -- These amounts will be debited at settlement, so they must be treated as reserved.
  -- Excludes this listing (user may be raising their own existing bid).
  SELECT COALESCE(SUM(current_bid), 0)
    INTO v_reserved
    FROM auction_listings
   WHERE league_id          = v_listing.league_id
     AND highest_bidder_id  = auth.uid()
     AND status             = 'open'
     AND id                 <> p_listing_id;

  v_available := v_budget - v_reserved;

  IF v_available < p_bid_amount THEN
    RETURN jsonb_build_object(
      'ok',       false,
      'error',    'Insufficient available budget',
      'budget',   v_budget,
      'reserved', v_reserved,
      'available', v_available
    );
  END IF;

  UPDATE auction_listings
  SET current_bid        = p_bid_amount,
      highest_bidder_id  = auth.uid(),
      updated_at         = NOW()
  WHERE id = p_listing_id;

  INSERT INTO auction_bids (listing_id, league_id, bidder_id, amount, placed_at)
  VALUES (p_listing_id, v_listing.league_id, auth.uid(), p_bid_amount, NOW())
  ON CONFLICT (listing_id, bidder_id)
    DO UPDATE SET amount = EXCLUDED.amount, placed_at = EXCLUDED.placed_at;

  RETURN jsonb_build_object('ok', true);
END;
$$;
