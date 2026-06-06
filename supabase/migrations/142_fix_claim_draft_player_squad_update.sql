-- Migration 142: Fix claim_draft_player squad materialisation
--
-- Bug C: when a manager completes their squad via the recovery screen, claim_draft_player
-- tried to INSERT a new squad row using:
--   SELECT matchday_id FROM matchday_deadlines ORDER BY deadline_at DESC LIMIT 1
-- which (without a future filter) picks the FURTHEST deadline in the tournament
-- (e.g. r7 for a 7-round tournament), not the active round.
--
-- For a tournament with r1–r7, this creates a dangling squad at matchday_id='429-r7'
-- instead of updating the existing squad at '429-r1' that run-draft-lottery created.
-- The manager then has two squad rows: the real one (r1, with partial allocation) and
-- the dangling one (r7, never used for transfers or scoring).
--
-- Fix: instead of INSERT, find the manager's existing squad for this league (ORDER BY
-- created_at DESC — the most recently created row is their current active squad) and
-- UPDATE it. If no squad exists (late joiner with no lottery row), INSERT with the
-- nearest upcoming deadline, falling back to the most recent past deadline.
--
-- This also sets initial_build_complete correctly when the squad reaches 15 players,
-- consistent with the latch logic in execute_transfer_atomic (migration 141).

CREATE OR REPLACE FUNCTION claim_draft_player(
  p_league_id uuid,
  p_player_id text,
  p_phase     text DEFAULT 'group'
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user         uuid := auth.uid();
  v_squad_size   int;
  v_pos_caps     jsonb;
  v_budget_total numeric;
  v_tournament   text;
  v_alloc        draft_allocations%ROWTYPE;
  v_player       players%ROWTYPE;
  v_pos          text;
  v_pos_count    int;
  v_spent        numeric;
  v_matchday     text;
  v_new_players  text[];
  v_squad_id     uuid;
  v_new_budget   numeric;
  v_is_complete  bool;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  -- Serialize picks within this league+phase so two managers can't claim the same
  -- player concurrently (the no-duplicate invariant has no DB-level array uniqueness).
  PERFORM pg_advisory_xact_lock(hashtext(p_league_id::text || ':' || p_phase));

  IF NOT EXISTS (SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_user) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a league member');
  END IF;

  SELECT squad_size, position_limits, budget_total, tournament_id
    INTO v_squad_size, v_pos_caps, v_budget_total, v_tournament
    FROM leagues WHERE id = p_league_id;
  v_squad_size   := COALESCE(v_squad_size, 15);
  v_budget_total := COALESCE(v_budget_total, 100);

  SELECT * INTO v_player FROM players WHERE id = p_player_id;
  IF v_player.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not found');
  END IF;
  IF v_tournament IS NOT NULL AND v_player.tournament_id IS DISTINCT FROM v_tournament THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not in league tournament');
  END IF;

  -- Global uniqueness: not already allocated to anyone in this league+phase.
  IF EXISTS (
    SELECT 1 FROM draft_allocations
     WHERE league_id = p_league_id AND phase = p_phase
       AND p_player_id = ANY(allocated_players)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PLAYER_TAKEN', 'error', 'Player already drafted');
  END IF;

  SELECT * INTO v_alloc FROM draft_allocations
   WHERE league_id = p_league_id AND user_id = v_user AND phase = p_phase
   FOR UPDATE;
  IF v_alloc.user_id IS NULL THEN
    INSERT INTO draft_allocations (league_id, user_id, phase, allocated_players, unresolved_slots, allocated_at)
    VALUES (p_league_id, v_user, p_phase, ARRAY[]::text[], v_squad_size, NOW())
    RETURNING * INTO v_alloc;
  END IF;

  IF p_player_id = ANY(COALESCE(v_alloc.allocated_players, ARRAY[]::text[])) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Already in your squad');
  END IF;
  IF COALESCE(array_length(v_alloc.allocated_players, 1), 0) >= v_squad_size THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL', 'error', 'Squad is full');
  END IF;

  v_pos := upper(COALESCE(v_player.position, 'MID'));
  IF v_pos NOT IN ('GK','DEF','MID','FWD') THEN v_pos := 'MID'; END IF;
  IF v_pos_caps ? v_pos THEN
    SELECT count(*) INTO v_pos_count FROM players
      WHERE id = ANY(v_alloc.allocated_players) AND upper(position) = v_pos;
    IF v_pos_count >= (v_pos_caps ->> v_pos)::int THEN
      RETURN jsonb_build_object('ok', false, 'code', 'POSITION_LIMIT', 'error', 'Position limit reached');
    END IF;
  END IF;

  SELECT COALESCE(SUM(price), 0) INTO v_spent FROM players WHERE id = ANY(v_alloc.allocated_players);
  IF v_spent + COALESCE(v_player.price, 0) > v_budget_total THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET', 'error', 'Over budget');
  END IF;

  v_new_players := COALESCE(v_alloc.allocated_players, ARRAY[]::text[]) || ARRAY[p_player_id];
  v_new_budget  := GREATEST(0, v_budget_total - (v_spent + COALESCE(v_player.price, 0)));
  v_is_complete := array_length(v_new_players, 1) >= v_squad_size;

  UPDATE draft_allocations
     SET allocated_players = v_new_players,
         unresolved_slots  = GREATEST(0, v_squad_size - array_length(v_new_players, 1)),
         allocated_at      = NOW()
   WHERE league_id = p_league_id AND user_id = v_user AND phase = p_phase;

  -- ── Squad materialisation ────────────────────────────────────────────────────
  -- Update the manager's existing squad (created by run-draft-lottery with the
  -- correct matchday_id) rather than INSERTing a new row. This avoids the bug
  -- where claim_draft_player would stamp the squad with the wrong matchday_id
  -- (furthest future deadline instead of the active round).
  --
  -- We update on every pick (not just when complete) so the squad screen shows
  -- live progress during recovery, not just the final allocation.
  SELECT id INTO v_squad_id
    FROM squads
   WHERE league_id = p_league_id AND user_id = v_user
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_squad_id IS NOT NULL THEN
    UPDATE squads
       SET players                = v_new_players,
           budget_remaining       = v_new_budget,
           initial_build_complete = v_is_complete
     WHERE id = v_squad_id;
  ELSE
    -- Late joiner: no squad row from the lottery. Create one with the nearest
    -- upcoming deadline; fall back to the most recent past deadline if needed.
    SELECT matchday_id INTO v_matchday
      FROM matchday_deadlines
     WHERE tournament_id = v_tournament AND deadline_at > NOW()
     ORDER BY deadline_at ASC LIMIT 1;

    IF v_matchday IS NULL THEN
      SELECT matchday_id INTO v_matchday
        FROM matchday_deadlines
       WHERE tournament_id = v_tournament
       ORDER BY deadline_at DESC LIMIT 1;
    END IF;

    INSERT INTO squads (league_id, user_id, matchday_id, players, budget_remaining, initial_build_complete)
    VALUES (p_league_id, v_user, COALESCE(v_matchday, 'current'),
            v_new_players, v_new_budget, v_is_complete)
    ON CONFLICT (league_id, user_id, matchday_id) DO UPDATE
      SET players                = EXCLUDED.players,
          budget_remaining       = EXCLUDED.budget_remaining,
          initial_build_complete = EXCLUDED.initial_build_complete;
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'allocated_count', array_length(v_new_players, 1),
    'done',            v_is_complete
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION claim_draft_player(uuid, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION claim_draft_player(uuid, text, text) TO authenticated;
