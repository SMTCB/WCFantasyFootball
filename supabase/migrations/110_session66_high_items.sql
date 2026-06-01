-- 110_session66_high_items.sql
-- Session 66: Fix all open HIGH audit items
--   H2:  place_bid — add FOR UPDATE row locks (race condition fix)
--   H9:  resolve_bet — block resolution of OPEN bets before deadline
--   H12: sync-wc-fixtures — 6h → 30min (live ingest chicken-and-egg fix)
--   H13: calculate-scores-post-match — replace expired anon JWT (exp 2024-08-17) with service-role key
--   H15: leagues UPDATE RLS — allow commissioner role alongside created_by

-- ── H9: resolve_bet — prevent resolving OPEN bets before their deadline ──────────
CREATE OR REPLACE FUNCTION public.resolve_bet(
  p_instance_id UUID,
  p_answer      TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_league_id    UUID;
  v_reward_value NUMERIC;
  v_reward_type  TEXT;
  v_status       TEXT;
  v_deadline_at  TIMESTAMPTZ;
  v_winners      INT;
  v_total        INT;
BEGIN
  SELECT league_id, reward_value, reward_type, status, deadline_at
    INTO v_league_id, v_reward_value, v_reward_type, v_status, v_deadline_at
    FROM bet_instances WHERE id = p_instance_id;

  IF v_league_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND');
  END IF;

  -- Prevent double-resolution (budget bets would double-credit otherwise)
  IF v_status = 'resolved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_RESOLVED');
  END IF;

  -- Prevent resolving open bets before their submission deadline has passed
  IF v_status = 'open' AND v_deadline_at IS NOT NULL AND v_deadline_at > NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_STILL_OPEN');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM league_members
     WHERE league_id = v_league_id
       AND user_id   = auth.uid()
       AND role      = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE answer = p_answer)
    INTO v_total, v_winners
    FROM bet_submissions WHERE bet_instance_id = p_instance_id;

  UPDATE bet_submissions
     SET is_correct     = (answer = p_answer),
         reward_awarded = CASE WHEN answer = p_answer THEN v_reward_value ELSE NULL END
   WHERE bet_instance_id = p_instance_id;

  IF v_reward_type = 'budget' THEN
    UPDATE squads
       SET budget_remaining = budget_remaining + v_reward_value
     WHERE id IN (
       SELECT squad_id FROM bet_submissions
        WHERE bet_instance_id = p_instance_id AND answer = p_answer
     );
  END IF;

  UPDATE bet_instances
     SET status            = 'resolved',
         correct_answer    = p_answer,
         winners_count     = v_winners,
         total_submissions = v_total
   WHERE id = p_instance_id;

  RETURN jsonb_build_object('ok', true, 'winners', v_winners, 'total', v_total,
                             'submissions_updated', v_total);
END;
$$;

-- ── H2: place_bid — add FOR UPDATE locks to prevent race conditions ────────────
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

  IF v_budget < p_bid_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Insufficient budget');
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

-- ── H15: leagues UPDATE RLS — allow commissioner role, not just created_by ──────
-- The existing "leagues: creator update" policy only allows the original creator.
-- Co-commissioners can see the full admin panel but their changes silently fail RLS.
-- Adding a second UPDATE policy that covers any league_member with role='commissioner'.
DROP POLICY IF EXISTS "leagues: commissioner update" ON public.leagues;
CREATE POLICY "leagues: commissioner update"
  ON public.leagues FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.league_members
       WHERE league_id = leagues.id
         AND user_id   = auth.uid()
         AND role      = 'commissioner'
    )
  );

-- ── H12: sync-wc-fixtures — bump from 6h to 30min ────────────────────────────
-- Fixes live ingest chicken-and-egg: status only flipped to 'live' by sync-fixtures.
-- On 6h schedule a match could run its full 90 min before ingest ever starts.
-- 30min ensures status flips within 30 min of kickoff at worst.
SELECT cron.unschedule('sync-wc-fixtures-6h');
SELECT cron.schedule(
  'sync-wc-fixtures-30m',
  '*/30 * * * *',
  $cmd$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-fixtures',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
      ),
      body    := jsonb_build_object('forza_id', '429')
    );
  $cmd$
);

-- ── H13: calculate-scores-post-match — replace expired anon JWT ───────────────
-- The expired token (exp: 2024-08-17) works only because verify_jwt=false.
-- One dashboard toggle would cause a silent scoring outage. Use service-role key.
SELECT cron.unschedule('calculate-scores-post-match');
SELECT cron.schedule(
  'calculate-scores-post-match',
  '30 22 * * *',
  $cmd$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/calculate-scores',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
      ),
      body    := jsonb_build_object('fixture_id', f.id)
    )
    FROM fixtures f
    WHERE f.status = 'finished'
      AND f.kickoff_at > NOW() - INTERVAL '24 hours';
  $cmd$
);
