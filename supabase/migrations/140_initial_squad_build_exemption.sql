-- Migration 140: Initial squad build exemption from transfer limits
--
-- Problem: Managers who join a league mid-competition (or were unable to build
-- their squad while fixtures were live) get blocked after just 3 buys because
-- each buy into an empty/partial squad counts against the per-round transfer
-- limit. The transfer limit concept is for *swapping* players in an already-
-- built squad — not for building that squad in the first place.
--
-- Fix: In execute_transfer_atomic, skip both the transfer-limit check AND the
-- counter increment whenever the squad currently holds fewer players than
-- p_squad_max (the caller-supplied max squad size). Enforcement only kicks in
-- once the squad is full, so all subsequent buy/sell actions count normally.
--
-- Loophole note: a manager with a full squad who sells a player (back to 14)
-- gets one free re-buy (14 < 15). The sell itself still costs a transfer credit,
-- so the marginal benefit is small and acceptable in the context of fixing the
-- more impactful initial-build blockage.
--
-- Data fix: Reset round_transfers to {} on all squads that currently have fewer
-- than 15 players and carry a non-zero transfer count — these credits were all
-- spent on initial builds that should have been free.

-- ── 1. Rebuild execute_transfer_atomic ───────────────────────────────────────
-- Signature is unchanged from migration 114 (p_player_id TEXT, p_squad_max
-- default 99) so no callers need updating.

DROP FUNCTION IF EXISTS execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text);

CREATE OR REPLACE FUNCTION execute_transfer_atomic(
  p_squad_id    uuid,
  p_action      text,
  p_player_id   text,
  p_price       numeric,
  p_pos_limit   int  DEFAULT 99,
  p_squad_max   int  DEFAULT 99,
  p_club_max    int  DEFAULT 99,
  p_league_id   uuid DEFAULT NULL,
  p_matchday_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_squad               squads;
  v_new_players         text[];
  v_new_budget          numeric;
  v_new_round_transfers jsonb;
  v_player_pos          text;
  v_player_team         text;
  v_pos_count           int;
  v_club_count          int;
  v_transfers_per_round int  := 3;
  v_wildcard_round      int  := NULL;
  v_used_transfers      int  := 0;
  v_matchday_round      int;
  v_enforce_limit       bool := false;
  v_server_price        numeric;
  v_current_size        int;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_squad.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not your squad');
  END IF;

  SELECT price INTO v_server_price FROM players WHERE id = p_player_id;
  IF v_server_price IS NULL AND p_action = 'buy' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_FOUND', 'error', 'Player not found');
  END IF;
  IF v_server_price IS NULL THEN v_server_price := 0; END IF;

  -- ── Transfer limit enforcement ────────────────────────────────────────────────
  --
  -- Phase 1 — Initial squad build exemption:
  --   If a real squad_max was supplied (< 99) and the squad is currently below
  --   that size, the manager is still building their initial roster. Don't count
  --   this action against the per-round transfer limit and don't enforce it.
  --   v_enforce_limit stays false → counter is not incremented below.
  --
  -- Phase 2 — Standard enforcement for complete squads:
  --   Only fires when both league and matchday are known AND the matchday_id
  --   parses as a canonical round (e.g. '623-r1'). Non-standard IDs like
  --   'current' return NULL from regexp_match and are also skipped (migration 114).

  v_current_size := COALESCE(array_length(v_squad.players, 1), 0);

  IF p_squad_max < 99 AND v_current_size < p_squad_max THEN
    -- Initial squad build — exempt from transfer limit entirely.
    -- v_enforce_limit stays false; fall through to buy/sell logic.
    NULL;

  ELSIF p_league_id IS NOT NULL AND p_matchday_id IS NOT NULL THEN
    v_matchday_round := (regexp_match(p_matchday_id, '-r(\d+)$'))[1]::int;

    -- NULL round = non-standard matchday (e.g. 'current') → skip limit check
    IF v_matchday_round IS NOT NULL THEN
      SELECT (config_value #>> '{}')::int INTO v_transfers_per_round
        FROM league_config
       WHERE league_id = p_league_id AND config_key = 'transfers_per_round';
      IF v_transfers_per_round IS NULL THEN v_transfers_per_round := 3; END IF;

      SELECT (config_value #>> '{}')::int INTO v_wildcard_round
        FROM league_config
       WHERE league_id = p_league_id AND config_key = 'transfer_wildcard_round';

      IF v_wildcard_round IS NULL OR v_matchday_round IS DISTINCT FROM v_wildcard_round THEN
        v_enforce_limit  := true;
        v_used_transfers := COALESCE(
          (v_squad.round_transfers ->> p_matchday_id)::int, 0
        );
        IF v_used_transfers >= v_transfers_per_round THEN
          RETURN jsonb_build_object(
            'ok',    false,
            'code',  'TRANSFER_LIMIT_REACHED',
            'error', 'Transfer limit reached — ' || v_transfers_per_round ||
                     ' transfers allowed per round'
          );
        END IF;
      END IF;
    END IF;
  END IF;

  -- ── Buy ──────────────────────────────────────────────────────────────────────
  IF p_action = 'buy' THEN
    IF v_squad.players @> ARRAY[p_player_id] THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OWNED',
                                'error', 'You already own this player');
    END IF;

    IF array_length(v_squad.players, 1) >= p_squad_max THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL',
                                'error', 'Squad is full — sell a player first');
    END IF;

    IF v_squad.budget_remaining < v_server_price THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
                                'error', 'Insufficient budget');
    END IF;

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
    v_new_budget  := round((v_squad.budget_remaining - v_server_price)::numeric, 1);

  -- ── Sell ─────────────────────────────────────────────────────────────────────
  ELSIF p_action = 'sell' THEN
    IF NOT (v_squad.players @> ARRAY[p_player_id]) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
    END IF;
    v_new_players := array_remove(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining + v_server_price)::numeric, 1);

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown action');
  END IF;

  -- ── Increment round_transfers counter (only when enforcing) ──────────────────
  IF v_enforce_limit THEN
    v_new_round_transfers := jsonb_set(
      COALESCE(v_squad.round_transfers, '{}'::jsonb),
      ARRAY[p_matchday_id],
      to_jsonb(v_used_transfers + 1)
    );
  ELSE
    v_new_round_transfers := COALESCE(v_squad.round_transfers, '{}'::jsonb);
  END IF;

  UPDATE squads
    SET players          = v_new_players,
        budget_remaining = v_new_budget,
        round_transfers  = v_new_round_transfers
  WHERE id = p_squad_id;

  RETURN jsonb_build_object(
    'ok',               true,
    'players',          to_jsonb(v_new_players),
    'budget_remaining', v_new_budget
  );
END;
$$;

GRANT EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) FROM anon;

-- ── 2. Reset stale transfer counters on incomplete squads ─────────────────────
-- Any squad with fewer than 15 players that has a non-zero round_transfers
-- counter was blocked from completing its initial build. Clear the counter so
-- those managers can immediately continue adding players.

UPDATE squads
SET round_transfers = '{}'::jsonb
WHERE
  COALESCE(array_length(players, 1), 0) < 15
  AND round_transfers <> '{}'::jsonb;
