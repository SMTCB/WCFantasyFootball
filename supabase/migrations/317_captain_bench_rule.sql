-- Migration 317: benching the captain moves the armband to an unstarted player.
--
-- Exploit (found 2026-11-24, dvreis, round 5): set_captain refuses a captain whose
-- match has started, but benching a played captain bypassed it. captain_id was left
-- on the benched player, so scoring fell back to the XI's top scorer as captain
-- (Haaland 2 pts out, Guler 12 pts armband: +8 net). set_lineup now reassigns
-- captain_id to the first player in the new XI whose fixture has not started.
--
-- Also: set_captain overwrote the stored round total with a player-only recompute,
-- dropping Joker / Max Cap / transfer penalties (same bug class as migration 316).
-- It now moves the stored total by the play-points difference only.

CREATE OR REPLACE FUNCTION public.set_lineup(p_squad_id uuid, p_player_out text, p_player_in text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_squad          squads;
  v_matchday_id    text;
  v_round_number   int;
  v_tournament_id  text;
  v_lock_array     text[];
  v_new_xi         text[];
  v_new_captain    text;
  v_pin_status     text;
  v_pout_status    text;
  v_is_triple      boolean;
  v_is_max_cap     boolean;
  v_old_play       numeric;
  v_new_play       numeric;
  v_mult           int;
  v_old_total      numeric;
  v_new_total      numeric;
  v_deduction      numeric := 0;
  v_gk_count       int;
  v_def_count      int;
  v_mid_count      int;
  v_fwd_count      int;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_squad.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'code', 'UNAUTHORIZED', 'error', 'Not your squad');
  END IF;

  SELECT tournament_id INTO v_tournament_id
  FROM leagues WHERE id = v_squad.league_id;

  SELECT COALESCE(
    (SELECT f.round_number
     FROM fixtures f
     WHERE f.tournament_id = v_tournament_id
       AND f.status IN ('scheduled', 'live')
     ORDER BY f.round_number ASC
     LIMIT 1),
    (regexp_match(v_squad.matchday_id, '-r(\d+)$'))[1]::int
  ) INTO v_round_number;

  v_matchday_id := v_tournament_id || '-r' || v_round_number::text;
  IF NOT EXISTS (
    SELECT 1 FROM matchday_deadlines
    WHERE tournament_id = v_tournament_id AND matchday_id = v_matchday_id
  ) THEN
    v_matchday_id  := v_squad.matchday_id;
    v_round_number := (regexp_match(v_matchday_id, '-r(\d+)$'))[1]::int;
  END IF;

  IF array_length(v_squad.starting_xi, 1) IS NULL OR array_length(v_squad.starting_xi, 1) = 0 THEN
    SELECT ARRAY_AGG(id) INTO v_squad.starting_xi
    FROM (
      SELECT id FROM players
      WHERE id = ANY(v_squad.players)
      ORDER BY (position = 'GK') DESC, array_position(v_squad.players, id)
      LIMIT 11
    ) sub;
    UPDATE squads SET starting_xi = v_squad.starting_xi WHERE id = p_squad_id;
  END IF;

  v_lock_array := ARRAY(
    SELECT jsonb_array_elements_text(
      COALESCE(v_squad.lineup_locks -> v_matchday_id, '[]'::jsonb)
    )
  );

  IF NOT (v_squad.players @> ARRAY[p_player_in]) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
  END IF;

  IF p_player_in = ANY(v_lock_array) THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'PLAYER_LOCKED',
      'error', 'This player was already subbed out this round and cannot return until next matchday'
    );
  END IF;

  IF p_player_in = ANY(v_squad.starting_xi) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player is already in the starting XI');
  END IF;

  IF NOT (p_player_out = ANY(v_squad.starting_xi)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Player to move to bench is not in the starting XI');
  END IF;

  SELECT f.status INTO v_pin_status
  FROM fixtures f
  JOIN players pl ON (
    pl.forza_team_id = f.home_team_forza_id
    OR pl.forza_team_id = f.away_team_forza_id
  )
  WHERE pl.id = p_player_in
    AND f.round_number  = v_round_number
    AND f.tournament_id = v_tournament_id
  LIMIT 1;

  IF v_pin_status IN ('live', 'finished') THEN
    RETURN jsonb_build_object(
      'ok',   false,
      'code', 'FIXTURE_COMPLETED',
      'error', 'Cannot sub in a player whose fixture has started or finished this round'
    );
  END IF;

  SELECT ARRAY_AGG(CASE WHEN x = p_player_out THEN p_player_in ELSE x END ORDER BY ord)
    INTO v_new_xi
    FROM unnest(v_squad.starting_xi) WITH ORDINALITY AS t(x, ord);

  SELECT
    COUNT(*) FILTER (WHERE position = 'GK'),
    COUNT(*) FILTER (WHERE position = 'DEF'),
    COUNT(*) FILTER (WHERE position = 'MID'),
    COUNT(*) FILTER (WHERE position = 'FWD')
  INTO v_gk_count, v_def_count, v_mid_count, v_fwd_count
  FROM players
  WHERE id = ANY(v_new_xi);

  IF v_gk_count != 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must include exactly 1 goalkeeper (got ' || v_gk_count || ')');
  END IF;
  IF v_def_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have at least 1 defender');
  END IF;
  IF v_mid_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have at least 1 midfielder');
  END IF;
  IF v_fwd_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have at least 1 forward');
  END IF;

  SELECT f.status INTO v_pout_status
  FROM fixtures f
  JOIN players pl ON (
    pl.forza_team_id = f.home_team_forza_id
    OR pl.forza_team_id = f.away_team_forza_id
  )
  WHERE pl.id = p_player_out
    AND f.round_number  = v_round_number
    AND f.tournament_id = v_tournament_id
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM chips_used
    WHERE user_id = v_squad.user_id AND league_id = v_squad.league_id
      AND chip_type = 'triple_captain' AND matchday_id = v_matchday_id
  ) INTO v_is_triple;
  SELECT EXISTS (
    SELECT 1 FROM chips_used
    WHERE user_id = v_squad.user_id AND league_id = v_squad.league_id
      AND chip_type = 'max_cap' AND matchday_id = v_matchday_id
  ) INTO v_is_max_cap;

  v_mult := CASE WHEN v_is_triple THEN 3 ELSE 2 END;

  -- Armband rule: when the captain is benched, the armband moves to the first
  -- player in the new XI whose fixture has not started (the swapped-in player
  -- always qualifies, so one exists). Never to a player who already scored: that
  -- let a manager bench a low-scoring captain and have scoring hand the armband
  -- to the XI's top scorer.
  v_new_captain := v_squad.captain_id;
  IF v_squad.captain_id IS NOT NULL AND p_player_out = v_squad.captain_id THEN
    SELECT x INTO v_new_captain
    FROM unnest(v_new_xi) WITH ORDINALITY AS t(x, ord)
    WHERE NOT EXISTS (
      SELECT 1 FROM fixtures f2
      JOIN players pl2 ON (pl2.forza_team_id = f2.home_team_forza_id OR pl2.forza_team_id = f2.away_team_forza_id)
      WHERE pl2.id = t.x AND f2.tournament_id = v_tournament_id
        AND f2.round_number = v_round_number AND f2.status IN ('live', 'finished')
    )
    ORDER BY ord LIMIT 1;
    v_new_captain := COALESCE(v_new_captain, p_player_in);
  END IF;

  -- Compare the XI before and after on the SAME formula (rounded per-player
  -- points x captain multiplier), then move the stored round total by only the
  -- difference. The stored total also carries the Joker, transfer penalties and
  -- Max Cap, none of which a swap changes — recomputing it from scratch here
  -- (the old behaviour) overstated the deduction and dropped those components.
  v_old_play := public._lineup_play_total(v_squad.starting_xi, v_squad.captain_id, v_tournament_id, v_round_number, v_mult, v_is_max_cap);
  v_new_play := public._lineup_play_total(v_new_xi,            v_new_captain, v_tournament_id, v_round_number, v_mult, v_is_max_cap);

  SELECT total INTO v_old_total
  FROM fantasy_points
  WHERE squad_id    = p_squad_id
    AND matchday_id = v_matchday_id
    AND player_id IS NULL;

  IF v_old_total IS NOT NULL THEN
    v_deduction := GREATEST(v_old_play - v_new_play, 0);

    UPDATE fantasy_points
       SET total = v_old_total + (v_new_play - v_old_play)
     WHERE squad_id    = p_squad_id
       AND matchday_id = v_matchday_id
       AND player_id IS NULL;
  END IF;

  UPDATE squads
  SET
    starting_xi  = v_new_xi,
    captain_id   = v_new_captain,
    lineup_locks = CASE
      WHEN v_pout_status IN ('live', 'finished') THEN
        jsonb_set(
          COALESCE(lineup_locks, '{}'::jsonb),
          ARRAY[v_matchday_id],
          (
            SELECT jsonb_agg(DISTINCT val)
            FROM (
              SELECT jsonb_array_elements_text(
                COALESCE(lineup_locks -> v_matchday_id, '[]'::jsonb)
              ) AS val
              UNION ALL
              SELECT p_player_out
            ) t
          )
        )
      ELSE
        COALESCE(lineup_locks, '{}'::jsonb)
    END
  WHERE id = p_squad_id;

  PERFORM aggregate_league_member_points(v_squad.league_id, v_squad.user_id);

  PERFORM _log_squad_event('lineup_swap', v_squad.league_id, v_squad.user_id, p_squad_id, v_matchday_id,
    p_player_in, p_player_out,
    jsonb_build_object('deduction_pts', v_deduction));

  IF v_new_captain IS DISTINCT FROM v_squad.captain_id THEN
    PERFORM _log_squad_event('captain_change', v_squad.league_id, v_squad.user_id, p_squad_id, v_matchday_id,
      v_new_captain, v_squad.captain_id,
      jsonb_build_object('reason', 'captain_benched', 'delta_pts', v_new_play - v_old_play));
  END IF;

  RETURN jsonb_build_object(
    'captain_id',  v_new_captain,
    'captain_changed', (v_new_captain IS DISTINCT FROM v_squad.captain_id),
    'ok',         true,
    'starting_xi', to_jsonb(v_new_xi),
    'deduction',   v_deduction,
    'locked',      (v_pout_status IN ('live', 'finished'))
  );
