-- ── Migration 208: coin_transactions schema v2 ───────────────────────────────
-- Adds three columns missing from the original 202_ schema:
--   status       — lifecycle state (pending → completed | failed | reversed)
--   currency     — ISO 4217 code; all current transactions are GBP
--   reference_id — external key (Stripe payment_intent_id, etc.) promoted from
--                  meta JSONB to an indexed column for fast idempotency lookups

-- ── 1. Add columns ────────────────────────────────────────────────────────────

ALTER TABLE coin_transactions
  ADD COLUMN IF NOT EXISTS status
    text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('pending','completed','failed','reversed')),
  ADD COLUMN IF NOT EXISTS currency
    char(3) NOT NULL DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS reference_id
    text;

-- ── 2. Index for idempotency lookups (purchase-coins webhook dedup) ───────────

CREATE INDEX IF NOT EXISTS coin_txn_reference_id_idx
  ON coin_transactions(reference_id)
  WHERE reference_id IS NOT NULL;

-- ── 3. Backfill reference_id from meta for existing Stripe purchase rows ──────

UPDATE coin_transactions
SET reference_id = meta->>'stripe_payment_intent_id'
WHERE type = 'purchase'
  AND (meta->>'stripe_payment_intent_id') IS NOT NULL
  AND reference_id IS NULL;

-- ── 4. credit_coins() — add p_currency and p_reference_id params ──────────────
-- Backward-compatible: both params default to GBP / NULL so existing callers
-- (debit_coins_to_escrow, release_escrow, admin_grant_coins, welcome trigger)
-- continue to work without change.

CREATE OR REPLACE FUNCTION credit_coins(
  p_user_id      uuid,
  p_amount       int,
  p_type         text     DEFAULT 'admin',
  p_challenge_id uuid     DEFAULT NULL,
  p_meta         jsonb    DEFAULT '{}',
  p_currency     char(3)  DEFAULT 'GBP',
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
REVOKE ALL ON FUNCTION credit_coins FROM public, authenticated, anon;

-- ── 5. get_my_wallet() — include new columns in transaction rows ───────────────

CREATE OR REPLACE FUNCTION get_my_wallet()
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_wallet  coin_wallets;
  v_txns    json;
BEGIN
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = auth.uid();

  IF NOT FOUND THEN
    RETURN json_build_object('balance', 0, 'escrow', 0, 'transactions', '[]'::json);
  END IF;

  SELECT json_agg(t ORDER BY t.created_at DESC) INTO v_txns
  FROM (
    SELECT type, amount, status, currency, reference_id, challenge_id, meta, created_at
    FROM coin_transactions
    WHERE user_id = auth.uid()
    ORDER BY created_at DESC
    LIMIT 50
  ) t;

  RETURN json_build_object(
    'balance',      v_wallet.balance,
    'escrow',       v_wallet.escrow,
    'transactions', COALESCE(v_txns, '[]'::json)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION get_my_wallet TO authenticated;
