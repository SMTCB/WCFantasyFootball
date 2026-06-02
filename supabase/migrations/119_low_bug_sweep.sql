-- Migration 119: Low bug sweep
-- DD-L3: Narrow auction_listings UPDATE policy to seller only (no bids placed)
-- DD-L4: place_bid — block seller self-bidding
-- DD-L5: void_bet — reverse budget for already-credited budget bets
-- DD-L6: auto-close-bets cron — tighten from 6h to hourly
-- DD-M14: sync_cup_eliminations — fix dead status filter ('completed' → 'finished')

-- ─── DD-L3: Auction listings UPDATE policy ────────────────────────────────────
-- Old policy: any authenticated user can UPDATE any listing.
-- New policy: only the seller can update, and only when no bid has been placed yet.
-- place_bid uses SECURITY DEFINER so it bypasses RLS — this doesn't affect bidding.

DROP POLICY IF EXISTS "Authenticated users place bids" ON auction_listings;

CREATE POLICY "Seller can cancel own listing (no bids)"
  ON auction_listings
  FOR UPDATE
  USING (
    seller_id = auth.uid()
    AND (highest_bidder_id IS NULL)
  );

-- ─── DD-L4: place_bid — block seller self-bidding ─────────────────────────────

CREATE OR REPLACE FUNCTION public.place_bid(p_listing_id uuid, p_bid_amount numeric)
RETURNS jsonb
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

  -- DD-L4: seller cannot bid on their own listing
  IF auth.uid() = v_listing.seller_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Cannot bid on your own listing');
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

-- ─── DD-L5: void_bet — reverse budget for already-credited budget bets ─────────

CREATE OR REPLACE FUNCTION public.void_bet(p_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_league_id   UUID;
  v_reward_type TEXT;
  v_status      TEXT;
  v_cleared     INT;
BEGIN
  SELECT league_id, reward_type, status
    INTO v_league_id, v_reward_type, v_status
    FROM bet_instances
   WHERE id = p_instance_id;

  IF v_league_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND');
  END IF;

  -- Caller must be commissioner of this league
  IF NOT EXISTS (
    SELECT 1 FROM league_members
     WHERE league_id = v_league_id
       AND user_id   = auth.uid()
       AND role      = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- DD-L5: if already resolved and reward_type='budget', claw back awarded budget
  IF v_status = 'resolved' AND v_reward_type = 'budget' THEN
    UPDATE squads s
       SET budget_remaining = budget_remaining - bs.reward_awarded
      FROM bet_submissions bs
     WHERE bs.bet_instance_id = p_instance_id
       AND bs.is_correct       = true
       AND bs.reward_awarded   IS NOT NULL
       AND s.id                = bs.squad_id;
  END IF;

  -- Clear all picks: mark as not-correct, remove any reward
  UPDATE bet_submissions
     SET is_correct     = false,
         reward_awarded = NULL
   WHERE bet_instance_id = p_instance_id;

  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  -- Mark the bet cancelled
  UPDATE bet_instances
     SET status = 'cancelled'
   WHERE id = p_instance_id;

  RETURN jsonb_build_object('ok', true, 'submissions_cleared', v_cleared);
END;
$$;

-- ─── DD-L6: auto-close-bets cron — hourly instead of every 6h ────────────────

SELECT cron.alter_job(
  job_id  := (SELECT jobid FROM cron.job WHERE jobname = 'auto-close-bets'),
  schedule := '0 * * * *'
);

-- ─── DD-M14: sync_cup_eliminations — fix dead status filter ──────────────────
-- 'completed' is not a valid match_status enum value (valid: scheduled/live/finished).
-- Replace with 'finished' so clubs with no remaining scheduled/live matches are
-- correctly identified as eliminated.

CREATE OR REPLACE FUNCTION public.sync_cup_eliminations(p_league_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament_id     TEXT;
  v_active_count      INT;
  v_clubs_with_future INT;
  v_eliminated_count  INT := 0;
  rec                 RECORD;
  v_future_count      INT;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;

  SELECT COUNT(*) INTO v_active_count
    FROM cup_active_clubs
   WHERE league_id = p_league_id AND eliminated_at IS NULL;

  IF v_active_count = 0 THEN RETURN 0; END IF;

  -- Safety guard: only run eliminations if at least one active club still has
  -- a scheduled or live match (prevents mass-eliminating on fixture data lag).
  SELECT COUNT(DISTINCT cac.club_id) INTO v_clubs_with_future
    FROM cup_active_clubs cac
   WHERE cac.league_id      = p_league_id
     AND cac.eliminated_at  IS NULL
     AND EXISTS (
       SELECT 1 FROM fixtures f
        WHERE (f.home_team = cac.club_id OR f.away_team = cac.club_id
            OR f.home_team_forza_id::text = cac.club_id
            OR f.away_team_forza_id::text = cac.club_id)
          AND f.status != 'finished'    -- was 'completed' (no such value — DD-M14)
          AND f.kickoff_at > NOW()
          AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id)
     );

  IF v_clubs_with_future = 0 THEN RETURN 0; END IF;

  FOR rec IN
    SELECT cac.club_id FROM cup_active_clubs cac
     WHERE cac.league_id = p_league_id AND cac.eliminated_at IS NULL
  LOOP
    SELECT COUNT(*) INTO v_future_count
      FROM fixtures f
     WHERE (f.home_team = rec.club_id OR f.away_team = rec.club_id
         OR f.home_team_forza_id::text = rec.club_id
         OR f.away_team_forza_id::text = rec.club_id)
       AND f.status != 'finished'    -- was 'completed' (DD-M14)
       AND f.kickoff_at > NOW()
       AND (v_tournament_id IS NULL OR f.tournament_id = v_tournament_id);

    IF v_future_count = 0 THEN
      PERFORM eliminate_cup_club(p_league_id, rec.club_id);
      v_eliminated_count := v_eliminated_count + 1;
    END IF;
  END LOOP;

  RETURN v_eliminated_count;
END;
$$;
