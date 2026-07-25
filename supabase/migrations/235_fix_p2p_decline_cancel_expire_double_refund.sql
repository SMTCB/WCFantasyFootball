-- Fix double-refund bug in decline_p2p_challenge / cancel_p2p_challenge / expire_stale_challenges.
--
-- release_escrow() already moves escrow -> balance AND inserts its own 'refund' row into
-- coin_transactions. All three functions below then also called credit_coins(..., 'refund', ...),
-- crediting the challenger's balance a second time and logging a second 'refund' transaction for
-- the same challenge. Confirmed live in prod via pg_get_functiondef() before writing this fix.
--
-- This migration only removes the redundant credit_coins() call going forward. It does not correct
-- balances that were already double-refunded historically -- see the SELECT run before this
-- migration was applied for the extent of that, and BACKLOG.md / session notes for any resulting
-- manual correction.

CREATE OR REPLACE FUNCTION public.decline_p2p_challenge(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_ch      p2p_challenges;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.opponent_id <> v_user_id THEN RAISE EXCEPTION 'NOT_OPPONENT'; END IF;
  IF v_ch.status <> 'pending' THEN RAISE EXCEPTION 'CHALLENGE_NOT_PENDING'; END IF;

  -- Refund challenger's stake from escrow (release_escrow logs its own 'refund' transaction)
  PERFORM release_escrow(
    v_ch.challenger_id,
    v_ch.stake_coins,
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_declined')
  );

  UPDATE p2p_challenges
  SET status = 'declined', updated_at = now()
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('status', 'declined');
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_p2p_challenge(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_ch      p2p_challenges;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.challenger_id <> v_user_id THEN RAISE EXCEPTION 'NOT_CHALLENGER'; END IF;
  IF v_ch.status NOT IN ('pending') THEN RAISE EXCEPTION 'CANNOT_CANCEL'; END IF;

  -- Refund challenger's stake (release_escrow logs its own 'refund' transaction)
  PERFORM release_escrow(
    v_ch.challenger_id,
    v_ch.stake_coins,
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_cancelled')
  );

  UPDATE p2p_challenges
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('status', 'cancelled');
END;
$function$;

CREATE OR REPLACE FUNCTION public.expire_stale_challenges()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ch    p2p_challenges;
  v_count int := 0;
BEGIN
  FOR v_ch IN
    SELECT * FROM p2p_challenges
    WHERE status = 'pending' AND expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Refund challenger stake (release_escrow logs its own 'refund' transaction)
    BEGIN
      PERFORM release_escrow(
        v_ch.challenger_id,
        v_ch.stake_coins,
        v_ch.id,
        jsonb_build_object('reason', 'challenge_expired')
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'expire_stale_challenges: refund failed for challenge %: %', v_ch.id, SQLERRM;
    END;

    UPDATE p2p_challenges
    SET status = 'expired', updated_at = now()
    WHERE id = v_ch.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;
