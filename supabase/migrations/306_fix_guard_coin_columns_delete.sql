-- Migration 306: BUG-CW1. guard_coin_columns() did RETURN NEW for every operation.
-- In a BEFORE DELETE trigger NEW is NULL, so Postgres silently cancelled every
-- DELETE on coin_wallets. Return OLD for DELETE; behaviour for INSERT/UPDATE is unchanged.
CREATE OR REPLACE FUNCTION public.guard_coin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'DIRECT_WRITE_BLOCKED: coin balance can only change via credit_coins() / debit_coins_to_escrow() RPCs';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;
