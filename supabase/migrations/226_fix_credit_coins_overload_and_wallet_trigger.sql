-- Migration 226: fix credit_coins() ambiguous overload + wallet-trigger search_path
--
-- v2-only fix — P2P coin ledger tables (coin_wallets, coin_transactions,
-- p2p_challenges) do not exist on `main`/production. This migration has never
-- been applied anywhere; it is written and PENDING, to be applied as part of
-- the normal v2 migration set when v2 deploys (per SALE_READY_PROJECT_PLAN.md
-- Week-12 merge gate). Do NOT run against the linked production project.
--
-- ── Bug 1: ambiguous credit_coins() overload ───────────────────────────────
-- 202_p2p_coin_ledger.sql defined credit_coins(uuid, int, text, uuid, jsonb).
-- 208_coin_transactions_schema_v2.sql added credit_coins(uuid, int, text,
-- uuid, jsonb, char(3) DEFAULT, text DEFAULT) intending it as a
-- backward-compatible replacement (see 208's own comment: "Backward-compatible:
-- both params default ... so existing callers continue to work without
-- change"). That assumption is wrong in Postgres — CREATE OR REPLACE only
-- replaces a function with the IDENTICAL parameter list; a different
-- signature creates a second, coexisting overload. Every existing call site
-- (202's _create_user_wallet/admin_grant_coins, 204_p2p_challenges.sql,
-- 205_p2p_resolution.sql, 224_fix_p2p_resolve_payout.sql) calls credit_coins
-- with exactly 5 positional args, which now matches BOTH overloads
-- (the 7-arg version's trailing two params both have defaults) →
-- "function credit_coins(...) is not unique" on every call.
--
-- Fix: drop the stale 5-arg signature. The 7-arg version's defaults
-- (p_currency DEFAULT 'FRC' as of 209, p_reference_id DEFAULT NULL) mean
-- every existing 5-arg call site keeps working with zero code changes.
DROP FUNCTION IF EXISTS public.credit_coins(uuid, int, text, uuid, jsonb);

-- ── Bug 2: _create_user_wallet() missing SET search_path ──────────────────
-- This SECURITY DEFINER function is fired by a trigger on auth.users
-- (AFTER INSERT), which executes under Supabase's internal
-- `supabase_auth_admin` role. That role's search_path is hardcoded to
-- `auth` only (confirmed via pg_roles.rolconfig) — NOT `public`. Without an
-- explicit SET search_path, the function's unqualified call to
-- credit_coins(...) cannot resolve, and PostgreSQL raises
-- "function credit_coins(...) does not exist" from inside the trigger.
-- Net effect once this trigger is live: every new user signup fails.
--
-- Later v2 functions already learned this lesson (e.g.
-- 224_fix_p2p_resolve_payout.sql's resolve_p2p_challenge() has
-- SET search_path = public) — this migration brings _create_user_wallet()
-- in line. Body is unchanged from 202_p2p_coin_ledger.sql other than the
-- added SET clause.
CREATE OR REPLACE FUNCTION _create_user_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM credit_coins(NEW.id, 500, 'admin', NULL,
    '{"reason":"welcome_bonus"}'::jsonb);
  RETURN NEW;
END;
$$;
