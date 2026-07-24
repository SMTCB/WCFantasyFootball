-- ── Migration 218: No-cash-out guarantee — positive schema constraint (LEGAL-1) ──
--
-- The coin economy uses Frontrow Coins (FRC), an internal virtual token.
-- There is intentionally no mechanism to convert FRC back to real money.
-- This migration makes that invariant explicit in the schema so that a legal
-- or compliance reviewer can verify it from the DB definition alone, without
-- needing to read application code.
--
-- What this adds:
--   1. An explicit COMMENT on coin_transactions explaining the no-cash-out rule.
--   2. A named CHECK constraint (no_external_cash_out) that makes the allowed
--      types exhaustive — any future attempt to INSERT a 'withdrawal', 'payout',
--      or 'cash_out' type will be rejected at the DB level, not just by the app.
--   3. A COMMENT on coin_wallets confirming its FRC-only scope.
--
-- The existing coin_transactions_type_check constraint (migration 209) already
-- permits only internal-flow types. This migration re-asserts it as a named
-- constraint with a clear legal label and adds comments so the intent survives
-- any future code audit.
--
-- NOTE: this migration is additive — it does not change any existing behaviour,
-- only adds documentary and structural guarantees on top of what is already live.

-- 1. Comment the table with the no-cash-out policy
COMMENT ON TABLE coin_transactions IS
  'Frontrow Coin (FRC) ledger. FRC is an internal virtual token only — it cannot '
  'be converted to cash, transferred externally, or redeemed for real-world value. '
  'No withdrawal, payout, or cash-out flow exists or is permitted. '
  'See: LEGAL-1 / docs/platform_revision/due_diligence/TECHNICAL_DUE_DILIGENCE_V2.md';

-- 2. Drop the anonymously-named constraint from migration 209 and replace it
--    with an identically-scoped but explicitly-named no_external_cash_out constraint.
--    The allowed set is unchanged — this is a rename + doc pass only.
ALTER TABLE coin_transactions
  DROP CONSTRAINT IF EXISTS coin_transactions_type_check;

ALTER TABLE coin_transactions
  ADD CONSTRAINT no_external_cash_out
  CHECK (type IN (
    -- Internal credit flows
    'purchase',         -- FRC bought via Stripe (real money → FRC; one-way only)
    'admin',            -- manual admin credit
    -- Wager flows (internal only — all stay inside the platform)
    'stake',            'wager_placement',  -- alias pair
    'win',              'wager_win',        -- alias pair
    'loss',
    'rake',             -- platform fee on wager
    'refund',           'wager_refund',     -- alias pair
    -- Entry fees
    'entry_fee'
    -- ✗ NOT INCLUDED — intentionally absent:
    --   'withdrawal', 'payout', 'cash_out', 'redeem', 'transfer_out'
    --   Adding any of these requires explicit legal/product sign-off.
  ));

COMMENT ON CONSTRAINT no_external_cash_out ON coin_transactions IS
  'Enforces the no-cash-out rule at schema level. Permitted types are '
  'exhaustively listed. Any real-money outflow type (withdrawal, payout, cash_out) '
  'is intentionally omitted and will be rejected by this constraint.';

-- 3. Comment coin_wallets
COMMENT ON TABLE coin_wallets IS
  'Per-user Frontrow Coin balance. FRC is internal-only — no cash withdrawal path exists.';

-- 4. Safety check: confirm no existing transactions have a cash-out type
--    (this will always be true since the type constraint has always excluded them,
--    but we assert it explicitly as a verifiable claim for auditors)
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM coin_transactions
  WHERE type NOT IN (
    'purchase','admin','stake','wager_placement','win','wager_win',
    'loss','rake','refund','wager_refund','entry_fee'
  );
  IF v_count > 0 THEN
    RAISE EXCEPTION 'LEGAL-1 audit check failed: % coin_transaction row(s) have an unexpected type', v_count;
  END IF;
END $$;
