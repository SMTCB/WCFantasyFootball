-- Migration 112: auction squad constraints (DD-M7) + chip deadline check (DD-M11)
--
-- DD-M7: resolve_auction_listing had no squad size or duplicate guards.
--        A buyer could win a 16th player or a player they already own.
--
-- DD-M11: activate_chip had no matchday deadline check.
--         A manager could activate Triple Captain after a match started.

-- ── DD-M7: resolve_auction_listing — add size + duplicate guards ──────────────

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
  v_squad_size   INT;
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

  -- Load league squad size cap (default 15)
  SELECT COALESCE(squad_size, 15) INTO v_squad_size
  FROM leagues WHERE id = v_listing.league_id;

  -- AUDIT-57-07: resolve the active matchday_id for this league's tournament
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

  -- Fetch seller squad
  SELECT * INTO v_seller FROM squads WHERE id = v_listing.seller_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Seller squad not found.');
  END IF;

  -- Fetch buyer's squad
  SELECT * INTO v_buyer
  FROM squads
  WHERE league_id = v_listing.league_id
    AND user_id   = v_listing.highest_bidder_id
    AND (v_matchday_id IS NULL OR matchday_id = v_matchday_id)
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE auction_listings
      SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', true, 'result', 'cancelled', 'reason', 'Buyer squad not found.');
  END IF;

  -- Verify buyer has enough budget
  IF v_buyer.budget_remaining < v_listing.current_bid THEN
    UPDATE auction_listings
      SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', true, 'result', 'cancelled',
                              'reason', 'Buyer has insufficient budget.');
  END IF;

  -- DD-M7: duplicate guard — buyer already owns this player
  IF v_listing.player_id = ANY(v_buyer.players) THEN
    UPDATE auction_listings
      SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', true, 'result', 'cancelled',
                              'reason', 'Buyer already owns this player.');
  END IF;

  -- DD-M7: squad size guard — buyer's squad is already at capacity
  IF COALESCE(array_length(v_buyer.players, 1), 0) >= v_squad_size THEN
    UPDATE auction_listings
      SET status = 'cancelled', updated_at = NOW()
    WHERE id = p_listing_id;
    RETURN jsonb_build_object('ok', true, 'result', 'cancelled',
                              'reason', 'Buyer squad is full.');
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
    'buyer',  v_listing.highest_bidder_id
  );
END;
$$;

-- ── DD-M11: activate_chip — add matchday deadline check ──────────────────────

CREATE OR REPLACE FUNCTION public.activate_chip(
  p_user_id   uuid,
  p_league_id uuid,
  p_chip_type text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_squad      record;
  v_cur_val    boolean;
  v_db_field   text;
BEGIN
  -- Map chip type to column name
  CASE p_chip_type
    WHEN 'wildcard'       THEN v_db_field := 'is_wildcard';
    WHEN 'triple_captain' THEN v_db_field := 'is_triple_captain';
    ELSE RETURN jsonb_build_object('ok', false, 'error', 'Unknown chip type: ' || p_chip_type);
  END CASE;

  -- Load the squad
  SELECT * INTO v_squad
  FROM squads
  WHERE user_id = p_user_id AND league_id = p_league_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  -- DD-M11: deadline check — cannot activate after matchday deadline
  IF v_squad.matchday_id IS NOT NULL AND v_squad.matchday_id <> 'active' THEN
    IF EXISTS (
      SELECT 1 FROM matchday_deadlines
      WHERE matchday_id = v_squad.matchday_id
        AND deadline_at < NOW()
    ) THEN
      RETURN jsonb_build_object(
        'ok',    false,
        'code',  'DEADLINE_PASSED',
        'error', 'Matchday deadline has passed — chips cannot be changed.'
      );
    END IF;
  END IF;

  -- Resolve current value
  v_cur_val := CASE p_chip_type
    WHEN 'wildcard'       THEN v_squad.is_wildcard
    WHEN 'triple_captain' THEN v_squad.is_triple_captain
  END;

  -- Activating path
  IF NOT v_cur_val THEN
    -- Season-level guard: chip already used in a previous matchday?
    IF EXISTS (
      SELECT 1 FROM chips_used
      WHERE user_id   = p_user_id
        AND league_id = p_league_id
        AND chip_type = p_chip_type
        AND matchday_id <> v_squad.matchday_id
    ) THEN
      RETURN jsonb_build_object(
        'ok',    false,
        'code',  'CHIP_ALREADY_USED',
        'error', 'This chip has already been used this season'
      );
    END IF;

    -- Record first-use
    INSERT INTO chips_used (user_id, league_id, chip_type, matchday_id)
    VALUES (p_user_id, p_league_id, p_chip_type, v_squad.matchday_id)
    ON CONFLICT (user_id, league_id, chip_type) DO UPDATE
      SET matchday_id = excluded.matchday_id, used_at = now();
  END IF;

  -- Toggle the flag
  EXECUTE format(
    'UPDATE squads SET %I = $1 WHERE id = $2',
    v_db_field
  ) USING (NOT v_cur_val), v_squad.id;

  RETURN jsonb_build_object('ok', true, 'active', NOT v_cur_val);
END;
$$;
