-- Fix: auction cancel RLS policy compared seller_id (squad UUID) against auth.uid() (user UUID)
-- These never match, silently blocking all cancel attempts.
-- Align with the INSERT policy pattern: join through squads to verify ownership.

DROP POLICY IF EXISTS "Seller can cancel own listing (no bids)" ON auction_listings;

CREATE POLICY "Seller can cancel own listing (no bids)" ON auction_listings
  FOR UPDATE USING (
    (EXISTS (
      SELECT 1 FROM squads s
      WHERE s.id = auction_listings.seller_id
        AND s.user_id = auth.uid()
    ))
    AND (highest_bidder_id IS NULL)
  );
