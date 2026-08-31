-- Migration 267: fix ambiguous credit_coins()/debit_coins_to_escrow() overloads,
-- reintroduced by 262_p2p_group_bets.sql (same bug class as 226, one function
-- further). CREATE OR REPLACE with a different arg list creates a new overload
-- instead of replacing the original, leaving two candidates that any call with
-- fewer than the max arg count cannot resolve ("function ... is not unique").
-- Confirmed live in prod: refunds/payouts/stake-debits and the new-user wallet
-- welcome-bonus trigger are currently broken. Fix: drop the narrower overload,
-- keep only the version with p_bet_id (defaults to NULL, so behavior for every
-- existing caller is unchanged).

DROP FUNCTION IF EXISTS public.credit_coins(uuid, integer, text, uuid, jsonb, character, text);
DROP FUNCTION IF EXISTS public.debit_coins_to_escrow(uuid, integer, uuid, jsonb);
