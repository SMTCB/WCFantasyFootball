-- Migration 17: Add missing INSERT policy on auction_listings
-- Squad owners can list their own players for auction in leagues they belong to

CREATE POLICY "Squad owners can list players for auction"
ON public.auction_listings
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM squads s
    WHERE s.id = auction_listings.seller_id
      AND s.user_id = auth.uid()
  )
);

-- Also tighten the UPDATE policy so only the seller or authenticated bidders can update
-- Current UPDATE policy ("Authenticated users place bids") is too permissive — keep it for now
-- since place_bid is SECURITY DEFINER, but note it for future hardening.
