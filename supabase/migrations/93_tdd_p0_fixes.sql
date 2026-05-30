-- Migration 93: TDD P0 fixes (session 55)
-- TDD-01: atomic transfer function (eliminates budget double-spend race)
-- TDD-03: CHECK constraint (captain and joker must be different players)
-- TDD-04: draft deadline server-side enforcement trigger
-- TDD-08: penalty_scored column on player_match_stats

-- ── TDD-08: Add penalty_scored column ────────────────────────────────────────
ALTER TABLE player_match_stats
  ADD COLUMN IF NOT EXISTS penalty_scored smallint NOT NULL DEFAULT 0;

-- ── TDD-03: Prevent captain = joker stacking ──────────────────────────────────
-- Null-safe: both NULL is fine (no captain/joker set yet); same non-null value is blocked.
ALTER TABLE squads
  DROP CONSTRAINT IF EXISTS squads_captain_not_joker;

ALTER TABLE squads
  ADD CONSTRAINT squads_captain_not_joker
  CHECK (captain_id IS DISTINCT FROM joker_player_id OR captain_id IS NULL OR joker_player_id IS NULL);

-- ── TDD-04: Draft deadline server-side enforcement ────────────────────────────
CREATE OR REPLACE FUNCTION check_draft_submission_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deadline timestamptz;
BEGIN
  SELECT draft_deadline INTO v_deadline
  FROM leagues
  WHERE id = NEW.league_id;

  IF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
    RAISE EXCEPTION 'Draft deadline has passed for league %', NEW.league_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS draft_deadline_check ON draft_submissions;
CREATE TRIGGER draft_deadline_check
  BEFORE INSERT ON draft_submissions
  FOR EACH ROW EXECUTE FUNCTION check_draft_submission_deadline();

-- ── TDD-01: Atomic transfer function (SELECT FOR UPDATE row lock) ─────────────
-- Called by process-transfer edge function instead of a bare UPDATE.
-- Acquires an exclusive row lock on the squad, re-validates the key invariants
-- (budget for BUY, ownership for SELL), then applies the mutation — all in one
-- transaction so no two concurrent requests can corrupt the same squad.
CREATE OR REPLACE FUNCTION execute_transfer_atomic(
  p_squad_id  uuid,
  p_action    text,     -- 'buy' | 'sell'
  p_player_id uuid,
  p_price     numeric
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_squad      squads;
  v_new_players uuid[];
  v_new_budget  numeric;
BEGIN
  -- Acquire row lock; blocks any concurrent transfer on the same squad.
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF p_action = 'buy' THEN
    -- Re-validate inside the lock (guard against double-spend).
    IF v_squad.players @> ARRAY[p_player_id] THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OWNED',
                                'error', 'You already own this player');
    END IF;
    IF v_squad.budget_remaining < p_price THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
                                'error', 'Insufficient budget');
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

-- Grant execute to authenticated users (edge function uses service role, but keep explicit)
GRANT EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, uuid, numeric) TO service_role;
