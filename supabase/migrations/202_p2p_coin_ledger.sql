-- ── Migration 202: P2P Coin Ledger (Sprint P2P-1) ─────────────────────────────
-- coin_wallets, coin_transactions, guard trigger, 6 RPCs, seed 500-coin welcome bonus

-- ── 1. coin_wallets ───────────────────────────────────────────────────────────

CREATE TABLE coin_wallets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance    int         NOT NULL DEFAULT 0 CHECK (balance >= 0),
  escrow     int         NOT NULL DEFAULT 0 CHECK (escrow >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coin_wallets ENABLE ROW LEVEL SECURITY;

-- Users may only read their own wallet; all writes go through SECURITY DEFINER RPCs
CREATE POLICY "coin_wallets_own_read" ON coin_wallets
  FOR SELECT USING (auth.uid() = user_id);

-- ── 2. coin_transactions (append-only ledger) ─────────────────────────────────

CREATE TABLE coin_transactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type         text        NOT NULL CHECK (type IN ('purchase','stake','win','loss','rake','refund','admin')),
  amount       int         NOT NULL,
  challenge_id uuid,       -- FK to p2p_challenges added in Sprint P2P-3 migration
  meta         jsonb       NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;

-- Users may only read their own transactions; no direct INSERT
CREATE POLICY "coin_transactions_own_read" ON coin_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- ── 3. Guard trigger — block direct client writes to coin_wallets ─────────────
-- SECURITY DEFINER RPCs run as owner (postgres) → current_user = 'postgres' → allowed.
-- Direct PostgREST calls run as 'authenticated' or 'anon' → blocked.

CREATE OR REPLACE FUNCTION guard_coin_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'DIRECT_WRITE_BLOCKED: coin balance can only change via credit_coins() / debit_coins_to_escrow() RPCs';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_coin_wallets
  BEFORE INSERT OR UPDATE OR DELETE ON coin_wallets
  FOR EACH ROW EXECUTE FUNCTION guard_coin_columns();

-- ── 4. credit_coins() — add coins to a user's balance ────────────────────────
-- Used by: purchase (Stripe webhook), win resolution, admin grant, welcome bonus.

CREATE OR REPLACE FUNCTION credit_coins(
  p_user_id    uuid,
  p_amount     int,
  p_type       text    DEFAULT 'admin',
  p_challenge_id uuid  DEFAULT NULL,
  p_meta       jsonb   DEFAULT '{}'
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

  INSERT INTO coin_transactions (user_id, type, amount, challenge_id, meta)
  VALUES (p_user_id, p_type, p_amount, p_challenge_id, p_meta);
END;
$$;
REVOKE ALL ON FUNCTION credit_coins FROM public, authenticated, anon;

-- ── 5. debit_coins_to_escrow() — lock stake coins when creating/accepting a challenge

CREATE OR REPLACE FUNCTION debit_coins_to_escrow(
  p_user_id     uuid,
  p_amount      int,
  p_challenge_id uuid DEFAULT NULL,
  p_meta        jsonb DEFAULT '{}'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance     int;
  v_daily_staked int;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'AMOUNT_MUST_BE_POSITIVE'; END IF;

  -- Lock row to prevent concurrent double-spend
  SELECT balance INTO v_balance
  FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND     THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_BALANCE'; END IF;

  -- Daily spend cap: 1,000 coins per 24-hour rolling window
  SELECT COALESCE(SUM(amount), 0) INTO v_daily_staked
  FROM coin_transactions
  WHERE user_id = p_user_id
    AND type = 'stake'
    AND created_at > now() - interval '24 hours';

  IF v_daily_staked + p_amount > 1000 THEN
    RAISE EXCEPTION 'DAILY_STAKE_CAP_EXCEEDED';
  END IF;

  UPDATE coin_wallets
  SET balance    = balance - p_amount,
      escrow     = escrow  + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_transactions (user_id, type, amount, challenge_id, meta)
  VALUES (p_user_id, 'stake', p_amount, p_challenge_id, p_meta);
END;
$$;
REVOKE ALL ON FUNCTION debit_coins_to_escrow FROM public, authenticated, anon;

-- ── 6. release_escrow() — return escrowed coins to balance (cancel / expire / refund)

CREATE OR REPLACE FUNCTION release_escrow(
  p_user_id     uuid,
  p_amount      int,
  p_challenge_id uuid DEFAULT NULL,
  p_meta        jsonb DEFAULT '{}'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_escrow int;
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'AMOUNT_MUST_BE_POSITIVE'; END IF;

  SELECT escrow INTO v_escrow
  FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND      THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
  IF v_escrow < p_amount THEN RAISE EXCEPTION 'INSUFFICIENT_ESCROW'; END IF;

  UPDATE coin_wallets
  SET balance    = balance + p_amount,
      escrow     = escrow  - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_transactions (user_id, type, amount, challenge_id, meta)
  VALUES (p_user_id, 'refund', p_amount, p_challenge_id, p_meta);
END;
$$;
REVOKE ALL ON FUNCTION release_escrow FROM public, authenticated, anon;

-- ── 7. admin_grant_coins() — service-role only; for testing and manual grants

CREATE OR REPLACE FUNCTION admin_grant_coins(
  p_user_id uuid,
  p_amount  int,
  p_reason  text DEFAULT 'admin_grant'
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only callable from service-role context (auth.uid() IS NULL)
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;
  PERFORM credit_coins(p_user_id, p_amount, 'admin', NULL,
    json_build_object('reason', p_reason)::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION admin_grant_coins FROM public, authenticated, anon;

-- ── 8. get_my_wallet() — client-callable; returns balance + last 50 transactions

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
    SELECT type, amount, challenge_id, meta, created_at
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

-- ── 9. Auto-create wallet + 500-coin welcome bonus for new signups ────────────

CREATE OR REPLACE FUNCTION _create_user_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM credit_coins(NEW.id, 500, 'admin', NULL,
    '{"reason":"welcome_bonus"}'::jsonb);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_wallet_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION _create_user_wallet();

-- ── 10. Seed existing users with 500-coin welcome bonus ───────────────────────

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  FOR v_user_id IN SELECT id FROM auth.users LOOP
    PERFORM credit_coins(v_user_id, 500, 'admin', NULL,
      '{"reason":"welcome_bonus"}'::jsonb);
  END LOOP;
END;
$$;
