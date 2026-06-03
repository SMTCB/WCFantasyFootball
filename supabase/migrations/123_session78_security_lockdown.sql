-- Migration 123: Session 78 — security lockdown (authorization DD round 2)
--
-- ROOT FINDING (P0, proven on live DB): anon + authenticated hold table-wide UPDATE
-- on `squads` with column grants on EVERY column. Combined with the permissive
-- "own row" UPDATE policy, a logged-in user could PATCH their own squad directly:
--   { budget_remaining: 999, players: [any 15] }
-- bypassing execute_transfer_atomic, budget, club/position caps, and transfer limits.
-- RLS cannot restrict columns, so we add a BEFORE trigger that blocks direct client
-- writes to protected columns while still allowing the legit client writes
-- (captain_id, starting_xi, joker chip flags, and pitch/bench REORDER of the same set).
-- All budget/roster mutations must go through the SECURITY DEFINER RPCs, which run as
-- the table owner and therefore bypass this guard.

-- ── 1. squads protected-column guard ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION guard_squad_protected_columns()
RETURNS TRIGGER AS $$
DECLARE
  v_budget_cap numeric;
BEGIN
  -- Only guard direct PostgREST client writes. SECURITY DEFINER RPCs run as the
  -- owner (postgres) and the service-role key runs as service_role — both trusted.
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- A client may only create an EMPTY starting squad with a non-inflated budget.
    -- Roster is populated via transfers / the draft RPC (server side).
    IF COALESCE(array_length(NEW.players, 1), 0) <> 0 THEN
      RAISE EXCEPTION 'squad roster can only be populated via transfers or the draft (server-side)';
    END IF;
    SELECT COALESCE(budget_total, 100) INTO v_budget_cap FROM leagues WHERE id = NEW.league_id;
    IF NEW.budget_remaining > COALESCE(v_budget_cap, 100) THEN
      RAISE EXCEPTION 'squad budget cannot exceed the league starting budget';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: budget + identity columns are immutable from the client.
  IF NEW.budget_remaining IS DISTINCT FROM OLD.budget_remaining
     OR NEW.user_id        IS DISTINCT FROM OLD.user_id
     OR NEW.league_id      IS DISTINCT FROM OLD.league_id
     OR NEW.matchday_id    IS DISTINCT FROM OLD.matchday_id
     OR NEW.round_transfers IS DISTINCT FROM OLD.round_transfers THEN
    RAISE EXCEPTION 'protected squad columns (budget/identity/transfers) can only change via server RPCs';
  END IF;

  -- players may be REORDERED (pitch/bench swap of the same set) but not added to or
  -- removed from — roster changes must go through transfers.
  IF NOT ( COALESCE(NEW.players, '{}') <@ COALESCE(OLD.players, '{}')
       AND COALESCE(OLD.players, '{}') <@ COALESCE(NEW.players, '{}') ) THEN
    RAISE EXCEPTION 'squad roster changes must go through transfers (server-side)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_squad_protected_columns ON squads;
CREATE TRIGGER trg_guard_squad_protected_columns
  BEFORE INSERT OR UPDATE ON squads
  FOR EACH ROW EXECUTE FUNCTION guard_squad_protected_columns();

-- ── 2. Lock down direct draft_allocations writes ─────────────────────────────
-- Migration 117 let users UPDATE their own draft_allocations row directly, which
-- (a) lets a user set allocated_players to any roster, and (b) has no global
-- uniqueness lock, so two managers could claim the same player concurrently in a
-- no-duplicate league. Remove the direct-write policy; picks go through claim_draft_player.
DROP POLICY IF EXISTS "Users can update their own draft allocation" ON draft_allocations;

-- ── 3. claim_draft_player RPC (replaces client-side draft recovery writes) ────
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

  UPDATE draft_allocations
     SET allocated_players = v_new_players,
         unresolved_slots  = GREATEST(0, v_squad_size - array_length(v_new_players, 1)),
         allocated_at      = NOW()
   WHERE league_id = p_league_id AND user_id = v_user AND phase = p_phase;

  -- Materialize the squad once complete (server-side; bypasses the guard trigger).
  IF array_length(v_new_players, 1) >= v_squad_size THEN
    SELECT matchday_id INTO v_matchday FROM matchday_deadlines
      WHERE tournament_id = v_tournament ORDER BY deadline_at DESC LIMIT 1;
    INSERT INTO squads (league_id, user_id, matchday_id, players, budget_remaining)
    VALUES (p_league_id, v_user, v_matchday, v_new_players,
            GREATEST(0, v_budget_total - (v_spent + COALESCE(v_player.price, 0))))
    ON CONFLICT (league_id, user_id, matchday_id) DO UPDATE
      SET players = EXCLUDED.players, budget_remaining = EXCLUDED.budget_remaining;
  END IF;

  RETURN jsonb_build_object('ok', true,
    'allocated_count', array_length(v_new_players, 1),
    'done', array_length(v_new_players, 1) >= v_squad_size);
