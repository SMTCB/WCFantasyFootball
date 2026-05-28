-- supabase/migrations/85_trade_proposals.sql

-- ─── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trade_proposals (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id           UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  proposer_squad_id   UUID        NOT NULL REFERENCES squads(id)  ON DELETE CASCADE,
  target_squad_id     UUID        NOT NULL REFERENCES squads(id)  ON DELETE CASCADE,
  proposer_player_id  TEXT        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  target_player_id    TEXT        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  cash_sweetener      NUMERIC(6,1) NOT NULL DEFAULT 0 CHECK (cash_sweetener >= 0),
  points_sweetener    INT          NOT NULL DEFAULT 0,
  status              TEXT        NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','rejected','cancelled','expired')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at          TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),
  resolved_at         TIMESTAMPTZ
);

CREATE INDEX idx_trade_proposals_proposer ON trade_proposals(proposer_squad_id, status);
CREATE INDEX idx_trade_proposals_target   ON trade_proposals(target_squad_id,   status);
CREATE INDEX idx_trade_proposals_league   ON trade_proposals(league_id, created_at DESC);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE trade_proposals ENABLE ROW LEVEL SECURITY;

-- Any league member can read proposals in their league
CREATE POLICY "trade_proposals_select"
  ON trade_proposals FOR SELECT
  USING (
    league_id IN (
      SELECT league_id FROM league_members WHERE user_id = auth.uid()
    )
  );

-- Inserts are via RPC (SECURITY DEFINER), direct inserts blocked
CREATE POLICY "trade_proposals_insert_denied"
  ON trade_proposals FOR INSERT
  WITH CHECK (false);

-- Updates are via RPC (SECURITY DEFINER), direct updates blocked
CREATE POLICY "trade_proposals_update_denied"
  ON trade_proposals FOR UPDATE
  USING (false);

-- ─── RPC: submit_trade_proposal ───────────────────────────────────────────────

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
  v_proposer_user_id UUID;
  v_proposer_players TEXT[];
  v_target_players   TEXT[];
  v_proposer_budget  NUMERIC;
  v_proposer_points  NUMERIC;
  v_new_proposal_id  UUID;
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

  -- Reject negative sweeteners
  IF p_cash_sweetener < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'INVALID_SWEETENER');
  END IF;

  -- Validate proposer budget covers positive cash sweetener (paying out cash)
  IF p_cash_sweetener > 0 THEN
    IF v_proposer_budget < p_cash_sweetener THEN
      RETURN jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_BUDGET');
    END IF;
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
    p_league_id,
    s.user_id,
    'trade_proposal',
    auth.uid(),
    'New Trade Offer',
    (SELECT name FROM players WHERE id = p_proposer_player_id)
      || ' for '
      || (SELECT name FROM players WHERE id = p_target_player_id),
    v_new_proposal_id,
    'trade_proposal'
  FROM squads s
  WHERE s.id = p_target_squad_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── RPC: accept_trade_proposal ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION accept_trade_proposal(
  p_proposal_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_proposal        trade_proposals%ROWTYPE;
  v_target_user_id  UUID;
  v_proposer_budget NUMERIC;
  v_target_budget   NUMERIC;
  v_prop_players    TEXT[];
  v_tgt_players     TEXT[];
BEGIN
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id;

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

  -- Caller must own the target squad
  SELECT user_id INTO v_target_user_id FROM squads WHERE id = v_proposal.target_squad_id;
  IF v_target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_TARGET_SQUAD_OWNER');
  END IF;

  -- Re-check players still in squads (may have changed since proposal)
  SELECT players, budget_remaining INTO v_prop_players, v_proposer_budget
    FROM squads WHERE id = v_proposal.proposer_squad_id;
  SELECT players, budget_remaining INTO v_tgt_players, v_target_budget
    FROM squads WHERE id = v_proposal.target_squad_id;

  IF NOT (v_proposal.proposer_player_id = ANY(v_prop_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;
  IF NOT (v_proposal.target_player_id = ANY(v_tgt_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;

  -- Validate target has budget if they need to pay cash (negative sweetener is blocked at submit time,
  -- but re-validate at accept time in case of data inconsistency)
  IF v_proposal.cash_sweetener > 0 AND v_target_budget < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_INSUFFICIENT_BUDGET');
  END IF;

  -- Atomic swap: move players
  -- Proposer squad: remove their player, add target player
  -- cash_sweetener > 0 means proposer is paying target, so proposer loses cash, target gains cash
  UPDATE squads
    SET players = array_remove(players, v_proposal.proposer_player_id)
                  || ARRAY[v_proposal.target_player_id],
        budget_remaining = budget_remaining - v_proposal.cash_sweetener
    WHERE id = v_proposal.proposer_squad_id;

  -- Target squad: remove their player, add proposer's player
  UPDATE squads
    SET players = array_remove(players, v_proposal.target_player_id)
                  || ARRAY[v_proposal.proposer_player_id],
        budget_remaining = budget_remaining + v_proposal.cash_sweetener
    WHERE id = v_proposal.target_squad_id;

  -- Deduct points sweetener from proposer
  IF v_proposal.points_sweetener > 0 THEN
    UPDATE league_members
      SET total_points = total_points - v_proposal.points_sweetener
      WHERE league_id = v_proposal.league_id
        AND user_id = (SELECT user_id FROM squads WHERE id = v_proposal.proposer_squad_id);
  END IF;

  -- Mark this proposal accepted
  UPDATE trade_proposals
    SET status = 'accepted', resolved_at = NOW()
    WHERE id = p_proposal_id;

  -- Cancel other pending proposals that involved either traded player
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

  -- Notify proposer that their offer was accepted
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

-- ─── RPC: reject_trade_proposal ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION reject_trade_proposal(
  p_proposal_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_proposal       trade_proposals%ROWTYPE;
  v_target_user_id UUID;
BEGIN
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id;

  IF v_proposal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_FOUND');
  END IF;

  IF v_proposal.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_PENDING');
  END IF;

  SELECT user_id INTO v_target_user_id FROM squads WHERE id = v_proposal.target_squad_id;

  IF v_target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_TARGET_SQUAD_OWNER');
  END IF;

  UPDATE trade_proposals
    SET status = 'rejected', resolved_at = NOW()
    WHERE id = p_proposal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─── RPC: cancel_trade_proposal ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cancel_trade_proposal(
  p_proposal_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_proposal          trade_proposals%ROWTYPE;
  v_proposer_user_id  UUID;
BEGIN
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id;

  IF v_proposal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_FOUND');
  END IF;

  IF v_proposal.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_PENDING');
  END IF;

  SELECT user_id INTO v_proposer_user_id FROM squads WHERE id = v_proposal.proposer_squad_id;

  IF v_proposer_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_PROPOSER');
  END IF;

  UPDATE trade_proposals
    SET status = 'cancelled', resolved_at = NOW()
    WHERE id = p_proposal_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;
