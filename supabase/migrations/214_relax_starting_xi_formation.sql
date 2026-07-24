-- ✅ APPLIED TO PRODUCTION 2026-06-28 (v2 session)
-- Migration 194: relax starting-XI formation rule.
--
-- Reported bug: managers couldn't field a 2-defender XI. Old rule was
-- 1 GK, 3-5 DEF, 2-5 MID, 1-3 FWD (11 total). New rule (per product
-- direction): exactly 1 GK, at least 1 DEF/MID/FWD, 11 total — no upper
-- bound on any outfield position beyond the 11-player cap itself.
--
-- Affected: (a) set_lineup() — server-authoritative gate for every lineup
-- swap; (b) leagues.min_formation — 18 leagues have an explicit override
-- row baked in at league-creation time with the old {GK:1,DEF:3,MID:2,FWD:1}
-- value, which takes precedence over the client default in useLeagueConfig.js
-- (already updated in this PR) and must be migrated too. Pre-change snapshot:
-- backups/leagues_min_formation_pre_194_20260628.json.

-- ── set_lineup(): exactly 1 GK, at least 1 DEF/MID/FWD ───────────────────────

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
  v_pin_status     text;
  v_pout_status    text;
  v_is_triple      boolean;
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
    WHERE user_id     = v_squad.user_id
      AND league_id   = v_squad.league_id
      AND chip_type   = 'triple_captain'
      AND matchday_id = v_matchday_id
  ) INTO v_is_triple;

  v_mult := CASE WHEN v_is_triple THEN 3 ELSE 2 END;

  SELECT COALESCE(SUM(
    ROUND(per_player.player_total) * (CASE WHEN per_player.pid = v_squad.captain_id THEN v_mult ELSE 1 END)
  ), 0)
  INTO v_new_total
  FROM (
    SELECT pms.player_id AS pid, SUM(pms.fantasy_points) AS player_total
    FROM player_match_stats pms
    JOIN fixtures f ON f.id = pms.fixture_id
    WHERE pms.player_id = ANY(v_new_xi)
      AND f.tournament_id = v_tournament_id
      AND f.round_number  = v_round_number
    GROUP BY pms.player_id
  ) per_player;

  SELECT total INTO v_old_total
  FROM fantasy_points
  WHERE squad_id    = p_squad_id
    AND matchday_id = v_matchday_id
    AND player_id IS NULL;

  IF v_old_total IS NOT NULL THEN
    v_deduction := GREATEST(v_old_total - v_new_total, 0);

    UPDATE fantasy_points
       SET total = v_new_total
     WHERE squad_id    = p_squad_id
       AND matchday_id = v_matchday_id
       AND player_id IS NULL;
  END IF;

  UPDATE squads
  SET
    starting_xi  = v_new_xi,
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

  RETURN jsonb_build_object(
    'ok',         true,
    'starting_xi', to_jsonb(v_new_xi),
    'deduction',   v_deduction,
    'locked',      (v_pout_status IN ('live', 'finished'))
  );
END;
$function$;

-- ── leagues.min_formation: drop the old 3-5/2-5/1-3 override on all 18 leagues ───

UPDATE leagues
SET min_formation = '{"GK": 1, "DEF": 1, "MID": 1, "FWD": 1}'::jsonb
WHERE min_formation = '{"DEF": 3, "FWD": 1, "GK": 1, "MID": 2}'::jsonb;
