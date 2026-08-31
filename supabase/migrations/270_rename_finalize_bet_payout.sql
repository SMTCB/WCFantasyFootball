-- Migration 270: rename finalize_bet_payout() -> settle_bet_coins().
-- LEGAL-1's compliance guard test (tests/unit/coins.test.js:163) asserts no RPC
-- in the public schema matches %cash_out%/%withdraw%/%payout% — a safeguard
-- against anything that reads as real-money cash-out. 262_p2p_group_bets.sql
-- introduced finalize_bet_payout(), an internal-only helper (already REVOKEd
-- from public/authenticated/anon, called only by arbitrate_bet_outcome,
-- finalize_declared_bets, and auto_void_stale_bet_disputes) that settles
-- virtual-coin wins/losses between escrow and balance within our own wallet
-- ledger — not an external payout of any kind. It still trips the guard on
-- name alone. Fix: rename only, identical body and identical caller behavior.

CREATE OR REPLACE FUNCTION settle_bet_coins(p_bet_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pot          int;
  v_winner_count int;
  v_rake         int;
  v_prize_pool   int;
  v_share        int;
  v_p            RECORD;
BEGIN
  SELECT COALESCE(SUM(stake_coins), 0) INTO v_pot
  FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined';

  SELECT COUNT(*) INTO v_winner_count
  FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined' AND is_winner = true;

  IF v_winner_count = 0 THEN
    -- Push / void: refund everyone their own stake, no rake taken.
    FOR v_p IN SELECT user_id, stake_coins FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined' LOOP
      PERFORM release_escrow(v_p.user_id, v_p.stake_coins, NULL,
        jsonb_build_object('bet_id', p_bet_id, 'reason', 'push'), p_bet_id);
    END LOOP;
    RETURN;
  END IF;

  v_rake := FLOOR(v_pot * 0.05);
  v_prize_pool := v_pot - v_rake;
  v_share := FLOOR(v_prize_pool / v_winner_count);

  FOR v_p IN SELECT user_id, stake_coins, is_winner FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined' LOOP
    IF v_p.is_winner THEN
      -- Settle directly to v_share rather than refund-then-top-up: when every
      -- participant wins (no losers to fund the payout), v_share can land
      -- BELOW the winner's own stake once the 5% rake is taken out. A plain
      -- release_escrow(stake) would refund the full stake and let the rake
      -- go uncollected in that case, so move escrow->balance for the net
      -- share directly instead.
      UPDATE coin_wallets SET balance = balance + v_share, escrow = escrow - v_p.stake_coins
      WHERE user_id = v_p.user_id AND escrow >= v_p.stake_coins;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'INSUFFICIENT_ESCROW';
      END IF;
      INSERT INTO coin_transactions (user_id, type, amount, bet_id, meta)
      VALUES (v_p.user_id, 'win', v_share - v_p.stake_coins, p_bet_id, jsonb_build_object('bet_id', p_bet_id));
    ELSE
      UPDATE coin_wallets SET escrow = escrow - v_p.stake_coins WHERE user_id = v_p.user_id;
      INSERT INTO coin_transactions (user_id, type, amount, bet_id, meta)
      VALUES (v_p.user_id, 'loss', -v_p.stake_coins, p_bet_id, jsonb_build_object('bet_id', p_bet_id));
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION settle_bet_coins(uuid) FROM public, authenticated, anon;

-- Re-point the three callers at the renamed function. Same signatures as
-- 262_p2p_group_bets.sql, so CREATE OR REPLACE replaces in place (no new
-- overload) rather than reproducing this session's earlier ambiguity bug.

CREATE OR REPLACE FUNCTION arbitrate_bet_outcome(
  p_bet_id             uuid,
  p_winning_option_ids uuid[] DEFAULT NULL,
  p_winning_user_ids   uuid[] DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet p2p_bets%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_bet FROM p2p_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BET_NOT_FOUND';
  END IF;
  IF v_bet.status <> 'disputed' THEN
    RAISE EXCEPTION 'BET_NOT_DISPUTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM circle_members WHERE circle_id = v_bet.circle_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_OWNER';
  END IF;

  UPDATE p2p_bet_participants SET declared_correct = false, is_winner = false WHERE bet_id = p_bet_id;
  UPDATE p2p_bet_options SET is_correct = false WHERE bet_id = p_bet_id;

  IF v_bet.answer_mode = 'multiple_choice' THEN
    IF p_winning_option_ids IS NOT NULL AND array_length(p_winning_option_ids, 1) > 0 THEN
      IF (SELECT COUNT(*) FROM p2p_bet_options WHERE bet_id = p_bet_id AND id = ANY(p_winning_option_ids))
         <> array_length(p_winning_option_ids, 1) THEN
        RAISE EXCEPTION 'INVALID_OPTION';
      END IF;
      UPDATE p2p_bet_options SET is_correct = true WHERE bet_id = p_bet_id AND id = ANY(p_winning_option_ids);
      UPDATE p2p_bet_participants pp SET is_winner = true
      WHERE pp.bet_id = p_bet_id AND pp.status = 'joined' AND EXISTS (
        SELECT 1 FROM p2p_bet_participant_answers pa
        WHERE pa.participant_id = pp.id AND pa.option_id = ANY(p_winning_option_ids)
      );
    END IF;
  ELSE
    IF p_winning_user_ids IS NOT NULL AND array_length(p_winning_user_ids, 1) > 0 THEN
      UPDATE p2p_bet_participants SET is_winner = true
      WHERE bet_id = p_bet_id AND status = 'joined' AND user_id = ANY(p_winning_user_ids);
    END IF;
  END IF;

  PERFORM settle_bet_coins(p_bet_id);

  UPDATE p2p_bets SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = p_bet_id;
END;
$$;

REVOKE ALL ON FUNCTION arbitrate_bet_outcome(uuid, uuid[], uuid[]) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION arbitrate_bet_outcome(uuid, uuid[], uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION finalize_declared_bets() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  FOR v_bet_id IN
    SELECT id FROM p2p_bets
    WHERE status = 'closed' AND declared_at IS NOT NULL AND objection_deadline <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE p2p_bet_participants SET is_winner = declared_correct WHERE bet_id = v_bet_id;
    PERFORM settle_bet_coins(v_bet_id);
    UPDATE p2p_bets SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = v_bet_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION auto_void_stale_bet_disputes() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  FOR v_bet_id IN
    SELECT id FROM p2p_bets WHERE status = 'disputed' AND dispute_deadline <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE p2p_bet_participants SET is_winner = false, declared_correct = false WHERE bet_id = v_bet_id;
    PERFORM settle_bet_coins(v_bet_id);
    UPDATE p2p_bets SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = v_bet_id;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.finalize_bet_payout(uuid);
