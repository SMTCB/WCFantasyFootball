-- ✅ APPLIED TO PRODUCTION 2026-06-28 (TRACKER row 1)
-- ── Migration 209: Coin ledger compliance ──────────────────────────────────────
-- (a) currency default: 'GBP' → 'FRC' (Frontrow Coin — internal virtual token,
--     NOT ISO 4217. Using a real currency code was a compliance gap.)
-- (b) type CHECK: extend with spec-standard aliases wager_placement / wager_win /
--     wager_refund. Existing values kept for backward-compat — both forms valid.
-- (c) credit_coins() default p_currency: 'GBP' → 'FRC'
--
-- ⚠️  DO NOT APPLY from this machine — apply from the Supabase-linked PC only.

-- ── 1. Currency: change column default and add comment ────────────────────────

ALTER TABLE coin_transactions
  ALTER COLUMN currency SET DEFAULT 'FRC';

COMMENT ON COLUMN coin_transactions.currency IS
  'Internal virtual token code. FRC = Frontrow Coin. NOT ISO 4217.';

-- Backfill existing rows that were inserted with the old 'GBP' default.
-- All existing transactions are virtual coins, not real GBP.
UPDATE coin_transactions
  SET currency = 'FRC'
WHERE currency = 'GBP';

-- ── 2. Type CHECK: extend with spec-standard names ────────────────────────────
-- Drop existing and recreate (PostgreSQL does not support ADD VALUE to CHECK).
-- Existing values preserved for backward-compat (any live rows keep their type).

ALTER TABLE coin_transactions
  DROP CONSTRAINT IF EXISTS coin_transactions_type_check;

ALTER TABLE coin_transactions
  ADD CONSTRAINT coin_transactions_type_check
  CHECK (type IN (
    -- original values (keep for backward-compat)
    'purchase', 'stake', 'win', 'loss', 'rake', 'refund', 'admin', 'entry_fee',
    -- spec-standard aliases (P2P checklist compliance)
    'wager_placement',  -- alias for stake
    'wager_win',        -- alias for win
    'wager_refund'      -- alias for refund
  ));

-- ── 3. credit_coins() — update p_currency default from 'GBP' → 'FRC' ─────────
-- Body is identical to migration 208; only the DEFAULT changes.

CREATE OR REPLACE FUNCTION credit_coins(
  p_user_id      uuid,
  p_amount       int,
  p_type         text     DEFAULT 'admin',
  p_challenge_id uuid     DEFAULT NULL,
  p_meta         jsonb    DEFAULT '{}',
  p_currency     char(3)  DEFAULT 'FRC',
  p_reference_id text     DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'AMOUNT_MUST_BE_POSITIVE'; END IF;
  IF p_type NOT IN ('purchase','win','refund','admin') THEN
    RAISE EXCEPTION 'INVALID_CREDIT_TYPE';
  END IF;

  INSERT INTO coin_wallets (user_id, balance)
  VALUES (p_user_id, p_amount)
  ON CONFLICT (user_id) DO UPDATE
    SET balance    = coin_wallets.balance + p_amount,
        updated_at = now();

  INSERT INTO coin_transactions
    (user_id, type, amount, challenge_id, meta, currency, reference_id)
  VALUES
    (p_user_id, p_type, p_amount, p_challenge_id, p_meta, p_currency, p_reference_id);
END;
$$;
REVOKE ALL ON FUNCTION credit_coins(uuid, int, text, uuid, jsonb, char(3), text) FROM public, authenticated, anon;
