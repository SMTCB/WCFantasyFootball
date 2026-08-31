-- Migration 268: same bug as 267, one function further. 262_p2p_group_bets.sql
-- also re-overloaded release_escrow() the same broken way (202's 4-arg version
-- vs 262's 5-arg version with p_bet_id). Confirmed live in prod: any legacy-arity
-- call to release_escrow (decline/cancel/expire/refund paths) currently fails
-- with "function ... is not unique". Same fix: drop the narrower overload.

DROP FUNCTION IF EXISTS public.release_escrow(uuid, integer, uuid, jsonb);
