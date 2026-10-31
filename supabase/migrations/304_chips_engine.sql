-- Migration 304: Chips engine — Triple Captain, Joker (×2, once per tournament), Max Cap
--
-- NOT YET APPLIED. Needs explicit approval + a pre-migration backup (CLAUDE.md Pilot Safeguards).
--
-- What this adds
--   1. Per-league admin switch: league_config('chips_disabled') = JSON array of chip ids
--      (missing key = every chip enabled, fail-open so existing leagues are unchanged).
--   2. get_my_chips(league)      — single read RPC the Squad "Chips" tab uses. chips_used and
--      daily_jokers have RLS on with no policies, so the client cannot read them directly.
--   3. activate_chip(...)        — rewritten: triple_captain + max_cap, toggle on/off until the
--      round deadline, once per tournament (league), honours chips_disabled, and the two
--      captain chips cannot be stacked in the same round.
--   4. set_joker / clear_joker   — Joker is once per tournament (league) and scored ×2.
--
-- The "open round" is the league tournament's next matchday_deadlines row (deadline_at >= now()),
-- not squads.matchday_id, which can go stale when sync-squad-matchdays is not running.
--
-- Scoring (Joker ×2, Max Cap) lives in supabase/functions/calculate-scores — deploy separately.
-- Existing multi-round daily_jokers rows are left untouched (no new unique index).

-- ── helpers ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._chips_open_round(p_league_id uuid)
RETURNS TABLE (matchday_id text, deadline_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT d.matchday_id, d.deadline_at
    FROM matchday_deadlines d
    JOIN leagues l ON l.tournament_id = d.tournament_id
   WHERE l.id = p_league_id AND d.deadline_at >= now()
   ORDER BY d.deadline_at
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public._chip_enabled(p_league_id uuid, p_chip text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT COALESCE((
    SELECT jsonb_typeof(config_value) = 'array' AND config_value @> to_jsonb(p_chip)
      FROM league_config
     WHERE league_id = p_league_id AND config_key = 'chips_disabled'
  ), false);
$$;

REVOKE ALL ON FUNCTION public._chips_open_round(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._chip_enabled(uuid, text)    FROM PUBLIC, anon, authenticated;

-- ── get_my_chips ──────────────────────────────────────────────────────────────
-- status: active | used | disabled | locked | blocked | available
CREATE OR REPLACE FUNCTION public.get_my_chips(p_league_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_round     record;
  v_has_round boolean;
  v_disabled  jsonb;
  v_chips     jsonb := '{}'::jsonb;
  v_type      text;
  v_row       record;
  v_status    text;
  v_cap_active boolean;
  v_joker     record;
  v_jname     text;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not a member of this league');
  END IF;

  SELECT * INTO v_round FROM _chips_open_round(p_league_id);
  v_has_round := FOUND;

  SELECT CASE WHEN jsonb_typeof(config_value) = 'array' THEN config_value ELSE '[]'::jsonb END
    INTO v_disabled FROM league_config
   WHERE league_id = p_league_id AND config_key = 'chips_disabled';
  v_disabled := COALESCE(v_disabled, '[]'::jsonb);

  -- A captain chip already active this round blocks the other one.
  SELECT EXISTS (
    SELECT 1 FROM chips_used
     WHERE user_id = v_uid AND league_id = p_league_id
       AND chip_type IN ('triple_captain', 'max_cap')
       AND v_has_round AND matchday_id = v_round.matchday_id
  ) INTO v_cap_active;

  FOREACH v_type IN ARRAY ARRAY['triple_captain', 'max_cap'] LOOP
    SELECT * INTO v_row FROM chips_used
     WHERE user_id = v_uid AND league_id = p_league_id AND chip_type = v_type;
    IF FOUND AND v_has_round AND v_row.matchday_id = v_round.matchday_id THEN
      v_status := 'active';
    ELSIF FOUND THEN
      v_status := 'used';
    ELSIF v_disabled @> to_jsonb(v_type) THEN
      v_status := 'disabled';
    ELSIF NOT v_has_round THEN
      v_status := 'locked';
    ELSIF v_cap_active THEN
      v_status := 'blocked';
    ELSE
      v_status := 'available';
    END IF;
    v_chips := v_chips || jsonb_build_object(v_type, jsonb_build_object(
      'status', v_status, 'matchday_id', CASE WHEN FOUND THEN v_row.matchday_id END));
  END LOOP;

  -- Joker: once per tournament — any row for this league means it has been spent.
  SELECT * INTO v_joker FROM daily_jokers
   WHERE user_id = v_uid AND league_id = p_league_id
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    SELECT name INTO v_jname FROM players WHERE id = v_joker.player_id;
    v_status := CASE WHEN v_has_round AND v_joker.matchday_id = v_round.matchday_id THEN 'active' ELSE 'used' END;
  ELSIF v_disabled @> '"joker"'::jsonb THEN
    v_status := 'disabled';
  ELSIF NOT v_has_round THEN
    v_status := 'locked';
  ELSE
    v_status := 'available';
  END IF;
  v_chips := v_chips || jsonb_build_object('joker', jsonb_build_object(
    'status', v_status,
    'matchday_id', v_joker.matchday_id,
    'player_id', v_joker.player_id,
    'player_name', v_jname));

  RETURN jsonb_build_object(
    'ok', true,
    'round', CASE WHEN v_has_round THEN jsonb_build_object(
               'matchday_id', v_round.matchday_id, 'deadline_at', v_round.deadline_at) END,
    'disabled', v_disabled,
    'chips', v_chips);
END;
$$;

-- ── activate_chip (triple_captain | max_cap) — toggles ────────────────────────
CREATE OR REPLACE FUNCTION public.activate_chip(
  p_user_id   uuid,
  p_league_id uuid,
  p_chip_type text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_round     record;
  v_existing  record;
  v_squad_id  uuid;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'You can only activate your own chips');
  END IF;
  IF p_chip_type = 'wildcard' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHIP_RETIRED', 'error', 'The wildcard chip is no longer available');
  END IF;
  IF p_chip_type NOT IN ('triple_captain', 'max_cap') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNKNOWN_CHIP', 'error', 'Unknown chip type: ' || p_chip_type);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = p_user_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not a member of this league');
  END IF;

  SELECT * INTO v_round FROM _chips_open_round(p_league_id);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DEADLINE_PASSED',
      'error', 'No open round — chips cannot be changed right now.');
  END IF;

  SELECT * INTO v_existing FROM chips_used
   WHERE user_id = p_user_id AND league_id = p_league_id AND chip_type = p_chip_type;

  -- Already active this round → deactivate (frees the chip for a later round).
  IF FOUND AND v_existing.matchday_id = v_round.matchday_id THEN
    DELETE FROM chips_used WHERE id = v_existing.id;
    IF p_chip_type = 'triple_captain' THEN
      UPDATE squads SET is_triple_captain = false WHERE user_id = p_user_id AND league_id = p_league_id;
    END IF;
    RETURN jsonb_build_object('ok', true, 'active', false);
  END IF;

  IF FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHIP_ALREADY_USED',
      'error', 'This chip has already been used this tournament');
  END IF;

  IF NOT _chip_enabled(p_league_id, p_chip_type) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHIP_DISABLED',
      'error', 'Your league admin has turned this chip off');
  END IF;

  IF EXISTS (SELECT 1 FROM chips_used
              WHERE user_id = p_user_id AND league_id = p_league_id
                AND chip_type IN ('triple_captain', 'max_cap')
                AND matchday_id = v_round.matchday_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CAPTAIN_CHIP_ACTIVE',
      'error', 'Another captain chip is already active this round');
  END IF;

  INSERT INTO chips_used (user_id, league_id, chip_type, matchday_id)
  VALUES (p_user_id, p_league_id, p_chip_type, v_round.matchday_id);

  IF p_chip_type = 'triple_captain' THEN
    SELECT id INTO v_squad_id FROM squads
     WHERE user_id = p_user_id AND league_id = p_league_id
     ORDER BY created_at DESC LIMIT 1;
    UPDATE squads SET is_triple_captain = true WHERE id = v_squad_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'active', true);
