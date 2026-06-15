-- Migration 176: align set_captain() self-heal with calculate-scores v27
--
-- B-05 fix (round-per-player, not round-of-sum): calculate-scores v27 now computes
-- a squad's matchday total as SUM over starting XI of ROUND(raw player points) * mult,
-- matching the per-player points shown everywhere in the UI (SquadScreen/RecapView/
-- LiveScreen use Math.round(player.points) * mult). set_captain()'s mid-round
-- self-heal previously used ROUND(sum_of_raw + captain_raw*(mult-1)) — "round of sum" —
-- which could disagree with the new formula by 1-3 points after a captain change.
--
-- This migration only changes the v_new_total computation inside set_captain(); all
-- guards (ownership, FIXTURE_STARTED, etc.) and the surrounding control flow are
-- unchanged. CREATE OR REPLACE — additive, no data is dropped or deleted.

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

  -- Self-heal fantasy_points.total for the active round so the squad total
  -- reflects the new captain's multiplier immediately, rather than waiting for
  -- the next calculate-scores pass (only triggered by fixture events).
  v_matchday_id := v_tournament_id || '-r' || v_round_number;

  SELECT EXISTS (
    SELECT 1 FROM chips_used
    WHERE user_id     = v_squad.user_id
      AND league_id   = v_squad.league_id
      AND chip_type   = 'triple_captain'
      AND matchday_id = v_matchday_id
  ) INTO v_is_triple;

  v_mult := CASE WHEN v_is_triple THEN 3 ELSE 2 END;

  -- B-05: round each starting-XI player's accumulated round points BEFORE applying
  -- the captain multiplier, then sum — matches calculate-scores v27 / UI display.
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

  -- Refresh the cached league-wide total / rank so the leaderboard reflects
  -- the corrected fantasy_points.total immediately.
  PERFORM aggregate_league_member_points(v_squad.league_id, v_squad.user_id);

  RETURN jsonb_build_object('ok', true, 'captain_id', p_player_id);
END;
$function$
;
