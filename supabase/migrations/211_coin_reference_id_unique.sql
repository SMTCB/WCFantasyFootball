-- Migration 211: UNIQUE constraint on coin_transactions.reference_id (MONEY-1)
--
-- Problem: Migration 208 added a regular index on reference_id but not a UNIQUE
-- constraint. The idempotency guard in purchase-coins uses SELECT + INSERT, which
-- has a TOCTOU race: two concurrent webhook deliveries for the same payment_intent
-- could both pass the SELECT check before either commits the INSERT, resulting in
-- double coin credits.
--
-- Fix: Replace the non-unique index with a UNIQUE constraint. PostgreSQL treats
-- multiple NULL values as distinct, so rows without a reference_id (gifts, admin
-- grants) are unaffected. Stripe payment_intent IDs (pi_...) are always non-null
-- and guaranteed unique by Stripe.
--
-- ⚠️  APPLY FROM SUPABASE-LINKED PC:
--   npx supabase db query --linked < supabase/migrations/211_coin_reference_id_unique.sql

-- Drop the non-unique index from migration 208 (superseded by the constraint below)
DROP INDEX IF EXISTS coin_txn_reference_id_idx;

-- Add UNIQUE constraint — NULLs are treated as distinct so multiple NULL rows are allowed
ALTER TABLE coin_transactions
  DROP CONSTRAINT IF EXISTS coin_transactions_reference_id_unique;

ALTER TABLE coin_transactions
  ADD CONSTRAINT coin_transactions_reference_id_unique UNIQUE (reference_id);