END;
$$;

-- ── set_joker / clear_joker ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_joker(p_league_id uuid, p_player_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_round    record;
  v_existing record;
  v_tid      text;
  v_squad_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not a member of this league');
  END IF;

  SELECT * INTO v_round FROM _chips_open_round(p_league_id);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DEADLINE_PASSED',
      'error', 'No open round — the Joker cannot be changed right now.');
  END IF;

  SELECT * INTO v_existing FROM daily_jokers
   WHERE user_id = v_uid AND league_id = p_league_id
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND AND v_existing.matchday_id IS DISTINCT FROM v_round.matchday_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHIP_ALREADY_USED',
      'error', 'The Joker has already been used this tournament');
  END IF;
  IF NOT FOUND AND NOT _chip_enabled(p_league_id, 'joker') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHIP_DISABLED',
      'error', 'Your league admin has turned this chip off');
  END IF;

  SELECT tournament_id INTO v_tid FROM leagues WHERE id = p_league_id;
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_id AND tournament_id = v_tid) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PLAYER_NOT_FOUND', 'error', 'Player not found in this tournament');
  END IF;
  IF EXISTS (SELECT 1 FROM squads
              WHERE user_id = v_uid AND league_id = p_league_id AND players @> ARRAY[p_player_id]) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'JOKER_OWN_SQUAD',
      'error', 'The Joker must be a player outside your squad');
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE daily_jokers SET player_id = p_player_id WHERE id = v_existing.id;
  ELSE
    INSERT INTO daily_jokers (user_id, league_id, player_id, matchday_id)
    VALUES (v_uid, p_league_id, p_player_id, v_round.matchday_id);
  END IF;

  SELECT id INTO v_squad_id FROM squads
   WHERE user_id = v_uid AND league_id = p_league_id ORDER BY created_at DESC LIMIT 1;
  UPDATE squads SET joker_player_id = p_player_id WHERE id = v_squad_id;

  RETURN jsonb_build_object('ok', true, 'active', true, 'player_id', p_player_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_joker(p_league_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_round record;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not signed in');
  END IF;
  SELECT * INTO v_round FROM _chips_open_round(p_league_id);
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DEADLINE_PASSED', 'error', 'Deadline has passed — the Joker is locked.');
  END IF;
  -- Only this round's pick can be withdrawn; a past round's joker stays spent.
  DELETE FROM daily_jokers
   WHERE user_id = v_uid AND league_id = p_league_id AND matchday_id = v_round.matchday_id;
  UPDATE squads SET joker_player_id = NULL WHERE user_id = v_uid AND league_id = p_league_id;
  RETURN jsonb_build_object('ok', true, 'active', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_chips(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_chip(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_joker(uuid, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_joker(uuid)              TO authenticated;
