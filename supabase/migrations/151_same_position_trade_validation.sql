-- Migration 151: enforce same-position constraint on trade proposals
--
-- Both submit_trade_proposal and accept_trade_proposal now reject with
-- POSITION_MISMATCH when the two players are not the same position.
-- This closes the squad-structure corruption path (e.g. trading a MID for
-- a FWD produces an invalid formation).

-- ─── submit_trade_proposal ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_trade_proposal(
  p_league_id          UUID,
  p_proposer_squad_id  UUID,
  p_target_squad_id    UUID,
  p_proposer_player_id TEXT,
  p_target_player_id   TEXT,
  p_cash_sweetener     NUMERIC DEFAULT 0,
  p_points_sweetener   INT     DEFAULT 0
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_proposer_user_id  UUID;
  v_proposer_players  TEXT[];
  v_target_players    TEXT[];
  v_proposer_budget   NUMERIC;
  v_proposer_points   NUMERIC;
  v_new_proposal_id   UUID;
  v_proposer_position TEXT;
  v_target_position   TEXT;
BEGIN
  -- Verify caller owns proposer squad
  SELECT user_id, players, budget_remaining
    INTO v_proposer_user_id, v_proposer_players, v_proposer_budget
    FROM squads WHERE id = p_proposer_squad_id AND league_id = p_league_id;

  IF v_proposer_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'SQUAD_NOT_FOUND');
  END IF;

  IF v_proposer_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_YOUR_SQUAD');
  END IF;

  -- Verify target squad exists in same league
  SELECT players INTO v_target_players
    FROM squads WHERE id = p_target_squad_id AND league_id = p_league_id;

  IF v_target_players IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_SQUAD_NOT_FOUND');
  END IF;

  -- Verify proposer owns their player
  IF NOT (p_proposer_player_id = ANY(v_proposer_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_PLAYER_NOT_IN_SQUAD');
  END IF;

  -- Verify target owns their player
  IF NOT (p_target_player_id = ANY(v_target_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_PLAYER_NOT_IN_SQUAD');
  END IF;

  -- Enforce same-position rule
  SELECT position INTO v_proposer_position FROM players WHERE id = p_proposer_player_id;
  SELECT position INTO v_target_position   FROM players WHERE id = p_target_player_id;
  IF v_proposer_position IS DISTINCT FROM v_target_position THEN
    RETURN jsonb_build_object('ok', false, 'error', 'POSITION_MISMATCH');
  END IF;

  -- Reject negative sweeteners
  IF p_cash_sweetener < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SWEETENER');
  END IF;

  -- Validate proposer budget covers positive cash sweetener
  IF p_cash_sweetener > 0 AND v_proposer_budget < p_cash_sweetener THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_BUDGET');
  END IF;

  -- Validate proposer has enough points for sweetener
  IF p_points_sweetener > 0 THEN
    SELECT total_points INTO v_proposer_points
      FROM league_members WHERE league_id = p_league_id AND user_id = auth.uid();
    IF v_proposer_points < p_points_sweetener THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_POINTS');
    END IF;
  END IF;

  -- Insert proposal
  INSERT INTO trade_proposals (
    league_id, proposer_squad_id, target_squad_id,
    proposer_player_id, target_player_id,
    cash_sweetener, points_sweetener
  ) VALUES (
    p_league_id, p_proposer_squad_id, p_target_squad_id,
    p_proposer_player_id, p_target_player_id,
    p_cash_sweetener, p_points_sweetener
  ) RETURNING id INTO v_new_proposal_id;

  -- Notify the target squad owner
  INSERT INTO league_notifications (
    league_id, user_id, notification_type,
    triggered_by_user_id, title, description,
    related_entity_id, related_entity_type
  )
  SELECT
    p_league_id, s.user_id, 'trade_proposal', auth.uid(),
    'New Trade Offer',
    (SELECT name FROM players WHERE id = p_proposer_player_id)
      || ' for '
      || (SELECT name FROM players WHERE id = p_target_player_id),
    v_new_proposal_id, 'trade_proposal'
  FROM squads s WHERE s.id = p_target_squad_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── accept_trade_proposal ────────────────────────────────────────────────────
-- Re-checks position at accept time so existing stale cross-position proposals
-- (created before this migration) cannot be accepted.

CREATE OR REPLACE FUNCTION public.accept_trade_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proposal          trade_proposals%ROWTYPE;
  v_target_user_id    UUID;
  v_proposer_user_id  UUID;
  v_proposer_budget   NUMERIC;
  v_target_budget     NUMERIC;
  v_prop_players      TEXT[];
  v_tgt_players       TEXT[];
  v_prop_player_name  TEXT;
  v_tgt_player_name   TEXT;
  v_proposer_username TEXT;
  v_target_username   TEXT;
  v_proposer_position TEXT;
  v_target_position   TEXT;
BEGIN
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF v_proposal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_FOUND');
  END IF;
  IF v_proposal.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_PENDING');
  END IF;
  IF v_proposal.expires_at < NOW() THEN
    UPDATE trade_proposals SET status = 'expired', resolved_at = NOW() WHERE id = p_proposal_id;
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_EXPIRED');
  END IF;

  -- Identify both users
  SELECT user_id INTO v_target_user_id   FROM squads WHERE id = v_proposal.target_squad_id;
  SELECT user_id INTO v_proposer_user_id FROM squads WHERE id = v_proposal.proposer_squad_id;

  IF v_target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_TARGET_SQUAD_OWNER');
  END IF;

  -- Lock squads in consistent order to prevent deadlock
  IF v_proposal.proposer_squad_id < v_proposal.target_squad_id THEN
    SELECT players, budget_remaining INTO v_prop_players, v_proposer_budget FROM squads WHERE id = v_proposal.proposer_squad_id FOR UPDATE;
    SELECT players, budget_remaining INTO v_tgt_players,  v_target_budget   FROM squads WHERE id = v_proposal.target_squad_id   FOR UPDATE;
  ELSE
    SELECT players, budget_remaining INTO v_tgt_players,  v_target_budget   FROM squads WHERE id = v_proposal.target_squad_id   FOR UPDATE;
    SELECT players, budget_remaining INTO v_prop_players, v_proposer_budget FROM squads WHERE id = v_proposal.proposer_squad_id FOR UPDATE;
  END IF;

  IF NOT (v_proposal.proposer_player_id = ANY(v_prop_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;
  IF NOT (v_proposal.target_player_id = ANY(v_tgt_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;

  -- Re-check position match (guards against stale proposals created before migration 151)
  SELECT position INTO v_proposer_position FROM players WHERE id = v_proposal.proposer_player_id;
  SELECT position INTO v_target_position   FROM players WHERE id = v_proposal.target_player_id;
  IF v_proposer_position IS DISTINCT FROM v_target_position THEN
    RETURN jsonb_build_object('ok', false, 'error', 'POSITION_MISMATCH');
  END IF;

  IF v_proposal.cash_sweetener > 0 AND v_proposer_budget < v_proposal.cash_sweetener THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_INSUFFICIENT_BUDGET');
  END IF;

  -- Swap players + transfer cash (positive cash_sweetener: proposer pays target)
  UPDATE squads
    SET players          = array_remove(players, v_proposal.proposer_player_id) || ARRAY[v_proposal.target_player_id],
        budget_remaining = budget_remaining - v_proposal.cash_sweetener
    WHERE id = v_proposal.proposer_squad_id;

  UPDATE squads
    SET players          = array_remove(players, v_proposal.target_player_id) || ARRAY[v_proposal.proposer_player_id],
        budget_remaining = budget_remaining + v_proposal.cash_sweetener
    WHERE id = v_proposal.target_squad_id;

  -- Transfer points sweetener: subtract from proposer AND add to target
  IF v_proposal.points_sweetener > 0 THEN
    UPDATE league_members
      SET total_points = total_points - v_proposal.points_sweetener
      WHERE league_id = v_proposal.league_id AND user_id = v_proposer_user_id;

    UPDATE league_members
      SET total_points = total_points + v_proposal.points_sweetener
      WHERE league_id = v_proposal.league_id AND user_id = v_target_user_id;
  END IF;

  -- Mark accepted; cancel conflicting pending proposals
  UPDATE trade_proposals SET status = 'accepted', resolved_at = NOW() WHERE id = p_proposal_id;
  UPDATE trade_proposals SET status = 'cancelled', resolved_at = NOW()
    WHERE id <> p_proposal_id AND status = 'pending'
      AND (proposer_player_id IN (v_proposal.proposer_player_id, v_proposal.target_player_id)
        OR target_player_id  IN (v_proposal.proposer_player_id, v_proposal.target_player_id))
      AND (proposer_squad_id IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id)
        OR target_squad_id   IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id));

  -- Notify proposer
  INSERT INTO league_notifications (
    league_id, user_id, notification_type, triggered_by_user_id,
    title, description, related_entity_id, related_entity_type
  )
  SELECT v_proposal.league_id, s.user_id, 'trade_accepted', auth.uid(),
    'Trade Accepted',
    (SELECT name FROM players WHERE id = v_proposal.target_player_id) || ' is now in your squad',
    p_proposal_id, 'trade_proposal'
  FROM squads s WHERE s.id = v_proposal.proposer_squad_id;

  -- Write gazette entry
  SELECT name INTO v_prop_player_name FROM players WHERE id = v_proposal.proposer_player_id;
  SELECT name INTO v_tgt_player_name  FROM players WHERE id = v_proposal.target_player_id;
  SELECT username INTO v_proposer_username FROM users WHERE id = v_proposer_user_id;
  SELECT username INTO v_target_username   FROM users WHERE id = v_target_user_id;

  INSERT INTO gazette_entries (league_id, entry_type, headline, bullets, published_at)
  VALUES (
    v_proposal.league_id,
    'trade_result',
    '🤝 ' || COALESCE(v_proposer_username, 'Manager') || ' ⇄ ' || COALESCE(v_target_username, 'Manager') || ' — deal done',
    jsonb_build_array(
      COALESCE(v_proposer_username, 'Manager') || ' sends ' || COALESCE(v_prop_player_name, '?')
        || ' to ' || COALESCE(v_target_username, 'Manager')
        || ' for ' || COALESCE(v_tgt_player_name, '?')
        || CASE WHEN v_proposal.cash_sweetener <> 0 THEN ' + €' || ABS(v_proposal.cash_sweetener) || 'M' ELSE '' END
        || CASE WHEN v_proposal.points_sweetener > 0 THEN ' + ' || v_proposal.points_sweetener || 'pts' ELSE '' END
    ),
    NOW()
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;
