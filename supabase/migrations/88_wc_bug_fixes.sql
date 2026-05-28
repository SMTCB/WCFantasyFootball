-- Migration 88: WC bug fixes
-- Fixes: WC-07 (duplicate trade proposals), WC-01 (get_league_stats 404), IMP-B (WC matchday deadlines)

-- ─── WC-07: Guard against proposing a player already in a pending proposal ────

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

  -- Guard: reject if proposer_player already has a pending proposal in this league
  IF EXISTS (
    SELECT 1 FROM trade_proposals
    WHERE proposer_squad_id = p_proposer_squad_id
      AND proposer_player_id = p_proposer_player_id
      AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PLAYER_ALREADY_PROPOSED');
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

-- ─── WC-01: Create get_league_stats RPC ───────────────────────────────────────

CREATE OR REPLACE FUNCTION get_league_stats(p_league_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_member_count INT;
  v_avg_points   NUMERIC;
BEGIN
  SELECT
    COUNT(*)::INT,
    ROUND(AVG(total_points)::NUMERIC, 0)
  INTO v_member_count, v_avg_points
  FROM league_members
  WHERE league_id = p_league_id;

  RETURN jsonb_build_object(
    'member_count', v_member_count,
    'avg_points',   COALESCE(v_avg_points, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_league_stats(UUID) TO authenticated;

-- ─── IMP-B: Seed WC 2026 matchday deadlines ───────────────────────────────────
-- tournament_id 429 = World Cup 2026
-- Deadlines set to 17:00 UTC on first match day of each round
-- Group stage: Rounds 1-3; Knockouts: Round 4 onwards

INSERT INTO matchday_deadlines (tournament_id, matchday_id, deadline_at) VALUES
  ('429', '429-r1', '2026-06-11 17:00:00+00'),
  ('429', '429-r2', '2026-06-22 17:00:00+00'),
  ('429', '429-r3', '2026-06-26 17:00:00+00'),
  ('429', '429-r4', '2026-07-02 17:00:00+00'),
  ('429', '429-r5', '2026-07-05 17:00:00+00'),
  ('429', '429-r6', '2026-07-09 17:00:00+00'),
  ('429', '429-r7', '2026-07-14 17:00:00+00')
ON CONFLICT (matchday_id) DO NOTHING;