END;
$function$;

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
  v_is_triple      boolean;
  v_is_max_cap     boolean;
  v_mult           int;
  v_old_play       numeric;
  v_new_play       numeric;
  v_old_captain_id text;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  IF auth.uid() IS NOT NULL AND v_squad.user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not your squad');
  END IF;

  v_old_captain_id := v_squad.captain_id;

  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = v_squad.league_id;

  SELECT COALESCE(
    (SELECT f.round_number FROM fixtures f
     WHERE f.tournament_id = v_tournament_id AND f.status IN ('scheduled', 'live')
     ORDER BY f.round_number ASC LIMIT 1),
    (regexp_match(v_squad.matchday_id, '-r(\d+)$'))[1]::int
  ) INTO v_round_number;

  SELECT f.status INTO v_fixture_status
  FROM fixtures f
  JOIN players pl ON (pl.forza_team_id = f.home_team_forza_id OR pl.forza_team_id = f.away_team_forza_id)
  WHERE pl.id = p_player_id AND f.round_number = v_round_number AND f.tournament_id = v_tournament_id
  LIMIT 1;

  IF v_fixture_status IN ('live', 'finished') THEN
    RETURN jsonb_build_object(
      'ok', false, 'code', 'FIXTURE_STARTED',
      'error', 'Cannot make this player captain — their match has already started or finished this round'
    );
  END IF;

  v_matchday_id := v_tournament_id || '-r' || v_round_number;

  SELECT EXISTS (SELECT 1 FROM chips_used WHERE user_id = v_squad.user_id AND league_id = v_squad.league_id
                   AND chip_type = 'triple_captain' AND matchday_id = v_matchday_id) INTO v_is_triple;
  SELECT EXISTS (SELECT 1 FROM chips_used WHERE user_id = v_squad.user_id AND league_id = v_squad.league_id
                   AND chip_type = 'max_cap' AND matchday_id = v_matchday_id) INTO v_is_max_cap;
  v_mult := CASE WHEN v_is_triple THEN 3 ELSE 2 END;

  v_old_play := public._lineup_play_total(v_squad.starting_xi, v_old_captain_id, v_tournament_id, v_round_number, v_mult, v_is_max_cap);
  v_new_play := public._lineup_play_total(v_squad.starting_xi, p_player_id,      v_tournament_id, v_round_number, v_mult, v_is_max_cap);

  UPDATE squads SET captain_id = p_player_id WHERE id = p_squad_id;

  UPDATE fantasy_points
     SET total = total + (v_new_play - v_old_play)
   WHERE squad_id = p_squad_id AND matchday_id = v_matchday_id AND player_id IS NULL;

  PERFORM aggregate_league_member_points(v_squad.league_id, v_squad.user_id);

  PERFORM _log_squad_event('captain_change', v_squad.league_id, v_squad.user_id, p_squad_id, v_matchday_id,
    p_player_id, v_old_captain_id,
    jsonb_build_object('delta_pts', v_new_play - v_old_play));

  RETURN jsonb_build_object('ok', true, 'captain_id', p_player_id);
END;
$function$;
