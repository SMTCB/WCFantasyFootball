-- Migration 177: align set_lineup() mid-round total recompute with calculate-scores v27
--
-- B-07 fix: set_lineup's mid-round self-heal of fantasy_points.total previously
-- subtracted ROUND(benched_player_raw_points) from the existing total whenever
-- the benched player's fixture had already finished. This under-deducted when
-- the benched player was the squad's captain (or triple captain) — their points
-- had been counted with a x2/x3 multiplier by calculate-scores, but only the
-- un-multiplied amount was removed, leaving a stale surplus on fantasy_points.total
-- and the leaderboard until the round completed.
--
-- Fix: replace the incremental deduction with the same full recompute used by
-- set_captain (migration 176) / calculate-scores v27 — total = SUM over the NEW
-- starting_xi of ROUND(player's round points) * (captain/triple mult or 1).
-- This is correct for ANY lineup change (captain benched, non-captain benched,
-- etc.) since it's derived from scratch each time, not incrementally adjusted.
-- The returned 'deduction' (used for the SquadScreen toast) becomes
-- old_total - new_total, reflecting the true point change including any
-- multiplier effect.
--
-- All guards (ownership, lock checks, formation validation, lineup_locks) are
-- unchanged. CREATE OR REPLACE — additive, no data is dropped or deleted.

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

  -- Fetch tournament first — needed to resolve the active round.
  SELECT tournament_id INTO v_tournament_id
  FROM leagues WHERE id = v_squad.league_id;

  -- Active round = lowest round_number with any scheduled or live fixture.
  -- Avoids relying on squad.matchday_id which may be stale (never advanced if
  -- no transfers made since the draft).
  SELECT COALESCE(
    (SELECT f.round_number
     FROM fixtures f
     WHERE f.tournament_id = v_tournament_id
       AND f.status IN ('scheduled', 'live')
     ORDER BY f.round_number ASC
     LIMIT 1),
    (regexp_match(v_squad.matchday_id, '-r(\d+)$'))[1]::int
  ) INTO v_round_number;

  -- Resolve matchday_id string from round number.
  -- Format is always '{tournament_id}-r{N}' — verify it exists, else fall back.
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

  IF v_gk_count < 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must include at least 1 goalkeeper');
  END IF;
  IF v_def_count < 3 OR v_def_count > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 3–5 defenders (got ' || v_def_count || ')');
  END IF;
  IF v_mid_count < 2 OR v_mid_count > 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 2–5 midfielders (got ' || v_mid_count || ')');
  END IF;
  IF v_fwd_count < 1 OR v_fwd_count > 3 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Starting XI must have 1–3 forwards (got ' || v_fwd_count || ')');
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

  -- B-07: recompute fantasy_points.total for the active round using the FULL
  -- v27 formula — SUM over the NEW starting XI of ROUND(player's round points)
  -- times the captain/triple-captain multiplier (1 for everyone else). This is
  -- the same formula calculate-scores v27 and set_captain (migration 176) use,
  -- so it is correct regardless of whether the benched/subbed-in player is the
  -- captain. 'deduction' (shown in the SquadScreen toast) is old_total - new_total.
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

  -- Refresh the cached league-wide total / rank so the leaderboard reflects
  -- the corrected fantasy_points.total immediately (same as set_captain,
  -- migration 171/176).
  PERFORM aggregate_league_member_points(v_squad.league_id, v_squad.user_id);

  RETURN jsonb_build_object(
    'ok',         true,
    'starting_xi', to_jsonb(v_new_xi),
    'deduction',   v_deduction,
    'locked',      (v_pout_status IN ('live', 'finished'))
  );
END;
$function$
;
