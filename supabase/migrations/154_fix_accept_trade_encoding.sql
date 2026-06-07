-- Migration 154: fix accept_trade_proposal Unicode encoding + repair existing entry
--
-- Problem: the function was applied with emoji/special chars as literal bytes in
-- the SQL source. Windows file encoding caused them to be stored as Latin-1 garbage
-- in the DB (e.g. chr(8644) stored as the byte sequence for 'â‡„').
--
-- Fix: replace all non-ASCII literals with chr() calls so the characters are
-- generated at query-time from their Unicode code points, bypassing file encoding.
--   chr(129309) = U+1F91D  🤝
--   chr(8644)   = U+21C4   ⇄
--   chr(8212)   = U+2014   —
--   chr(8364)   = U+20AC   €

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
  v_window_status     JSON;
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

  SELECT user_id INTO v_target_user_id   FROM squads WHERE id = v_proposal.target_squad_id;
  SELECT user_id INTO v_proposer_user_id FROM squads WHERE id = v_proposal.proposer_squad_id;

  IF v_target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_TARGET_SQUAD_OWNER');
  END IF;

  SELECT get_transfer_window_status(v_proposal.league_id) INTO v_window_status;
  IF (v_window_status->>'status') <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'WINDOW_CLOSED');
  END IF;

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

  SELECT position INTO v_proposer_position FROM players WHERE id = v_proposal.proposer_player_id;
  SELECT position INTO v_target_position   FROM players WHERE id = v_proposal.target_player_id;
  IF v_proposer_position IS DISTINCT FROM v_target_position THEN
    RETURN jsonb_build_object('ok', false, 'error', 'POSITION_MISMATCH');
  END IF;

  IF v_proposal.cash_sweetener > 0 AND v_proposer_budget < v_proposal.cash_sweetener THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_INSUFFICIENT_BUDGET');
  END IF;

  UPDATE squads
    SET players          = array_remove(players, v_proposal.proposer_player_id) || ARRAY[v_proposal.target_player_id],
        budget_remaining = budget_remaining - v_proposal.cash_sweetener
    WHERE id = v_proposal.proposer_squad_id;

  UPDATE squads
    SET players          = array_remove(players, v_proposal.target_player_id) || ARRAY[v_proposal.proposer_player_id],
        budget_remaining = budget_remaining + v_proposal.cash_sweetener
    WHERE id = v_proposal.target_squad_id;

  IF v_proposal.points_sweetener > 0 THEN
    UPDATE league_members
      SET total_points = total_points - v_proposal.points_sweetener
      WHERE league_id = v_proposal.league_id AND user_id = v_proposer_user_id;
    UPDATE league_members
      SET total_points = total_points + v_proposal.points_sweetener
      WHERE league_id = v_proposal.league_id AND user_id = v_target_user_id;
  END IF;

  UPDATE trade_proposals SET status = 'accepted', resolved_at = NOW() WHERE id = p_proposal_id;
  UPDATE trade_proposals SET status = 'cancelled', resolved_at = NOW()
    WHERE id <> p_proposal_id AND status = 'pending'
      AND (proposer_player_id IN (v_proposal.proposer_player_id, v_proposal.target_player_id)
        OR target_player_id  IN (v_proposal.proposer_player_id, v_proposal.target_player_id))
      AND (proposer_squad_id IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id)
        OR target_squad_id   IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id));

  INSERT INTO league_notifications (
    league_id, user_id, notification_type, triggered_by_user_id,
    title, description, related_entity_id, related_entity_type
  )
  SELECT v_proposal.league_id, s.user_id, 'trade_accepted', auth.uid(),
    'Trade Accepted',
    (SELECT name FROM players WHERE id = v_proposal.target_player_id) || ' is now in your squad',
    p_proposal_id, 'trade_proposal'
  FROM squads s WHERE s.id = v_proposal.proposer_squad_id;

  SELECT name INTO v_prop_player_name FROM players WHERE id = v_proposal.proposer_player_id;
  SELECT name INTO v_tgt_player_name  FROM players WHERE id = v_proposal.target_player_id;
  SELECT username INTO v_proposer_username FROM users WHERE id = v_proposer_user_id;
  SELECT username INTO v_target_username   FROM users WHERE id = v_target_user_id;

  INSERT INTO gazette_entries (league_id, entry_type, headline, bullets, published_at)
  VALUES (
    v_proposal.league_id,
    'trade_result',
    chr(129309) || ' ' || COALESCE(v_proposer_username, 'Manager')
      || ' ' || chr(8644) || ' ' || COALESCE(v_target_username, 'Manager')
      || ' ' || chr(8212) || ' deal done',
    jsonb_build_array(
      COALESCE(v_proposer_username, 'Manager') || ' sends ' || COALESCE(v_prop_player_name, '?')
        || ' to ' || COALESCE(v_target_username, 'Manager')
        || ' for ' || COALESCE(v_tgt_player_name, '?')
        || CASE WHEN v_proposal.cash_sweetener <> 0
                THEN ' + ' || chr(8364) || ABS(v_proposal.cash_sweetener) || 'M'
                ELSE '' END
        || CASE WHEN v_proposal.points_sweetener > 0
                THEN ' + ' || v_proposal.points_sweetener || 'pts'
                ELSE '' END
    ),
    NOW()
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Repair the garbled gazette entry written before this fix was applied
UPDATE gazette_entries
SET
  headline = chr(129309) || ' SB7 ' || chr(8644) || ' MFMB ' || chr(8212) || ' deal done',
  bullets  = jsonb_build_array(
    'SB7 sends Harry Souttar to MFMB for Jan Gorenc + ' || chr(8364) || '0.5M + 1pts'
  )
WHERE id = 'b52c53d4-8091-40bd-bddf-2169a2003d6c';
