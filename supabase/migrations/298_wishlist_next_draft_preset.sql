-- Migration 298: wishlist draft — pre-set the Auto time before the round exists,
-- and let Auto run right up to the first kickoff
--
-- Problem: the date/time picker for an Auto draft only existed once the round's
-- window did (created when the previous round finishes). In the "next round"
-- phase the commissioner could only change the league-default mode, with no
-- date. And Auto times were capped at kickoff − 8h.
--
-- Changes:
--   1. _wishlist_next_round + get_wishlist_next_draft + set_wishlist_next_draft:
--      the commissioner pre-sets next round's Auto time (league_config key
--      wishlist_draft_next_preset = {round, at}). Rules: >= 6h from now and
--      <= first kickoff − 15 min (one scheduler tick, so the */15 cron still
--      runs it before the round starts).
--   2. create_wishlist_draft_round consumes the pre-set (mode auto at that
--      time; falls back to the suggested time, clamped, if it no longer fits
--      — commissioners are told) and notifies members.
--   3. set_wishlist_draft_mode / sync_wishlist_draft_kickoffs: Auto cap moves
--      from kickoff − 8h to kickoff − 15 min. Manual's kickoff − 8h safety net
--      is unchanged.
-- Companion: run-wishlist-draft no longer lets the 8h safety net pre-empt a
-- later Auto time.

CREATE OR REPLACE FUNCTION public._wishlist_next_round(p_league_id uuid)
RETURNS int LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_tournament_id text;
  v_last_finished int;
  v_max_row_round int;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;
  SELECT MAX(round_number) INTO v_last_finished
    FROM fixtures WHERE tournament_id = v_tournament_id AND status = 'finished';
  SELECT MAX(round_number) INTO v_max_row_round
    FROM wishlist_draft_windows WHERE league_id = p_league_id;
  IF v_last_finished IS NULL AND v_max_row_round IS NULL THEN RETURN NULL; END IF;
  RETURN GREATEST(COALESCE(v_last_finished, 0) + 1, COALESCE(v_max_row_round, 0) + 1);
END;
$$;
REVOKE EXECUTE ON FUNCTION public._wishlist_next_round(uuid) FROM anon, authenticated;

-- Read side for the commissioner panel (awaiting-round phase).
CREATE OR REPLACE FUNCTION public.get_wishlist_next_draft(p_league_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_round    int;
  v_kickoff  timestamptz;
  v_preset   jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = auth.uid() AND role = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'commissioner only');
  END IF;
  IF NOT _wishlist_is_draft_league(p_league_id) OR (_wishlist_pending_window(p_league_id)).id IS NOT NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'not applicable');
  END IF;
  v_round := _wishlist_next_round(p_league_id);
  IF v_round IS NULL THEN RETURN jsonb_build_object('available', false, 'reason', 'no round yet'); END IF;

  SELECT MIN(f.kickoff_at) INTO v_kickoff
    FROM fixtures f JOIN leagues l ON l.tournament_id = f.tournament_id
   WHERE l.id = p_league_id AND f.round_number = v_round;

  SELECT config_value INTO v_preset
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_next_preset';
  IF v_preset IS NOT NULL AND (v_preset->>'round')::int <> v_round THEN v_preset := NULL; END IF;

  RETURN jsonb_build_object(
    'available', true, 'round_number', v_round,
    'first_kickoff_at', v_kickoff,
    'latest_at', v_kickoff - interval '15 minutes',
    'preset_at', v_preset->>'at'
  );
END;
$$;

