-- AUDIT-57-04: place_bid had no server-side budget check. A manager could bid
--   beyond their budget; if they won, resolve_auction_listing would fail and
--   the listing would get stuck (AUDIT-57-05).
-- AUDIT-57-05: resolve_auction_listing returned ok:false on insufficient buyer
--   budget but never updated status, leaving the listing stuck 'open' forever.
-- AUDIT-57-07: resolve_auction_listing fetched buyer's squad with
--   ORDER BY created_at DESC — wrong in per-matchday leagues where each round
--   creates a new squad row. Fix: resolve active matchday_id first.

-- ── AUDIT-57-04: place_bid with budget guard ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.place_bid(p_listing_id uuid, p_bid_amount numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_listing    auction_listings;
  v_min_bid    NUMERIC;
  v_squad_id   UUID;
  v_budget     NUMERIC;
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

  -- Budget check: caller must have enough in their squad for this league
  SELECT id, budget_remaining
    INTO v_squad_id, v_budget
    FROM squads
   WHERE league_id = v_listing.league_id
     AND user_id   = auth.uid()
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_squad_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF v_budget < p_bid_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient budget');
  END IF;

  -- Update current bid + highest bidder on the listing
  UPDATE auction_listings
  SET current_bid        = p_bid_amount,
      highest_bidder_id  = auth.uid(),
      updated_at         = NOW()
  WHERE id = p_listing_id;

  -- Upsert bid history (one row per bidder per listing, always their latest bid)
  INSERT INTO auction_bids (listing_id, league_id, bidder_id, amount, placed_at)
  VALUES (p_listing_id, v_listing.league_id, auth.uid(), p_bid_amount, NOW())
  ON CONFLICT (listing_id, bidder_id)
    DO UPDATE SET amount = EXCLUDED.amount, placed_at = EXCLUDED.placed_at;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── AUDIT-57-05 + AUDIT-57-07: resolve_auction_listing fixes ─────────────────
CREATE OR REPLACE FUNCTION public.resolve_auction_listing(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing      auction_listings;
  v_seller       squads;
  v_buyer        squads;
  v_tournament   TEXT;
  v_matchday_id  TEXT;
BEGIN
  -- Lock the listing row to prevent concurrent resolution
  SELECT * INTO v_listing
  FROM auction_listings
  WHERE id = p_listing_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Listing not found or already resolved.');
  END IF;

  -- No bids placed — cancel the listing
  IF v_listing.highest_bidder_id IS NULL THEN
    UPDATE auction_listings
      SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', true, 'result', 'cancelled');
  END IF;

  -- AUDIT-57-07: resolve the active matchday_id for this league so we target
  -- the correct squad row in per-matchday leagues (each round creates a new row).
  SELECT l.tournament_id INTO v_tournament
    FROM leagues l WHERE l.id = v_listing.league_id;

  IF v_tournament IS NOT NULL THEN
    SELECT matchday_id INTO v_matchday_id
      FROM matchday_deadlines
     WHERE tournament_id = v_tournament
       AND deadline_at   >= NOW()
     ORDER BY deadline_at ASC
     LIMIT 1;
  END IF;

  -- Fetch seller squad (seller_id is a squad UUID — already precise)
  SELECT * INTO v_seller FROM squads WHERE id = v_listing.seller_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Seller squad not found.');
  END IF;

  -- Fetch buyer's squad, using matchday filter when available
  SELECT * INTO v_buyer
  FROM squads
  WHERE league_id = v_listing.league_id
    AND user_id   = v_listing.highest_bidder_id
    AND (v_matchday_id IS NULL OR matchday_id = v_matchday_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Buyer no longer has a squad — cancel gracefully
    UPDATE auction_listings
      SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', true, 'result', 'cancelled', 'reason', 'Buyer squad not found.');
  END IF;

  -- Verify buyer has enough budget
  -- AUDIT-57-05: if budget check fails, cancel the listing instead of leaving it stuck
  IF v_buyer.budget_remaining < v_listing.current_bid THEN
    UPDATE auction_listings
      SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', true, 'result', 'cancelled',
                              'reason', 'Buyer has insufficient budget.');
  END IF;

  -- Transfer player: remove from seller's squad
  UPDATE squads
    SET players = array_remove(players, v_listing.player_id),
        budget_remaining = budget_remaining + v_listing.current_bid
  WHERE id = v_seller.id;

  -- Transfer player: add to buyer's squad
  UPDATE squads
    SET players = array_append(players, v_listing.player_id),
        budget_remaining = budget_remaining - v_listing.current_bid
  WHERE id = v_buyer.id;

  -- Mark listing as sold
  UPDATE auction_listings
    SET status = 'sold', updated_at = NOW()
  WHERE id = p_listing_id;

  RETURN jsonb_build_object(
    'ok',     true,
    'result', 'sold',
    'amount', v_listing.current_bid,
    'player', v_listing.player_id
  );
END;
$$;
