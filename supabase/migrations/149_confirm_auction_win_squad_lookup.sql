-- Migration 149: fix confirm_auction_win buyer squad lookup
--
-- Bug: the function resolved the next upcoming matchday_id (e.g. '623-r3')
-- then filtered squads by matchday_id = '623-r3'. All squads in the test
-- league still had matchday_id = '623-r1' (squads only advance on transfer),
-- so the query returned NOT FOUND → BUYER_GONE → listing cancelled on the
-- very first confirm click.
--
-- Fix: drop the matchday_id filter on the buyer squad lookup entirely.
-- Auction confirmation just needs the user's most recent squad in the league;
-- which matchday it was created for is irrelevant.
-- The v_matchday_id variable is still used for the seller squad lookup
-- (unchanged) so we keep it for that path.

CREATE OR REPLACE FUNCTION public.confirm_auction_win(p_listing_id uuid)
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

  -- Resolve tournament for seller squad lookup (kept for context)
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

  -- Buyer squad — use most recent squad in the league; do NOT filter by
  -- matchday_id (squads only advance their matchday on transfer, so a buyer
  -- whose last transfer was in r1 still has matchday_id='623-r1' even when
  -- the next deadline is r3 — the old filter caused BUYER_GONE every time).
  SELECT * INTO v_buyer FROM squads
  WHERE league_id = v_listing.league_id AND user_id = auth.uid()
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
