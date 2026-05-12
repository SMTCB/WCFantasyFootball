-- #013: In-League Player Auction System
-- Managers list players for auction within their league.
-- Others bid using budget. Time-boxed to transfer windows.

CREATE TABLE IF NOT EXISTS auction_listings (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  seller_squad_id UUID        NOT NULL REFERENCES squads(id)  ON DELETE CASCADE,
  player_id       UUID        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  min_bid         NUMERIC(6,2) NOT NULL DEFAULT 0,       -- minimum opening bid (£M)
  current_bid     NUMERIC(6,2),                           -- null until first bid
  bidder_squad_id UUID        REFERENCES squads(id),     -- squad with winning bid
  ends_at         TIMESTAMPTZ NOT NULL,                   -- auction close time
  status          TEXT        NOT NULL DEFAULT 'active'   -- active | sold | unsold | cancelled
                  CHECK (status IN ('active','sold','unsold','cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active listing per player per league at a time
CREATE UNIQUE INDEX IF NOT EXISTS auction_listings_active_unique
  ON auction_listings (league_id, player_id)
  WHERE status = 'active';

-- ── RLS ────────────────────────────────────────────────────────────────────────
ALTER TABLE auction_listings ENABLE ROW LEVEL SECURITY;

-- League members can view all active auctions in their league
CREATE POLICY "league members view auctions"
  ON auction_listings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = auction_listings.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- Sellers can create listings (must be a member of that league)
CREATE POLICY "seller creates auction"
  ON auction_listings FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = auction_listings.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- Only the system (service role) updates auctions (bids, resolution)
-- Regular updates go through the place_bid RPC below
CREATE POLICY "members can bid on auctions"
  ON auction_listings FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = auction_listings.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- ── place_bid RPC ──────────────────────────────────────────────────────────────
-- Called by the client to place a bid. Validates:
--   1. Auction is still active and not expired
--   2. Bidder is not the seller
--   3. Bid is higher than current_bid (or ≥ min_bid if no bids yet)
--   4. Bidder has enough budget_remaining in their squad
CREATE OR REPLACE FUNCTION place_bid(
  p_auction_id    UUID,
  p_bidder_squad  UUID,
  p_amount        NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_auction   auction_listings;
  v_squad     squads;
  v_min       NUMERIC;
BEGIN
  -- Lock the auction row
  SELECT * INTO v_auction FROM auction_listings
  WHERE id = p_auction_id AND status = 'active'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction not found or already closed.');
  END IF;

  IF v_auction.ends_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Auction has already ended.');
  END IF;

  IF v_auction.seller_squad_id = p_bidder_squad THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You cannot bid on your own auction.');
  END IF;

  v_min := COALESCE(v_auction.current_bid, v_auction.min_bid - 0.1);
  IF p_amount <= v_min THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Bid must be higher than current bid of £' || COALESCE(v_auction.current_bid, v_auction.min_bid)::TEXT || 'M.'
    );
  END IF;

  -- Check bidder has enough budget
  SELECT * INTO v_squad FROM squads WHERE id = p_bidder_squad;
  IF v_squad.budget_remaining < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient budget for this bid.');
  END IF;

  -- Place the bid
  UPDATE auction_listings
  SET current_bid = p_amount, bidder_squad_id = p_bidder_squad
  WHERE id = p_auction_id;

  RETURN jsonb_build_object('ok', true, 'new_bid', p_amount);
END;
$$;
