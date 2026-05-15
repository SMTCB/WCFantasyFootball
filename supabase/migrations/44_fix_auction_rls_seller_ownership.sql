-- Migration 44: Fix auction RLS — enforce seller owns the squad they're listing from
--
-- The original "seller creates auction" policy (migration 27) only verified league
-- membership, allowing any league member to create an auction for ANY squad in that
-- league. Migrations 38 & 39 attempted a fix but referenced the wrong column name
-- (seller_id vs seller_squad_id), so the check was never applied in production.
--
-- This migration drops all old INSERT policies and replaces them with a single
-- correct policy: the seller must own the squad AND be a member of the league.

-- Drop all existing INSERT policies on auction_listings
DROP POLICY IF EXISTS "seller creates auction"                    ON auction_listings;
DROP POLICY IF EXISTS "Squad owners can list players for auction" ON auction_listings;

-- New policy: seller must own the squad AND be a league member
CREATE POLICY "seller owns squad and is league member"
  ON auction_listings FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM squads s
      WHERE s.id        = auction_listings.seller_squad_id
        AND s.user_id   = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = auction_listings.league_id
        AND lm.user_id   = auth.uid()
    )
  );
