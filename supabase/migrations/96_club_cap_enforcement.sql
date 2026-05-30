-- Migration 96: Club cap enforcement (max N players per club/team)
-- Adds p_club_max parameter to execute_transfer_atomic() so the per-club
-- limit is validated inside the SELECT FOR UPDATE lock — concurrent buys
-- cannot both pass the same club count at the same time.
--
-- The process-transfer edge function passes p_club_max = 3 for all BUY
-- requests. The default (99) means "no limit", so existing callers that
-- don't pass the param are unaffected.

CREATE OR REPLACE FUNCTION execute_transfer_atomic(
  p_squad_id   uuid,
  p_action     text,
  p_player_id  uuid,
  p_price      numeric,
  p_pos_limit  int  DEFAULT 99,   -- position cap (99 = no limit)
  p_squad_max  int  DEFAULT 15,   -- maximum squad size
  p_club_max   int  DEFAULT 99    -- max players from the same club/team (99 = no limit)
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_squad         squads;
  v_new_players   uuid[];
  v_new_budget    numeric;
  v_player_pos    text;
  v_player_team   text;   -- forza_team_id of the incoming player
  v_pos_count     int;
  v_club_count    int;
BEGIN
  -- Acquire row lock; blocks any concurrent transfer on the same squad.
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF p_action = 'buy' THEN
    -- ── Already owned ──────────────────────────────────────────────────────────
    IF v_squad.players @> ARRAY[p_player_id] THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OWNED',
                                'error', 'You already own this player');
    END IF;

    -- ── Squad size ─────────────────────────────────────────────────────────────
    IF array_length(v_squad.players, 1) >= p_squad_max THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL',
                                'error', 'Squad is full — sell a player first');
    END IF;

    -- ── Budget ─────────────────────────────────────────────────────────────────
    IF v_squad.budget_remaining < p_price THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
                                'error', 'Insufficient budget');
    END IF;

    -- ── Position cap (inside lock to block concurrent same-position buys) ──────
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

    -- ── Club cap (inside lock to block concurrent same-club buys) ──────────────
    IF p_club_max < 99 THEN
      SELECT p.forza_team_id INTO v_player_team FROM players p WHERE p.id = p_player_id;
      IF v_player_team IS NOT NULL THEN
        SELECT COUNT(*) INTO v_club_count
          FROM players p
          WHERE p.id = ANY(v_squad.players)
            AND p.forza_team_id = v_player_team;
        IF v_club_count >= p_club_max THEN
          RETURN jsonb_build_object('ok', false, 'code', 'CLUB_LIMIT',
            'error', 'Maximum ' || p_club_max || ' players from the same club');
        END IF;
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

GRANT EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, uuid, numeric, int, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, uuid, numeric, int, int, int) TO authenticated;