END;
$$;
REVOKE EXECUTE ON FUNCTION claim_draft_player(uuid, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION claim_draft_player(uuid, text, text) TO authenticated;

-- ── 4. activate_chip — reject spoofed p_user_id ──────────────────────────────
-- SECURITY DEFINER fn was callable with any p_user_id; a user could toggle/burn a
-- RIVAL's Triple Captain. Bind it to auth.uid() (same fix class as migration 109).
CREATE OR REPLACE FUNCTION public.activate_chip(
  p_user_id   uuid,
  p_league_id uuid,
  p_chip_type text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_squad      record;
  v_cur_val    boolean;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED',
      'error', 'You can only activate your own chips');
  END IF;

  IF p_chip_type = 'wildcard' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHIP_RETIRED',
      'error', 'The wildcard chip is no longer available');
  END IF;
  IF p_chip_type <> 'triple_captain' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown chip type: ' || p_chip_type);
  END IF;

  SELECT * INTO v_squad FROM squads
   WHERE user_id = p_user_id AND league_id = p_league_id
   ORDER BY created_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF v_squad.matchday_id IS NOT NULL AND v_squad.matchday_id <> 'active' THEN
    IF EXISTS (SELECT 1 FROM matchday_deadlines
                WHERE matchday_id = v_squad.matchday_id AND deadline_at < NOW()) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'DEADLINE_PASSED',
        'error', 'Matchday deadline has passed — chips cannot be changed.');
    END IF;
  END IF;

  v_cur_val := v_squad.is_triple_captain;
  IF NOT v_cur_val THEN
    IF EXISTS (SELECT 1 FROM chips_used
                WHERE user_id = p_user_id AND league_id = p_league_id
                  AND chip_type = p_chip_type AND matchday_id <> v_squad.matchday_id) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CHIP_ALREADY_USED',
        'error', 'This chip has already been used this season');
    END IF;
    INSERT INTO chips_used (user_id, league_id, chip_type, matchday_id)
    VALUES (p_user_id, p_league_id, p_chip_type, v_squad.matchday_id)
    ON CONFLICT (user_id, league_id, chip_type) DO UPDATE
      SET matchday_id = excluded.matchday_id, used_at = now();
  END IF;

  UPDATE squads SET is_triple_captain = NOT v_cur_val WHERE id = v_squad.id;
  RETURN jsonb_build_object('ok', true, 'active', NOT v_cur_val);
END;
$$;

-- ── 5. accept_trade_proposal — re-check the PROPOSER's budget at accept time ──
-- The cash sweetener flows proposer→target, but the guard checked the TARGET's
-- budget. Between submit and accept (up to 48h) the proposer may have spent the
-- budget, so accepting could drive the proposer negative. Check the proposer.
CREATE OR REPLACE FUNCTION public.accept_trade_proposal(p_proposal_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_proposal        trade_proposals%ROWTYPE;
  v_target_user_id  UUID;
  v_proposer_budget NUMERIC;
  v_target_budget   NUMERIC;
  v_prop_players    TEXT[];
  v_tgt_players     TEXT[];
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
  SELECT user_id INTO v_target_user_id FROM squads WHERE id = v_proposal.target_squad_id;
  IF v_target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_TARGET_SQUAD_OWNER');
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
  -- Re-validate the proposer can still afford the cash sweetener (it debits them).
  IF v_proposal.cash_sweetener > 0 AND v_proposer_budget < v_proposal.cash_sweetener THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_INSUFFICIENT_BUDGET');
  END IF;
  UPDATE squads SET players = array_remove(players, v_proposal.proposer_player_id) || ARRAY[v_proposal.target_player_id], budget_remaining = budget_remaining - v_proposal.cash_sweetener WHERE id = v_proposal.proposer_squad_id;
  UPDATE squads SET players = array_remove(players, v_proposal.target_player_id) || ARRAY[v_proposal.proposer_player_id], budget_remaining = budget_remaining + v_proposal.cash_sweetener WHERE id = v_proposal.target_squad_id;
  IF v_proposal.points_sweetener > 0 THEN
    UPDATE league_members SET total_points = total_points - v_proposal.points_sweetener WHERE league_id = v_proposal.league_id AND user_id = (SELECT user_id FROM squads WHERE id = v_proposal.proposer_squad_id);
  END IF;
  UPDATE trade_proposals SET status = 'accepted', resolved_at = NOW() WHERE id = p_proposal_id;
  UPDATE trade_proposals SET status = 'cancelled', resolved_at = NOW()
    WHERE id <> p_proposal_id AND status = 'pending'
      AND (proposer_player_id IN (v_proposal.proposer_player_id, v_proposal.target_player_id) OR target_player_id IN (v_proposal.proposer_player_id, v_proposal.target_player_id))
      AND (proposer_squad_id IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id) OR target_squad_id IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id));
  INSERT INTO league_notifications (league_id, user_id, notification_type, triggered_by_user_id, title, description, related_entity_id, related_entity_type)
  SELECT v_proposal.league_id, s.user_id, 'trade_accepted', auth.uid(), 'Trade Accepted',
    (SELECT name FROM players WHERE id = v_proposal.target_player_id) || ' is now in your squad',
    p_proposal_id, 'trade_proposal'
  FROM squads s WHERE s.id = v_proposal.proposer_squad_id;
  RETURN jsonb_build_object('ok', true);
END;
$function$;
