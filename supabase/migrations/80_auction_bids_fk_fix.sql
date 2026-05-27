-- BUG-05: auction_bids.listing_id FK pointed to trade_listings instead of auction_listings.
-- The canonical auction system uses auction_listings (place_bid, sell_now RPCs + useAuctions hook).
-- trade_listings is a separate trade/swap system; auction_bids is bid history for auction_listings.

-- 1. Clear orphaned E2E test rows that referenced trade_listings IDs
TRUNCATE TABLE auction_bids;

-- 2. Drop wrong FK
ALTER TABLE auction_bids
  DROP CONSTRAINT IF EXISTS auction_bids_listing_id_fkey;

-- 3. Add correct FK → auction_listings
ALTER TABLE auction_bids
  ADD CONSTRAINT auction_bids_listing_id_fkey
    FOREIGN KEY (listing_id) REFERENCES auction_listings(id) ON DELETE CASCADE;

-- 4. Update place_bid (2-arg) to also write bid history into auction_bids.
--    The 3-arg overload (migration 27) references obsolete column names and is dead code; drop it.
DROP FUNCTION IF EXISTS public.place_bid(uuid, uuid, numeric);

CREATE OR REPLACE FUNCTION public.place_bid(p_listing_id uuid, p_bid_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_listing auction_listings;
  v_min_bid NUMERIC;
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
  SET current_bid = p_bid_amount,
      highest_bidder_id = auth.uid(),
      updated_at = NOW()
  WHERE id = p_listing_id;

  -- Record individual bid in history (idempotent: same user + same amount = ignore)
  INSERT INTO auction_bids (listing_id, league_id, bidder_id, amount, placed_at)
  VALUES (p_listing_id, v_listing.league_id, auth.uid(), p_bid_amount, NOW())
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;
