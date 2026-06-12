-- Migration 170: set_captain self-heals fantasy_points.total for the active round
--
-- Bug: calculate-scores writes fantasy_points.total = round(sum(pitch player
-- points * captain multiplier)) whenever it runs (triggered by fixture events).
-- set_captain() only updates squads.captain_id and never re-runs that
-- calculation, so if a manager changes captain AFTER some fixtures in the
-- round have already been scored, `total` is left stale at the OLD captain's
-- multiplied value while `points_breakdown.fixtures` (multiplier-independent,
-- used for the per-player breakdown UI) is correct. Users see individual
-- player points that don't sum to the displayed GW total.
--
-- Fix: set_captain recomputes total the same way calculate-scores would for
-- a round that isn't complete yet (pitchPlayers = starting_xi, no auto-subs):
--   total = round(sum(player pts) + captain_pts * (mult - 1))
-- and writes it back to the existing fantasy_points row for (squad, matchday),
-- if one exists. points_breakdown is unaffected (already multiplier-independent).
--
-- Also corrects one known-stale row: RTrocado's squad in "Draft Mundial 26"
-- (429-r1) shows total=5 but points_breakdown sums to 2 — the captain was
-- changed after fixture f-1219437888 was scored.

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
  v_base_sum       numeric;
  v_captain_pts    numeric;
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

  SELECT
    COALESCE(SUM(pms.fantasy_points), 0),
    COALESCE(SUM(pms.fantasy_points) FILTER (WHERE pms.player_id = p_player_id), 0)
  INTO v_base_sum, v_captain_pts
  FROM player_match_stats pms
  JOIN fixtures f ON f.id = pms.fixture_id
  WHERE pms.player_id = ANY(v_squad.starting_xi)
    AND f.tournament_id = v_tournament_id
    AND f.round_number  = v_round_number;

  v_new_total := ROUND(v_base_sum + v_captain_pts * (v_mult - 1));

  UPDATE fantasy_points
  SET total = v_new_total
  WHERE squad_id    = p_squad_id
    AND matchday_id = v_matchday_id
    AND player_id IS NULL;

  RETURN jsonb_build_object('ok', true, 'captain_id', p_player_id);
END;
$function$;

-- One-off data fix: RTrocado's squad total in Draft Mundial 26 (429-r1) was
-- left stale at 5 by a captain change after fixture f-1219437888 was scored.
-- points_breakdown.fixtures sums to 0 + 2 = 2 (the correct value).
UPDATE fantasy_points
SET total = 2
WHERE id = '6efb9396-0007-47c8-92fd-cad8d7ce4ae8'
  AND squad_id = '38dd9c94-945c-46b8-b438-9a1f64bc78c7'
  AND matchday_id = '429-r1'
  AND total = 5;
