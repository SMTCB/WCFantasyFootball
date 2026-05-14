-- Migration 18: Fix auction_listings.seller_id FK
-- The seller_id column was referencing auth.users(id) but the application
-- inserts a squad UUID (from squads.id). Fix the FK to reference squads(id).

ALTER TABLE public.auction_listings
  DROP CONSTRAINT auction_listings_seller_id_fkey;

ALTER TABLE public.auction_listings
  ADD CONSTRAINT auction_listings_seller_id_fkey
  FOREIGN KEY (seller_id) REFERENCES public.squads(id) ON DELETE CASCADE;

-- Also update the INSERT RLS policy to be consistent (seller_id = squad id owned by auth.uid())
DROP POLICY IF EXISTS "Squad owners can list players for auction" ON public.auction_listings;

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
