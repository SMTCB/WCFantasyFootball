-- Migration 184: log delta_pts in captain_change squad_event meta
-- set_captain was logging '{}' for meta — no point delta recorded.
-- Fix: capture old fantasy_points.total before the UPDATE, compute delta, log it.
-- delta_pts > 0 = points gained, delta_pts < 0 = points lost.

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
  v_mult           int;
  v_new_total      numeric;
  v_old_total      numeric;
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

  v_matchday_id := v_tournament_id || '-r' || v_round_number;

  SELECT EXISTS (
    SELECT 1 FROM chips_used
    WHERE user_id     = v_squad.user_id
      AND league_id   = v_squad.league_id
      AND chip_type   = 'triple_captain'
      AND matchday_id = v_matchday_id
  ) INTO v_is_triple;

  v_mult := CASE WHEN v_is_triple THEN 3 ELSE 2 END;

  -- Capture old total before recompute
  SELECT COALESCE(total, 0) INTO v_old_total
  FROM fantasy_points
  WHERE squad_id    = p_squad_id
    AND matchday_id = v_matchday_id
    AND player_id IS NULL;

  SELECT COALESCE(SUM(
    ROUND(per_player.player_total) * (CASE WHEN per_player.pid = p_player_id THEN v_mult ELSE 1 END)
  ), 0)
  INTO v_new_total
  FROM (
    SELECT pms.player_id AS pid, SUM(pms.fantasy_points) AS player_total
    FROM player_match_stats pms
    JOIN fixtures f ON f.id = pms.fixture_id
    WHERE pms.player_id = ANY(v_squad.starting_xi)
      AND f.tournament_id = v_tournament_id
      AND f.round_number  = v_round_number
    GROUP BY pms.player_id
  ) per_player;

  UPDATE fantasy_points
  SET total = v_new_total
  WHERE squad_id    = p_squad_id
    AND matchday_id = v_matchday_id
    AND player_id IS NULL;

  PERFORM aggregate_league_member_points(v_squad.league_id, v_squad.user_id);

  PERFORM _log_squad_event('captain_change', v_squad.league_id, v_squad.user_id, p_squad_id, v_matchday_id,
    p_player_id, v_old_captain_id,
    jsonb_build_object('delta_pts', v_new_total - v_old_total));

  RETURN jsonb_build_object('ok', true, 'captain_id', p_player_id);
END;
$function$
;
