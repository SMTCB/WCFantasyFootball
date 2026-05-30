-- Migration 95: P1 fixes (session 55)
-- TDD-11: execute_transfer_atomic — validate position cap + squad size inside the row lock
-- TDD-12: accept_trade_proposal — add FOR UPDATE row locks to prevent double-accept race
-- TDD-16: drop squads_public_read policy (exposed all squad data to unauthenticated users)

-- ── TDD-16: Remove public squad read policy ───────────────────────────────────
-- This policy allowed any unauthenticated request to read all squad data (budget,
-- player arrays). Dropping it; authenticated users retain their existing RLS policies.
DROP POLICY IF EXISTS squads_public_read ON squads;

-- ── TDD-11: Atomic transfer — add position cap + squad size check inside lock ─
-- Updated signature: accepts p_pos_limit (position cap) and p_squad_max.
-- Both are validated AFTER acquiring the FOR UPDATE lock so concurrent buys
-- for the same squad cannot both pass the same position count.
CREATE OR REPLACE FUNCTION execute_transfer_atomic(
  p_squad_id   uuid,
  p_action     text,
  p_player_id  uuid,
  p_price      numeric,
  p_pos_limit  int  DEFAULT 99,   -- position cap for this player's position (99 = no limit)
  p_squad_max  int  DEFAULT 15    -- maximum squad size
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_squad        squads;
  v_new_players  uuid[];
  v_new_budget   numeric;
  v_player_pos   text;
  v_pos_count    int;
BEGIN
  -- Acquire row lock; blocks any concurrent transfer on the same squad.
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF p_action = 'buy' THEN
    -- Re-validate inside the lock (guard against all concurrent-buy races).
    IF v_squad.players @> ARRAY[p_player_id] THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OWNED',
                                'error', 'You already own this player');
    END IF;
    IF array_length(v_squad.players, 1) >= p_squad_max THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL',
                                'error', 'Squad is full — sell a player first');
    END IF;
    IF v_squad.budget_remaining < p_price THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
                                'error', 'Insufficient budget');
    END IF;
    -- Position cap check (only when a meaningful cap is passed).
    IF p_pos_limit < 99 THEN
      SELECT p.position INTO v_player_pos FROM players p WHERE p.id = p_player_id;
      SELECT COUNT(*) INTO v_pos_count
        FROM players p
        WHERE p.id = ANY(v_squad.players) AND p.position = v_player_pos;
      IF v_pos_count >= p_pos_limit THEN
        RETURN jsonb_build_object('ok', false, 'code', 'POSITION_LIMIT',
          'error', 'Maximum ' || v_player_pos || ' players reached (' || p_pos_limit || ')');
      END IF;
    END IF;
    v_new_players := array_append(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining - p_price)::numeric, 1);

  ELSIF p_action = 'sell' THEN
    IF NOT (v_squad.players @> ARRAY[p_player_id]) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
    END IF;
    v_new_players := array_remove(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining + p_price)::numeric, 1);

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown action');
  END IF;

  UPDATE squads
    SET players          = v_new_players,
        budget_remaining = v_new_budget
  WHERE id = p_squad_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'players',         to_jsonb(v_new_players),
    'budget_remaining', v_new_budget
  );
END;
$$;

GRANT EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, uuid, numeric, int, int) TO service_role;

