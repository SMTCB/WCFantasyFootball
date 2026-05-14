-- Migration 36: Auction resolution — auto-settle expired listings + seller "Sell Now"
--
-- Creates:
--   resolve_auction_listing(uuid) — transfers player, adjusts budgets, marks sold/cancelled
--   sell_now(uuid)                — seller-triggered early resolution (SECURITY DEFINER, checks ownership)
--   pgcron job                    — runs every 5 minutes to auto-resolve expired listings

-- ── Core resolution function ──────────────────────────────────────────────────
-- Called by both the cron job and sell_now().
-- Caller is responsible for ensuring the listing is eligible.
CREATE OR REPLACE FUNCTION public.resolve_auction_listing(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing  auction_listings;
  v_seller   squads;
  v_buyer    squads;
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

  -- Fetch seller squad (seller_id is a squad UUID)
  SELECT * INTO v_seller FROM squads WHERE id = v_listing.seller_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Seller squad not found.');
  END IF;

  -- Fetch buyer's squad in this league (highest_bidder_id is auth.uid())
  SELECT * INTO v_buyer
  FROM squads
  WHERE league_id = v_listing.league_id
    AND user_id   = v_listing.highest_bidder_id
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
  IF v_buyer.budget_remaining < v_listing.current_bid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Buyer has insufficient budget.');
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

-- ── sell_now RPC (called by seller via client) ────────────────────────────────
-- Validates that the caller owns the seller squad, then delegates to resolve_auction_listing.
CREATE OR REPLACE FUNCTION public.sell_now(p_listing_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_listing auction_listings;
BEGIN
  SELECT * INTO v_listing FROM auction_listings WHERE id = p_listing_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Listing not found.');
  END IF;

  IF v_listing.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction is not open.');
  END IF;

  -- Caller must own the seller squad
  IF NOT EXISTS (
    SELECT 1 FROM squads WHERE id = v_listing.seller_id AND user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authorised — you are not the seller.');
  END IF;

  IF v_listing.highest_bidder_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No bids yet — nothing to sell.');
  END IF;

  RETURN public.resolve_auction_listing(p_listing_id);
END;
$$;

-- ── pgcron: auto-resolve expired listings every 5 minutes ────────────────────
-- Requires pg_cron extension (already enabled on Supabase).
SELECT cron.unschedule('resolve-expired-auctions')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'resolve-expired-auctions'
);

SELECT cron.schedule(
  'resolve-expired-auctions',
  '*/5 * * * *',
  $$
    SELECT public.resolve_auction_listing(id)
    FROM public.auction_listings
    WHERE status = 'open' AND deadline_at < NOW();
  $$
);
