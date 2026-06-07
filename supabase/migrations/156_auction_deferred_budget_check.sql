-- 156_auction_deferred_budget_check.sql
--
-- Change auction flow so budget is only validated at confirmation, not at bid time.
--
-- Desired flow:
--   1. place_bid   — no budget check; any amount can be proposed
--   2. deadline    — resolve_auction_listing → pending_confirmation (unchanged)
--   3. confirm_auction_win — budget + squad size checked HERE
--      Both INSUFFICIENT_BUDGET and SQUAD_FULL are now actionable:
--      listing stays pending_confirmation so buyer can sell players / free budget and retry.
--
-- Changes:
--   A. place_bid: remove the v_reserved / v_available budget guard
--   B. confirm_auction_win: change INSUFFICIENT_BUDGET from cancel → actionable

-- ── A. place_bid — drop budget reservation check ─────────────────────────────

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

  -- Verify bidder has a squad in this league (no self-bid still enforced by caller context)
  SELECT id INTO v_squad_id
  FROM squads
  WHERE league_id = v_listing.league_id
    AND user_id   = auth.uid()
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_squad_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  -- Self-bid guard (seller cannot bid on their own listing)
  IF v_listing.seller_id = v_squad_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot bid on your own listing');
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

-- ── B. confirm_auction_win — INSUFFICIENT_BUDGET is now actionable ────────────

CREATE OR REPLACE FUNCTION public.confirm_auction_win(p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_listing      auction_listings;
  v_seller       squads;
  v_buyer        squads;
  v_tournament   TEXT;
  v_matchday_id  TEXT;
  v_squad_size   INT;
  v_window       JSON;
  v_player_name  TEXT;
  v_buyer_name   TEXT;
  v_seller_name  TEXT;
BEGIN
  -- Lock listing
  SELECT * INTO v_listing
  FROM auction_listings
  WHERE id = p_listing_id AND status = 'pending_confirmation'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction not found or not awaiting confirmation.');
  END IF;

  -- Only the winning bidder can confirm
  IF v_listing.highest_bidder_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED',
      'error', 'Only the winning bidder can confirm this purchase.');
  END IF;

  -- Transfer window must be open
  SELECT get_transfer_window_status(v_listing.league_id) INTO v_window;
  IF (v_window->>'status') <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WINDOW_CLOSED',
      'error', 'The transfer window is not open. Come back when it opens to confirm.');
  END IF;

  -- League squad size cap
  SELECT COALESCE(squad_size, 15) INTO v_squad_size
  FROM leagues WHERE id = v_listing.league_id;

  -- Resolve active matchday_id for correct squad row in per-round leagues
  SELECT l.tournament_id INTO v_tournament
  FROM leagues l WHERE l.id = v_listing.league_id;

  IF v_tournament IS NOT NULL THEN
    SELECT matchday_id INTO v_matchday_id
    FROM matchday_deadlines
    WHERE tournament_id = v_tournament AND deadline_at >= NOW()
    ORDER BY deadline_at ASC LIMIT 1;
  END IF;

  -- Seller squad
  SELECT * INTO v_seller FROM squads WHERE id = v_listing.seller_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE auction_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', false, 'code', 'SELLER_GONE',
      'error', 'Seller squad no longer exists. Purchase cancelled.');
  END IF;

  -- Buyer squad (migration 149: no matchday_id filter)
  SELECT * INTO v_buyer FROM squads
  WHERE league_id = v_listing.league_id AND user_id = auth.uid()
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE auction_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', false, 'code', 'BUYER_GONE',
      'error', 'Your squad was not found. Purchase cancelled.');
  END IF;

  -- Squad size guard — actionable: sell a player first, listing stays pending_confirmation
  IF COALESCE(array_length(v_buyer.players, 1), 0) >= v_squad_size THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL',
      'error', 'Your squad is full. Sell a player first, then come back to confirm.');
  END IF;

  -- Budget guard — actionable: free up budget first, listing stays pending_confirmation
  IF v_buyer.budget_remaining < v_listing.current_bid THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
      'error', 'Not enough budget. Sell a player to free up funds, then confirm again.',
      'required', v_listing.current_bid,
      'available', v_buyer.budget_remaining);
  END IF;

  -- Duplicate guard (cancel — owning the player is a permanent state)
  IF v_listing.player_id = ANY(v_buyer.players) THEN
    UPDATE auction_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', false, 'code', 'DUPLICATE',
      'error', 'You already own this player. Purchase cancelled.');
  END IF;

  -- ── Execute transfer ──────────────────────────────────────────────────────

  UPDATE squads
  SET players          = array_remove(players, v_listing.player_id),
      budget_remaining = budget_remaining + v_listing.current_bid
  WHERE id = v_seller.id;

  UPDATE squads
  SET players          = array_append(players, v_listing.player_id),
      budget_remaining = budget_remaining - v_listing.current_bid
  WHERE id = v_buyer.id;

  UPDATE auction_listings SET status = 'sold', updated_at = NOW()
  WHERE id = p_listing_id;

  -- ── Gazette entry (auction_result) ────────────────────────────────────────

  SELECT name INTO v_player_name FROM players WHERE id = v_listing.player_id;
  SELECT username INTO v_buyer_name  FROM users WHERE id = auth.uid();
  SELECT username INTO v_seller_name FROM users WHERE id = v_seller.user_id;

  INSERT INTO gazette_entries (
    league_id, entry_type, headline, bullets, full_data, published_at
  ) VALUES (
    v_listing.league_id,
    'auction_result',
    chr(128296) || ' ' || COALESCE(v_player_name, 'Player') || ' sold ' || chr(8212) || ' ' || chr(8364) || v_listing.current_bid || 'M',
    jsonb_build_array(
      COALESCE(v_buyer_name,  'Buyer')  || ' signed '   ||
      COALESCE(v_player_name, 'Player') || ' from '     ||
      COALESCE(v_seller_name, 'Seller') || ' for ' || chr(8364) ||
      v_listing.current_bid || 'M'
    ),
    jsonb_build_object(
      'player_id',   v_listing.player_id,
      'player_name', v_player_name,
      'buyer_id',    v_buyer.id,
      'buyer_name',  v_buyer_name,
      'seller_id',   v_listing.seller_id,
      'seller_name', v_seller_name,
      'amount',      v_listing.current_bid
    ),
    NOW()
  );

  RETURN jsonb_build_object(
    'ok',        true,
    'result',    'sold',
    'amount',    v_listing.current_bid,
    'player_id', v_listing.player_id
  );
END;
$$;
