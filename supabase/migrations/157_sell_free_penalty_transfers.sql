-- Migration 157: Sell-free transfers + penalty transfers beyond free limit
--
-- BUG FIX:
--   execute_transfer_atomic previously counted BOTH buy AND sell against the
--   per-round transfer limit. In standard fantasy football, selling a player is
--   free — only BUYING consumes a free transfer slot. This migration corrects the
--   behaviour: sells skip the limit check and counter entirely.
--
-- NEW FEATURE — Penalty Transfers:
--   Instead of hard-blocking buys over the free limit, additional buys are now
--   allowed but incur a point deduction at scoring time.
--   Cost is configured per league via league_config key 'transfer_penalty':
--     • Number  →  flat cost per extra buy  (e.g. 4  → 4 pts each)
--     • Array   →  escalating cost          (e.g. [1,2,4] → 1st extra=1pt, 2nd=2pt, 3rd+=4pt)
--   Default: 4 (FPL-standard: 4 pts per extra transfer)
--   Penalty count tracked in squads.penalty_transfers JSONB (same format as
--   round_transfers: { "623-r3": 2 } = 2 penalty buys in round 3).
--   Deduction applied in calculate-scores Edge Function (v23).
--
-- DATA FIX:
--   Reset round_transfers for all currently-active matchday rounds (where no
--   fixture has yet been scored) so old sell-inclusive counts don't block managers.
--   Specifically: remove '623-r3' key from all squads (the int'l-friendly test
--   tournament active right now). Historical rounds are left unchanged.

-- ── 1. New column: penalty_transfers ─────────────────────────────────────────

ALTER TABLE public.squads
  ADD COLUMN IF NOT EXISTS penalty_transfers JSONB NOT NULL DEFAULT '{}';

-- ── 2. Seed transfer_penalty config for existing leagues ─────────────────────
--   Default: 4 pts per extra transfer (FPL standard).
--   Commissioners can override via league_config at any time.

INSERT INTO public.league_config (league_id, config_key, config_value)
SELECT id, 'transfer_penalty', '4'::jsonb
FROM public.leagues
WHERE NOT EXISTS (
  SELECT 1 FROM public.league_config
  WHERE league_id = leagues.id AND config_key = 'transfer_penalty'
);

-- ── 3. Data fix: reset active-round transfer counters ────────────────────────
--   Removes the '623-r3' key from any squad that has one, because those counts
--   include sells that should not have been charged. After this migration,
--   only future BUYs will increment the counter, so managers get a clean slate
--   for the remainder of the current round.

UPDATE public.squads
SET round_transfers = round_transfers - '623-r3'
WHERE round_transfers ? '623-r3';

-- ── 4. Rebuild execute_transfer_atomic ───────────────────────────────────────
--
--   Key behavioural changes vs. migration 141:
--
--   SELL:
--     • Limit check skipped entirely — selling is always free.
--     • round_transfers counter NOT incremented for sells.
--
--   BUY within free limit (round_transfers[matchday_id] < transfers_per_round):
--     • Unchanged — check passes, round_transfers incremented by 1.
--
--   BUY over free limit (round_transfers[matchday_id] >= transfers_per_round):
--     • Previously returned TRANSFER_LIMIT_REACHED (blocked). Now: allowed.
--     • penalty_transfers[matchday_id] incremented by 1 instead of blocking.
--     • Point deduction applied at scoring time by calculate-scores (reads
--       penalty_transfers and the 'transfer_penalty' league_config key).
--
--   All other guards (budget, position cap, club cap, duplicate, squad size)
--   are unchanged.

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
  v_new_penalty_transfers jsonb;
  v_player_pos          text;
  v_player_team         text;
  v_pos_count           int;
  v_club_count          int;
  v_transfers_per_round int  := 3;
  v_wildcard_round      int  := NULL;
  v_used_transfers      int  := 0;
  v_used_penalty        int  := 0;
  v_matchday_round      int;
  -- v_enforce_buy_limit: true when a BUY should be checked/counted against the free limit.
  -- SELL never sets this — selling is always free.
  v_enforce_buy_limit   bool := false;
  -- v_penalty_buy: true when this BUY exceeds the free limit and costs penalty points.
  v_penalty_buy         bool := false;
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

  -- ── Transfer limit enforcement (BUY only) ────────────────────────────────────
  --
  -- Sells NEVER count against the limit — skip entirely when action = 'sell'.
  --
  -- For buys, two bypass conditions (either skips the limit check):
  --   A. p_matchday_id is null or not a real '-rN' round (pre-competition).
  --   B. initial_build_complete is false — squad has never reached 15 players.
  --
  -- When the limit applies and the free allowance is exhausted, the buy is
  -- permitted but marked as a penalty buy (v_penalty_buy = true).

  IF p_action = 'buy'
     AND p_league_id IS NOT NULL
     AND p_matchday_id IS NOT NULL THEN

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
        v_used_transfers := COALESCE(
          (v_squad.round_transfers ->> p_matchday_id)::int, 0
        );

        IF v_used_transfers < v_transfers_per_round THEN
          -- Within free limit: will increment round_transfers
          v_enforce_buy_limit := true;
        ELSE
          -- Over free limit: allow but charge penalty points at scoring time
          v_penalty_buy := true;
          v_used_penalty := COALESCE(
            (v_squad.penalty_transfers ->> p_matchday_id)::int, 0
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

    -- Flip initial_build_complete latch when this buy brings the squad to 15 for the first time.
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

  -- ── Update counters ───────────────────────────────────────────────────────────
  -- round_transfers: increment only for free-limit buys.
  -- penalty_transfers: increment only for over-limit buys.
  -- Sells: neither counter changes.

  IF v_enforce_buy_limit THEN
    v_new_round_transfers := jsonb_set(
      COALESCE(v_squad.round_transfers, '{}'::jsonb),
      ARRAY[p_matchday_id],
      to_jsonb(v_used_transfers + 1)
    );
  ELSE
    v_new_round_transfers := COALESCE(v_squad.round_transfers, '{}'::jsonb);
  END IF;

  IF v_penalty_buy THEN
    v_new_penalty_transfers := jsonb_set(
      COALESCE(v_squad.penalty_transfers, '{}'::jsonb),
      ARRAY[p_matchday_id],
      to_jsonb(v_used_penalty + 1)
    );
  ELSE
    v_new_penalty_transfers := COALESCE(v_squad.penalty_transfers, '{}'::jsonb);
  END IF;

  UPDATE squads
    SET players                = v_new_players,
        budget_remaining       = v_new_budget,
        round_transfers        = v_new_round_transfers,
        penalty_transfers      = v_new_penalty_transfers,
        initial_build_complete = initial_build_complete OR v_flip_latch
  WHERE id = p_squad_id;

  RETURN jsonb_build_object(
    'ok',                  true,
    'players',             to_jsonb(v_new_players),
    'budget_remaining',    v_new_budget,
    'penalty_buy',         v_penalty_buy,
    'free_transfers_used', CASE WHEN v_enforce_buy_limit THEN v_used_transfers + 1 ELSE v_used_transfers END,
    'penalty_count',       CASE WHEN v_penalty_buy THEN v_used_penalty + 1 ELSE v_used_penalty END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) TO service_role;
REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, text, numeric, int, int, int, uuid, text) FROM anon;
