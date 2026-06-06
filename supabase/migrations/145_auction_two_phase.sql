-- Migration 145: Auction two-phase flow (bid → pending_confirmation → confirm)
--
-- Changes:
--   1. auction_listings: add won_at column
--   2. resolve_auction_listing: stop auto-transferring; set pending_confirmation instead
--   3. confirm_auction_win: new RPC — buyer explicitly completes the purchase
--      Guards (in order): window open, squad size, budget, duplicate
--      On success: transfer player + write gazette_entries row (auction_result)
--   4. sweep_void_auction_confirmations: new helper — cancels pending listings
--      where a full transfer-window cycle has elapsed since won_at without confirmation
--   5. process_auction_deadlines: wrapper called by the cron — runs both steps
--   6. Update resolve-expired-auctions cron to call process_auction_deadlines()
--
-- Note: sell_now is unchanged — seller-triggered early resolution stays immediate.

-- ── 1. won_at column ─────────────────────────────────────────────────────────

ALTER TABLE public.auction_listings
  ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ;

-- ── 2. resolve_auction_listing — pending_confirmation instead of transfer ────

CREATE OR REPLACE FUNCTION public.resolve_auction_listing(p_listing_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_listing auction_listings;
BEGIN
  SELECT * INTO v_listing
  FROM auction_listings
  WHERE id = p_listing_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Listing not found or already resolved.');
  END IF;

  -- No bids → cancel as before
  IF v_listing.highest_bidder_id IS NULL THEN
    UPDATE auction_listings SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', true, 'result', 'cancelled');
  END IF;

  -- Has a winner → pending confirmation (buyer must act within the transfer window)
  UPDATE auction_listings
  SET status = 'pending_confirmation', won_at = NOW(), updated_at = NOW()
  WHERE id = p_listing_id;

  RETURN jsonb_build_object('ok', true, 'result', 'pending_confirmation');
END;
$$;

-- ── 3. confirm_auction_win ────────────────────────────────────────────────────

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

  -- Buyer squad
  SELECT * INTO v_buyer FROM squads
  WHERE league_id = v_listing.league_id AND user_id = auth.uid()
    AND (v_matchday_id IS NULL OR matchday_id = v_matchday_id)
  ORDER BY created_at DESC LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE auction_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', false, 'code', 'BUYER_GONE',
      'error', 'Your squad was not found. Purchase cancelled.');
  END IF;

  -- Budget check at confirmation time
  IF v_buyer.budget_remaining < v_listing.current_bid THEN
    UPDATE auction_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
      'error', 'Your budget is no longer sufficient for this purchase. Auction cancelled.');
  END IF;

  -- Duplicate guard
  IF v_listing.player_id = ANY(v_buyer.players) THEN
    UPDATE auction_listings SET status = 'cancelled', updated_at = NOW() WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', false, 'code', 'DUPLICATE',
      'error', 'You already own this player. Purchase cancelled.');
  END IF;

  -- Squad size guard — actionable: tell buyer to sell first, do NOT cancel the listing
  IF COALESCE(array_length(v_buyer.players, 1), 0) >= v_squad_size THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL',
      'error', 'Your squad is full. Sell a player first, then come back to confirm.');
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
    '🔨 ' || COALESCE(v_player_name, 'Player') || ' sold — €' || v_listing.current_bid || 'M',
    jsonb_build_array(
      COALESCE(v_buyer_name,  'Buyer')  || ' signed '   ||
      COALESCE(v_player_name, 'Player') || ' from '     ||
      COALESCE(v_seller_name, 'Seller') || ' for €'     ||
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

-- ── 4. sweep_void_auction_confirmations ──────────────────────────────────────
-- Cancels pending_confirmation listings where a complete transfer-window cycle
-- (open → close) has elapsed since won_at without the buyer confirming.
--
-- Covers two window types:
--   Matchday windows:  a matchday_deadlines row with deadline_at > won_at AND < NOW()
--   Explicit windows:  a transfer_windows row with closes_at > won_at AND < NOW()
--
-- The listing is NOT cancelled if the window is currently open — the buyer still has time.
-- That exclusion is implicit: if the window is currently open, no closes_at < NOW() exists
-- for that window yet, so neither EXISTS subquery matches.

CREATE OR REPLACE FUNCTION public.sweep_void_auction_confirmations()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cancelled INT;
BEGIN
  WITH voided AS (
    UPDATE auction_listings al
    SET status = 'cancelled', updated_at = NOW()
    WHERE al.status = 'pending_confirmation'
      AND (
        -- Matchday-type window closed after the win
        EXISTS (
          SELECT 1
          FROM matchday_deadlines md
          JOIN leagues l ON l.id = al.league_id AND l.tournament_id = md.tournament_id
          WHERE md.deadline_at > al.won_at
            AND md.deadline_at < NOW()
        )
        OR
        -- Explicit transfer window closed after the win
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

-- ── 5. process_auction_deadlines — wrapper for the cron ──────────────────────

CREATE OR REPLACE FUNCTION public.process_auction_deadlines()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_voided INT;
BEGIN
  -- Step 1: open listings past deadline → pending_confirmation (or cancelled if no bids)
  -- (calls the updated resolve_auction_listing for each expired open listing)
  PERFORM public.resolve_auction_listing(id)
  FROM public.auction_listings
  WHERE status = 'open' AND deadline_at < NOW();

  -- Step 2: pending listings whose window has come and gone → cancelled
  v_voided := public.sweep_void_auction_confirmations();

  RETURN 'ok: voided=' || v_voided;
END;
$$;

-- ── 6. Update cron to call process_auction_deadlines ─────────────────────────

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'resolve-expired-auctions'),
  command := $$ SELECT public.process_auction_deadlines(); $$
);
