-- Migration 147: add 'pending_confirmation' to auction_listings status check constraint
-- Migration 145 introduced pending_confirmation as a status but the CHECK
-- constraint was never updated, causing sell_now → resolve_auction_listing to fail.
ALTER TABLE auction_listings DROP CONSTRAINT IF EXISTS auction_listings_status_check;
ALTER TABLE auction_listings ADD CONSTRAINT auction_listings_status_check
  CHECK (status = ANY (ARRAY['open'::text, 'pending_confirmation'::text, 'sold'::text, 'cancelled'::text]));
