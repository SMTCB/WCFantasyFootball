-- Migration 141: Initial squad build exemption — one-way latch
--
-- Problem: managers in draft leagues sometimes receive fewer than 15 players from
-- the allocation (wish-list overlaps reduce their haul). If the first matchday
-- deadline passes before they've topped up their squad, they hit the 3-per-round
-- transfer limit immediately, even though they've never had a complete squad.
--
-- The pre-competition bypass (migration 140) covers the window before any fixture
-- kicks off. This migration covers the same gap AFTER competition has started.
--
-- Fix: add squads.initial_build_complete — a one-way latch that starts false.
-- execute_transfer_atomic skips the transfer limit while it is false. The moment
-- a buy takes the squad to 15 players the latch flips to true inside the same
-- atomic UPDATE and never resets — selling back down below 15 does NOT re-open
-- the exemption, preventing deliberate abuse.
--
-- Backfill: any squad already at 15+ players gets the latch set to true so they
-- are not accidentally granted the exemption on existing squads.

-- ── 1. Column ─────────────────────────────────────────────────────────────────

ALTER TABLE squads
  ADD COLUMN IF NOT EXISTS initial_build_complete boolean NOT NULL DEFAULT false;

-- ── 2. Backfill ───────────────────────────────────────────────────────────────
-- Squads that already have a full roster are permanently in managed mode.

UPDATE squads
SET initial_build_complete = true
WHERE array_length(players, 1) >= 15;

-- ── 3. Rebuild execute_transfer_atomic ───────────────────────────────────────

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
  v_flip_latch          bool := false;
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
  -- Two bypass conditions (either is sufficient to skip the limit):
  --   A. p_matchday_id is null or not a real '-rN' round (pre-competition, set by
  --      process-transfer/index.js when no configured matchday has started).
  --   B. initial_build_complete is false — squad has never reached 15 players.
  --      The latch is a one-way flag: it flips to true the moment a buy pushes
  --      the squad to 15. Selling back below 15 does not reset it, preventing
  --      deliberate abuse of the exemption.
  IF p_league_id IS NOT NULL AND p_matchday_id IS NOT NULL THEN
    v_matchday_round := (regexp_match(p_matchday_id, '-r(\d+)$'))[1]::int;

    IF v_matchday_round IS NOT NULL AND v_squad.initial_build_complete THEN
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

    -- Flip latch when this buy brings the squad to a full roster for the first time.
    IF NOT v_squad.initial_build_complete AND array_length(v_new_players, 1) >= 15 THEN
      v_flip_latch := true;
    END IF;

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

  -- ── Increment round_transfers counter (only when limit is enforced) ───────────
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
    SET players                = v_new_players,
        budget_remaining       = v_new_budget,
        round_transfers        = v_new_round_transfers,
        initial_build_complete = initial_build_complete OR v_flip_latch
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