-- Write side. p_at NULL clears the pre-set.
CREATE OR REPLACE FUNCTION public.set_wishlist_next_draft(p_league_id uuid, p_at timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user     uuid := auth.uid();
  v_round    int;
  v_kickoff  timestamptz;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_user AND role = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Commissioner only');
  END IF;
  IF NOT _wishlist_is_draft_league(p_league_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_DRAFT', 'error', 'Wishlist draft only exists in draft-mode leagues');
  END IF;
  IF (_wishlist_pending_window(p_league_id)).id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_PENDING',
      'error', 'This round''s draft is already set up — change it with the round controls');
  END IF;

  v_round := _wishlist_next_round(p_league_id);
  IF v_round IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_PENDING_ROUND', 'error', 'No round to schedule yet');
  END IF;

  IF p_at IS NULL THEN
    DELETE FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_next_preset';
    RETURN jsonb_build_object('ok', true, 'cleared', true, 'round_number', v_round);
  END IF;

  SELECT MIN(f.kickoff_at) INTO v_kickoff
    FROM fixtures f JOIN leagues l ON l.tournament_id = f.tournament_id
   WHERE l.id = p_league_id AND f.round_number = v_round;

  IF p_at < NOW() + interval '6 hours' - interval '1 minute' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOO_SOON',
      'error', 'The draft time must be at least 6 hours from now so managers can prepare');
  END IF;
  IF v_kickoff IS NOT NULL AND p_at > v_kickoff - interval '15 minutes' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'AFTER_DEADLINE',
      'error', 'The draft must run before the first kickoff', 'latest_at', v_kickoff - interval '15 minutes');
  END IF;

  INSERT INTO league_config (league_id, config_key, config_value, updated_at)
  VALUES (p_league_id, 'wishlist_draft_next_preset', jsonb_build_object('round', v_round, 'at', p_at), NOW())
  ON CONFLICT (league_id, config_key) DO UPDATE
    SET config_value = EXCLUDED.config_value, updated_at = NOW();

  RETURN jsonb_build_object('ok', true, 'round_number', v_round, 'scheduled_at', p_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_wishlist_next_draft(uuid)               FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_wishlist_next_draft(uuid, timestamptz)  FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_wishlist_next_draft(uuid)               TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_wishlist_next_draft(uuid, timestamptz)  TO authenticated;

-- ── create_wishlist_draft_round (replaces 294) ──
CREATE OR REPLACE FUNCTION public.create_wishlist_draft_round(
  p_league_id      uuid,
  p_round          int,
  p_round_ended_at timestamptz,
  p_first_kickoff  timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row      wishlist_draft_windows;
  v_mode     text;
  v_seed     int;
  v_deadline timestamptz;
  v_carried  int := 0;
  v_preset   jsonb;
  v_preset_at timestamptz;
  v_time     timestamptz;
  v_cap      timestamptz;
BEGIN
  SELECT * INTO v_row FROM wishlist_draft_windows WHERE league_id = p_league_id AND round_number = p_round;
  IF v_row.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'created', false, 'mode', v_row.mode, 'status', v_row.status);
  END IF;

  IF NOT _wishlist_is_draft_league(p_league_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not a draft-mode league');
  END IF;

  v_mode := _wishlist_default_mode(p_league_id);

  -- Commissioner pre-set this round's auto time before the window existed
  -- (set_wishlist_next_draft). It wins over the league default.
  SELECT config_value INTO v_preset
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_next_preset';
  IF v_preset IS NOT NULL AND (v_preset->>'round')::int = p_round THEN
    v_mode      := 'auto';
    v_preset_at := (v_preset->>'at')::timestamptz;
  END IF;

  -- Per-league constant seed, carried forward (see migration 253).
  SELECT snake_order_seed INTO v_seed
    FROM wishlist_draft_windows WHERE league_id = p_league_id
   ORDER BY round_number DESC LIMIT 1;
  v_seed := COALESCE(v_seed, floor(random() * 1000000)::int);

  v_deadline := p_first_kickoff - interval '8 hours';

  IF v_mode = 'auto' THEN
    v_cap := p_first_kickoff - interval '15 minutes';
    IF v_preset_at IS NOT NULL
       AND v_preset_at >= NOW() + interval '6 hours' - interval '1 minute'
       AND (v_cap IS NULL OR v_preset_at <= v_cap) THEN
      v_time := v_preset_at;
    ELSE
      v_time := _wishlist_suggested_draft_at(p_round_ended_at, p_first_kickoff);
      IF v_preset_at IS NOT NULL THEN
        v_time := GREATEST(v_time, NOW() + interval '6 hours');
        IF v_cap IS NOT NULL THEN v_time := LEAST(v_time, v_cap); END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO wishlist_draft_windows
    (league_id, round_number, snake_order_seed, mode, status, scheduled_at,
     hard_deadline_at, first_kickoff_at, round_ended_at)
  VALUES
    (p_league_id, p_round, v_seed, v_mode, 'scheduled', v_time,
     v_deadline, p_first_kickoff, p_round_ended_at)
  ON CONFLICT (league_id, round_number) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- Lost a race with a concurrent caller — their row stands.
    RETURN jsonb_build_object('ok', true, 'created', false);
  END IF;

  v_carried := _wishlist_carry_over(p_league_id, p_round);

  IF v_preset IS NOT NULL THEN
    DELETE FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_next_preset';
    IF v_preset_at IS NOT NULL THEN
      INSERT INTO wishlist_draft_mode_changes
        (league_id, round_number, scope, from_mode, to_mode, to_scheduled_at)
      VALUES (p_league_id, p_round, 'round', NULL, 'auto', v_time);
      PERFORM _wishlist_notify_members(
        p_league_id, 'wishlist_draft_mode', 'Wishlist draft scheduled',
        'Round ' || p_round || ' draft runs at ' || to_char(v_time AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI')
          || ' UTC. Market closed until then (trades still allowed).',
        NULL);
      IF v_time IS DISTINCT FROM v_preset_at THEN
        PERFORM _wishlist_notify_members(
          p_league_id, 'wishlist_draft_mode', 'Wishlist draft time adjusted',
          'The time you pre-set for round ' || p_round || ' no longer fit before kickoff, so the draft was moved to '
            || to_char(v_time AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' UTC.',
          NULL, true);
      END IF;
    END IF;
  END IF;

  IF v_mode = 'disabled' THEN
    PERFORM _wishlist_open_market(p_league_id, p_round);
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'created', true, 'mode', v_mode,
    'scheduled_at', v_row.scheduled_at, 'hard_deadline_at', v_row.hard_deadline_at,
    'carried_over', v_carried
  );
END;
$$;

-- ── sync_wishlist_draft_kickoffs (replaces 294) ──
CREATE OR REPLACE FUNCTION public.sync_wishlist_draft_kickoffs()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row      wishlist_draft_windows;
  v_kickoff  timestamptz;
  v_deadline timestamptz;
  v_time     timestamptz;
  v_admin    boolean;
  v_count    int := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM wishlist_draft_windows
     WHERE status = 'scheduled' AND processed_at IS NULL AND first_kickoff_at IS NULL
     FOR UPDATE SKIP LOCKED
  LOOP
    SELECT MIN(f.kickoff_at) INTO v_kickoff
      FROM fixtures f JOIN leagues l ON l.tournament_id = f.tournament_id
     WHERE l.id = v_row.league_id AND f.round_number = v_row.round_number;
    CONTINUE WHEN v_kickoff IS NULL;

    v_deadline := v_kickoff - interval '8 hours';
    v_time     := v_row.scheduled_at;

    IF v_row.mode = 'auto' THEN
      v_admin := EXISTS (
        SELECT 1 FROM wishlist_draft_mode_changes
         WHERE league_id = v_row.league_id AND round_number = v_row.round_number AND scope = 'round'
      );
      IF NOT v_admin THEN
        v_time := GREATEST(_wishlist_suggested_draft_at(v_row.round_ended_at, v_kickoff),
                           NOW() + interval '6 hours');
      END IF;
      v_time := LEAST(v_time, v_kickoff - interval '15 minutes');
    END IF;

    UPDATE wishlist_draft_windows
       SET first_kickoff_at = v_kickoff,
           hard_deadline_at = v_deadline,
           scheduled_at     = v_time
     WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ── set_wishlist_draft_mode (replaces 294) ──
CREATE OR REPLACE FUNCTION public.set_wishlist_draft_mode(
  p_league_id    uuid,
  p_scope        text,
  p_mode         text,
  p_scheduled_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user       uuid := auth.uid();
  v_row        wishlist_draft_windows;
  v_from_mode  text;
  v_time       timestamptz;
  v_min        timestamptz := NOW() + interval '6 hours' - interval '1 minute';
  v_transfers  int := 0;
  v_title      text;
  v_desc       text;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_user AND role = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Commissioner only');
  END IF;

  IF NOT _wishlist_is_draft_league(p_league_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_DRAFT', 'error', 'Wishlist draft only exists in draft-mode leagues');
  END IF;

  IF p_mode NOT IN ('manual', 'auto', 'disabled') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_MODE', 'error', 'Mode must be manual, auto or disabled');
  END IF;

  -- League default ----------------------------------------------------------
  IF p_scope = 'default' THEN
    v_from_mode := _wishlist_default_mode(p_league_id);
    IF v_from_mode = p_mode THEN
      RETURN jsonb_build_object('ok', true, 'changed', false);
    END IF;

    INSERT INTO league_config (league_id, config_key, config_value, updated_at)
    VALUES (p_league_id, 'wishlist_draft_mode', to_jsonb(p_mode), NOW())
    ON CONFLICT (league_id, config_key) DO UPDATE
      SET config_value = EXCLUDED.config_value, updated_at = NOW();

    INSERT INTO wishlist_draft_mode_changes (league_id, round_number, scope, from_mode, to_mode, changed_by)
    VALUES (p_league_id, NULL, 'default', v_from_mode, p_mode, v_user);

    PERFORM _wishlist_notify_members(
      p_league_id, 'wishlist_draft_mode', 'Wishlist draft setting changed',
      'From the next round: ' || CASE p_mode
        WHEN 'manual'   THEN 'the commissioner runs the draft (latest 8h before kickoff).'
        WHEN 'auto'     THEN 'the draft runs automatically before each round.'
        ELSE 'no draft — free market, first come, first served.' END,
      v_user);

    RETURN jsonb_build_object('ok', true, 'changed', true, 'scope', 'default');
  END IF;

  IF p_scope <> 'round' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SCOPE', 'error', 'Scope must be round or default');
  END IF;

  -- This round only --------------------------------------------------------
  SELECT * INTO v_row FROM wishlist_draft_windows w
   WHERE w.id = (_wishlist_pending_window(p_league_id)).id
   FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_PENDING_ROUND',
      'error', 'This round''s draft has already run — change the league default to affect the next round');
  END IF;

  IF v_row.status = 'running' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DRAFT_RUNNING', 'error', 'The draft is running right now — try again in a minute');
  END IF;

  v_from_mode := v_row.mode;
  v_transfers := _wishlist_transfers_in_window(p_league_id, v_row.created_at);

  IF p_mode = 'auto' THEN
    v_time := COALESCE(
      p_scheduled_at,
      GREATEST(_wishlist_suggested_draft_at(v_row.round_ended_at, v_row.first_kickoff_at), v_min + interval '1 minute')
    );
    IF v_time < v_min THEN
      RETURN jsonb_build_object('ok', false, 'code', 'TOO_SOON',
        'error', 'The draft time must be at least 6 hours from now so managers can prepare');
    END IF;
    IF v_row.first_kickoff_at IS NOT NULL AND v_time > v_row.first_kickoff_at - interval '15 minutes' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'AFTER_DEADLINE',
        'error', 'The draft must run before the first kickoff',
        'latest_at', v_row.first_kickoff_at - interval '15 minutes');
    END IF;
  END IF;

  -- Re-enabling a draft from the free market needs the same 6h notice. With
  -- manual mode the effective time is the kickoff − 8h fallback.
  IF v_from_mode = 'disabled' AND p_mode = 'manual'
     AND v_row.hard_deadline_at IS NOT NULL AND v_row.hard_deadline_at < v_min THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOO_LATE',
      'error', 'Kickoff is too close to bring the draft back for this round — it stays a free market');
  END IF;

  IF v_from_mode = p_mode AND (p_mode <> 'auto' OR v_row.scheduled_at IS NOT DISTINCT FROM v_time) THEN
    RETURN jsonb_build_object('ok', true, 'changed', false);
  END IF;

  UPDATE wishlist_draft_windows
     SET mode             = p_mode,
         scheduled_at     = CASE WHEN p_mode = 'auto' THEN v_time END,
         reminder_sent_at = CASE WHEN p_mode = 'manual' THEN reminder_sent_at END
   WHERE id = v_row.id;

  IF p_mode = 'disabled' THEN
    PERFORM _wishlist_open_market(p_league_id, v_row.round_number);
  END IF;

  INSERT INTO wishlist_draft_mode_changes
    (league_id, round_number, scope, from_mode, to_mode, from_scheduled_at, to_scheduled_at,
     transfers_in_window, changed_by)
  VALUES
    (p_league_id, v_row.round_number, 'round', v_from_mode, p_mode, v_row.scheduled_at,
     CASE WHEN p_mode = 'auto' THEN v_time END, v_transfers, v_user);

  v_title := CASE p_mode
    WHEN 'disabled' THEN 'Market open — no wishlist draft this round'
    WHEN 'auto'     THEN 'Wishlist draft scheduled'
    ELSE                 'Wishlist draft: commissioner will run it' END;
  v_desc := CASE p_mode
    WHEN 'disabled' THEN 'Free market, first come, first served. Your wishlist is saved for later.'
    WHEN 'auto'     THEN 'Round ' || v_row.round_number || ' draft runs at '
                         || to_char(v_time AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' UTC. Market closed until then (trades still allowed).'
    ELSE                 'Round ' || v_row.round_number || ' draft will be run by the commissioner'
                         || COALESCE(' — latest ' || to_char(v_row.hard_deadline_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' UTC', '')
                         || '. Market closed until then (trades still allowed).' END;
  IF v_from_mode = 'disabled' AND p_mode <> 'disabled' AND v_transfers > 0 THEN
    v_desc := v_desc || ' ' || v_transfers || ' transfer(s) already made in the free market stand.';
  END IF;

  PERFORM _wishlist_notify_members(p_league_id, 'wishlist_draft_mode', v_title, v_desc, v_user);

  RETURN jsonb_build_object(
    'ok', true, 'changed', true, 'scope', 'round', 'round_number', v_row.round_number,
    'mode', p_mode, 'scheduled_at', CASE WHEN p_mode = 'auto' THEN v_time END,
    'transfers_in_window', v_transfers
  );
END;
$$;

