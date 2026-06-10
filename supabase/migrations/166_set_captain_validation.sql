-- Migration 166: set_captain RPC + guard against retroactive captaincy
--
-- Problem: calculate-scores recomputes the squad's matchday total from scratch on
-- every pass, applying the CURRENT captain_id's x2/x3 multiplier to that player's
-- cumulative round points (fullRoundLookup) regardless of when in the round their
-- fixture was played. With WC matchdays spanning ~6.5 days of staggered kickoffs,
-- a manager could watch a player score well in an early fixture and only THEN make
-- them captain, retroactively doubling/tripling a result that already happened —
-- pure hindsight, no risk. captain_id was also a client-writable column with no
-- fixture-status check (UI only checked starting-XI membership).
--
-- Fix: new set_captain() RPC mirrors set_lineup's active-round resolution and
-- rejects assigning the armband to a player whose fixture for the active round
-- has status IN ('live','finished'). guard_squad_protected_columns now blocks
-- direct client writes to captain_id — it must go through this RPC.

CREATE OR REPLACE FUNCTION public.set_captain(p_squad_id uuid, p_player_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_squad          squads;
  v_matchday_id    text;
  v_round_number   int;
  v_tournament_id  text;
  v_fixture_status text;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_squad.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not your squad');
  END IF;

  IF NOT (p_player_id = ANY(COALESCE(v_squad.starting_xi, '{}'))) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Only players in your starting XI can be captain');
  END IF;

  SELECT tournament_id INTO v_tournament_id
  FROM leagues WHERE id = v_squad.league_id;

  -- Active round = lowest round_number with any scheduled or live fixture,
  -- same resolution as set_lineup (avoids relying on a possibly-stale matchday_id).
  SELECT COALESCE(
    (SELECT f.round_number
     FROM fixtures f
     WHERE f.tournament_id = v_tournament_id
       AND f.status IN ('scheduled', 'live')
     ORDER BY f.round_number ASC
     LIMIT 1),
    (regexp_match(v_squad.matchday_id, '-r(\d+)$'))[1]::int
  ) INTO v_round_number;

  SELECT f.status INTO v_fixture_status
  FROM fixtures f
  JOIN players pl ON (
    pl.forza_team_id = f.home_team_forza_id
    OR pl.forza_team_id = f.away_team_forza_id
  )
  WHERE pl.id = p_player_id
    AND f.round_number  = v_round_number
    AND f.tournament_id = v_tournament_id
  LIMIT 1;

  IF v_fixture_status IN ('live', 'finished') THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'FIXTURE_STARTED',
      'error', 'Cannot make this player captain — their match has already started or finished this round'
    );
  END IF;

  UPDATE squads SET captain_id = p_player_id WHERE id = p_squad_id;

  RETURN jsonb_build_object('ok', true, 'captain_id', p_player_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_captain(uuid, text) TO authenticated;

-- Block direct client writes to captain_id — must go through set_captain() above.
CREATE OR REPLACE FUNCTION public.guard_squad_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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

  -- captain_id can only be REASSIGNED via set_captain() (migration 166), which
  -- validates the candidate's fixture hasn't already started this round. The
  -- initial null -> first-player auto-default (SquadScreen first load) is still
  -- allowed directly since no fixture result can have been "seen" yet.
  IF NEW.captain_id IS DISTINCT FROM OLD.captain_id AND OLD.captain_id IS NOT NULL THEN
    RAISE EXCEPTION 'captain can only be changed via set_captain (server-side)';
  END IF;

  -- players may be REORDERED (pitch/bench swap of the same set) but not added to or
  -- removed from — roster changes must go through transfers.
  IF NOT ( COALESCE(NEW.players, '{}') <@ COALESCE(OLD.players, '{}')
       AND COALESCE(OLD.players, '{}') <@ COALESCE(NEW.players, '{}') ) THEN
    RAISE EXCEPTION 'squad roster changes must go through transfers (server-side)';
  END IF;

  RETURN NEW;
END;
$function$;