-- ── TDD-12: Trade accept — FOR UPDATE locks to prevent double-accept race ─────
-- The original function reads both the proposal and squad rows without locking,
-- so two concurrent accepts can both pass the status='pending' check and execute
-- the swap twice. Adding FOR UPDATE to all three reads.
CREATE OR REPLACE FUNCTION public.accept_trade_proposal(p_proposal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_proposal        trade_proposals%ROWTYPE;
  v_target_user_id  UUID;
  v_proposer_budget NUMERIC;
  v_target_budget   NUMERIC;
  v_prop_players    TEXT[];
  v_tgt_players     TEXT[];
BEGIN
  -- Lock proposal row first to prevent concurrent accepts.
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id FOR UPDATE;

  IF v_proposal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_FOUND');
  END IF;

  IF v_proposal.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_PENDING');
  END IF;

  IF v_proposal.expires_at < NOW() THEN
    UPDATE trade_proposals SET status = 'expired', resolved_at = NOW()
      WHERE id = p_proposal_id;
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_EXPIRED');
  END IF;

  -- Caller must own the target squad.
  SELECT user_id INTO v_target_user_id FROM squads WHERE id = v_proposal.target_squad_id;
  IF v_target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_TARGET_SQUAD_OWNER');
  END IF;

  -- Lock both squad rows in UUID order to prevent deadlock when two swaps
  -- involving the same squads run concurrently.
  IF v_proposal.proposer_squad_id < v_proposal.target_squad_id THEN
    SELECT players, budget_remaining INTO v_prop_players, v_proposer_budget
      FROM squads WHERE id = v_proposal.proposer_squad_id FOR UPDATE;
    SELECT players, budget_remaining INTO v_tgt_players, v_target_budget
      FROM squads WHERE id = v_proposal.target_squad_id FOR UPDATE;
  ELSE
    SELECT players, budget_remaining INTO v_tgt_players, v_target_budget
      FROM squads WHERE id = v_proposal.target_squad_id FOR UPDATE;
    SELECT players, budget_remaining INTO v_prop_players, v_proposer_budget
      FROM squads WHERE id = v_proposal.proposer_squad_id FOR UPDATE;
  END IF;

  IF NOT (v_proposal.proposer_player_id = ANY(v_prop_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;
  IF NOT (v_proposal.target_player_id = ANY(v_tgt_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;

  IF v_proposal.cash_sweetener > 0 AND v_target_budget < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_INSUFFICIENT_BUDGET');
  END IF;

  -- Atomic swap.
  UPDATE squads
    SET players = array_remove(players, v_proposal.proposer_player_id)
                  || ARRAY[v_proposal.target_player_id],
        budget_remaining = budget_remaining - v_proposal.cash_sweetener
    WHERE id = v_proposal.proposer_squad_id;

  UPDATE squads
    SET players = array_remove(players, v_proposal.target_player_id)
                  || ARRAY[v_proposal.proposer_player_id],
        budget_remaining = budget_remaining + v_proposal.cash_sweetener
    WHERE id = v_proposal.target_squad_id;

  IF v_proposal.points_sweetener > 0 THEN
    UPDATE league_members
      SET total_points = total_points - v_proposal.points_sweetener
      WHERE league_id = v_proposal.league_id
        AND user_id = (SELECT user_id FROM squads WHERE id = v_proposal.proposer_squad_id);
  END IF;

  UPDATE trade_proposals
    SET status = 'accepted', resolved_at = NOW()
    WHERE id = p_proposal_id;

  -- Cancel other pending proposals involving either traded player.
  UPDATE trade_proposals
    SET status = 'cancelled', resolved_at = NOW()
    WHERE id <> p_proposal_id
      AND status = 'pending'
      AND (
        proposer_player_id IN (v_proposal.proposer_player_id, v_proposal.target_player_id)
        OR target_player_id IN (v_proposal.proposer_player_id, v_proposal.target_player_id)
      )
      AND (
        proposer_squad_id IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id)
        OR target_squad_id IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id)
      );

  -- Notify proposer their offer was accepted.
  INSERT INTO league_notifications (
    league_id, user_id, notification_type,
    triggered_by_user_id, title, description,
    related_entity_id, related_entity_type
  )
  SELECT
    v_proposal.league_id,
    s.user_id,
    'trade_accepted',
    auth.uid(),
    'Trade Accepted',
    (SELECT name FROM players WHERE id = v_proposal.target_player_id)
      || ' is now in your squad',
    p_proposal_id,
    'trade_proposal'
  FROM squads s WHERE s.id = v_proposal.proposer_squad_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
