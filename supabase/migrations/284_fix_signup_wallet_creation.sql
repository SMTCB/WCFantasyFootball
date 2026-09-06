-- Migration 284: fix broken new-user signup — welcome-bonus wallet creation
--
-- Root cause: migration 262 (P2P Group Bets) redefined credit_coins() to add
-- the p_bet_id ledger column. In doing so it replaced the upsert body from
-- 208/209 (INSERT INTO coin_wallets ... ON CONFLICT DO UPDATE, which
-- auto-creates a missing wallet) with a strict body that requires the wallet
-- to already exist (UPDATE coin_wallets ...; IF NOT FOUND THEN RAISE
-- EXCEPTION 'WALLET_NOT_FOUND'). Nothing else creates the coin_wallets row
-- for a brand-new user before the signup welcome-bonus trigger
-- (trg_create_wallet_on_signup / _create_user_wallet(), AFTER INSERT ON
-- auth.users) calls credit_coins(NEW.id, 500, ...) — so every signup since
-- 262 went live has raised WALLET_NOT_FOUND inside that trigger, rolling
-- back the entire auth.users insert. Supabase surfaces this to the client as
-- the generic "Database error saving new user".
--
-- Confirmed via read-only inspection (2026-09-06): live credit_coins() body
-- matches 262's strict version exactly; 59 existing users all already have a
-- wallet (predating this regression); zero successful signups since
-- 2026-08-27 — every new-user signup attempt since the site reopened
-- (maintenance wall removed 2026-08-30) has been silently failing.
--
-- Fix: have _create_user_wallet() create the coin_wallets row itself
-- (idempotent, ON CONFLICT DO NOTHING) before crediting the welcome bonus,
-- rather than relying on credit_coins() to do it. credit_coins()'s stricter
-- "wallet must already exist" behavior is left untouched everywhere else, in
-- case other call sites now depend on WALLET_NOT_FOUND as an intentional
-- guard against crediting a nonexistent account.

CREATE OR REPLACE FUNCTION public._create_user_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO coin_wallets (user_id) VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  PERFORM credit_coins(NEW.id, 500, 'admin', NULL,
    '{"reason":"welcome_bonus"}'::jsonb);
  RETURN NEW;
END;
$$;
