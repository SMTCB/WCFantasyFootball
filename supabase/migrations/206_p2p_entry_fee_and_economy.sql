-- Migration 206: P2P-5 — league entry fee + coin economy stats
--
-- 1. Extend coin_transactions.type CHECK to include 'entry_fee'
-- 2. _debit_entry_fee() — internal SECURITY DEFINER for join flow
-- 3. join_league_by_code updated — charges coin_entry_fee from league_config on join
-- 4. get_coin_economy_stats() — aggregate platform health RPC for demo/operators

-- ── 1. Add 'entry_fee' to the type CHECK constraint
ALTER TABLE coin_transactions DROP CONSTRAINT IF EXISTS coin_transactions_type_check;
ALTER TABLE coin_transactions ADD CONSTRAINT coin_transactions_type_check
  CHECK (type IN ('purchase','stake','win','loss','rake','refund','admin','entry_fee'));

-- ── 2. _debit_entry_fee(p_user_id, p_amount, p_league_id)
--    Non-escrow, non-refundable balance debit. Daily cap does NOT apply to entry fees.
--    Called only by join_league_by_code — not grantable to clients.
CREATE OR REPLACE FUNCTION _debit_entry_fee(
  p_user_id  uuid,
  p_amount   int,
  p_league_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet coin_wallets;
BEGIN
  SELECT * INTO v_wallet FROM coin_wallets WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  IF v_wallet.balance < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  UPDATE coin_wallets
  SET balance    = balance - p_amount,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO coin_transactions (user_id, type, amount, meta, created_at)
  VALUES (
    p_user_id, 'entry_fee', p_amount,
    jsonb_build_object('reason', 'league_entry', 'league_id', p_league_id),
    now()
  );
END;
$$;

REVOKE ALL ON FUNCTION _debit_entry_fee(uuid, int, uuid) FROM public, authenticated, anon;

-- ── 3. join_league_by_code — extended with entry fee support
--    If league_config has a 'coin_entry_fee' key set to a positive integer,
--    the joining user's wallet is debited that amount before the member row is inserted.
--    Returns 'INSUFFICIENT_BALANCE' if the user cannot afford it.
--    Returns 'ENTRY_FEE_REQUIRED' with the amount if the user's wallet does not exist.
CREATE OR REPLACE FUNCTION join_league_by_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller       uuid := auth.uid();
  v_league_id    uuid;
  v_member_count int;
  v_entry_fee    int  := 0;
  v_fee_cfg      text;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  SELECT id INTO v_league_id
  FROM public.leagues
  WHERE join_code = UPPER(p_code);

  IF v_league_id IS NULL THEN
    RETURN jsonb_build_object('error', 'LEAGUE_NOT_FOUND');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.league_members
    WHERE league_id = v_league_id AND user_id = v_caller
  ) THEN
    RETURN jsonb_build_object('error', 'ALREADY_MEMBER');
  END IF;

  SELECT COUNT(*) INTO v_member_count
  FROM public.league_members
  WHERE league_id = v_league_id;

  IF v_member_count >= 20 THEN
    RETURN jsonb_build_object('error', 'LEAGUE_FULL');
  END IF;

  -- Check for coin entry fee in league_config
  SELECT config_value INTO v_fee_cfg
  FROM public.league_config
  WHERE league_id = v_league_id AND config_key = 'coin_entry_fee';

  IF v_fee_cfg IS NOT NULL THEN
    v_entry_fee := COALESCE(v_fee_cfg::int, 0);
  END IF;

  -- Debit entry fee before inserting member (atomic: fee fails → no join)
  IF v_entry_fee > 0 THEN
    BEGIN
      PERFORM _debit_entry_fee(v_caller, v_entry_fee, v_league_id);
    EXCEPTION
      WHEN OTHERS THEN
        RETURN jsonb_build_object(
          'error',      SQLERRM,
          'entry_fee',  v_entry_fee
        );
    END;
  END IF;

  INSERT INTO public.league_members (league_id, user_id, role)
  VALUES (v_league_id, v_caller, 'member');

  RETURN jsonb_build_object(
    'league_id',  v_league_id,
    'name',       (SELECT name FROM public.leagues WHERE id = v_league_id),
    'entry_fee',  v_entry_fee,
    'success',    true
  );
END;
$$;

REVOKE ALL ON FUNCTION join_league_by_code(text) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION join_league_by_code(text) TO authenticated;

-- ── 4. get_coin_economy_stats() — aggregate platform health
--    Visible to all authenticated users (aggregate, not per-user sensitive).
--    Useful for the operator/demo view — shows circulation, escrow, challenge volume.
CREATE OR REPLACE FUNCTION get_coin_economy_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_circulating    bigint;
  v_in_escrow      bigint;
  v_available      bigint;
  v_purchase_vol   bigint;
  v_entry_fees     bigint;
  v_rake_burned    bigint;
  v_challenges_won int;
  v_challenges_tie int;
BEGIN
  SELECT
    COALESCE(SUM(balance + escrow), 0),
    COALESCE(SUM(escrow), 0),
    COALESCE(SUM(balance), 0)
  INTO v_circulating, v_in_escrow, v_available
  FROM coin_wallets;

  SELECT COALESCE(SUM(amount), 0) INTO v_purchase_vol
  FROM coin_transactions WHERE type = 'purchase';

  SELECT COALESCE(SUM(amount), 0) INTO v_entry_fees
  FROM coin_transactions WHERE type = 'entry_fee';

  -- Rake is the difference between total pot and prize awarded on resolved non-tie challenges
  SELECT COALESCE(SUM(FLOOR(stake_coins * 2 * 0.05)), 0) INTO v_rake_burned
  FROM p2p_challenges WHERE status = 'resolved' AND winner_id IS NOT NULL;

  SELECT COUNT(*) INTO v_challenges_won
  FROM p2p_challenges WHERE status = 'resolved' AND winner_id IS NOT NULL;

  SELECT COUNT(*) INTO v_challenges_tie
  FROM p2p_challenges WHERE status = 'resolved' AND winner_id IS NULL;

  RETURN jsonb_build_object(
    'circulating',      v_circulating,
    'in_escrow',        v_in_escrow,
    'available',        v_available,
    'purchase_volume',  v_purchase_vol,
    'entry_fees',       v_entry_fees,
    'rake_burned',      v_rake_burned,
    'challenges_won',   v_challenges_won,
    'challenges_tie',   v_challenges_tie,
    'challenges_total', v_challenges_won + v_challenges_tie
  );
END;
$$;

REVOKE ALL ON FUNCTION get_coin_economy_stats() FROM public, anon;
GRANT  EXECUTE ON FUNCTION get_coin_economy_stats() TO authenticated;
