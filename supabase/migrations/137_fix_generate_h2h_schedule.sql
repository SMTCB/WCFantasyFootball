-- Migration 137: Fix generate_h2h_schedule — league_members has no created_at column
-- Sort by user_id for stable, deterministic ordering instead.

CREATE OR REPLACE FUNCTION generate_h2h_schedule(
  p_league_id       uuid,
  p_start_matchday_id text
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller        uuid := auth.uid();
  v_is_comm       bool;
  v_members       uuid[];
  v_n             int;
  v_n_eff         int;
  v_half          int;
  v_cycle_rounds  int;
  v_matchday_ids  text[];
  v_n_matchdays   int;
  v_tournament_id text;
  v_md_idx        int;
  v_r             int;
  v_i             int;
  v_home          uuid;
  v_away          uuid;
  v_is_bye        bool;
  v_bye_uid       uuid;
  v_home_idx      int;
  v_away_idx      int;
  v_start_round   int;
BEGIN
  IF v_caller IS NOT NULL THEN
    SELECT (created_by = v_caller) INTO v_is_comm FROM leagues WHERE id = p_league_id;
    IF NOT v_is_comm THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  END IF;

  -- Sort by user_id for deterministic ordering (league_members has no created_at)
  SELECT array_agg(user_id ORDER BY user_id)
  INTO v_members
  FROM league_members
  WHERE league_id = p_league_id;

  v_n := coalesce(array_length(v_members, 1), 0);
  IF v_n < 2 THEN RAISE EXCEPTION 'LEAGUE_TOO_SMALL'; END IF;

  v_n_eff := v_n + (v_n % 2);
  v_half := v_n_eff / 2;
  v_cycle_rounds := v_n_eff - 1;

  IF v_n % 2 = 1 THEN v_members := array_append(v_members, NULL::uuid); END IF;

  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;
  v_start_round := (regexp_replace(p_start_matchday_id, '^.*-r', ''))::int;

  SELECT array_agg(matchday_id ORDER BY round_num)
  INTO v_matchday_ids
  FROM (
    SELECT DISTINCT matchday_id,
           (regexp_replace(matchday_id, '^.*-r', ''))::int AS round_num
    FROM fixtures
    WHERE tournament_id = v_tournament_id
      AND matchday_id IS NOT NULL
      AND (regexp_replace(matchday_id, '^.*-r', ''))::int >= v_start_round
  ) t;

  v_n_matchdays := coalesce(array_length(v_matchday_ids, 1), 0);
  IF v_n_matchdays = 0 THEN RAISE EXCEPTION 'NO_MATCHDAYS'; END IF;

  DELETE FROM h2h_schedule
  WHERE league_id = p_league_id
    AND resolved_at IS NULL
    AND (regexp_replace(matchday_id, '^.*-r', ''))::int >= v_start_round;

  v_md_idx := 1;

  <<outer_loop>>
  WHILE v_md_idx <= v_n_matchdays LOOP
    FOR v_r IN 0..v_cycle_rounds-1 LOOP
      EXIT outer_loop WHEN v_md_idx > v_n_matchdays;

      v_home := v_members[v_n_eff];
      v_away := v_members[(v_r % (v_n_eff - 1)) + 1];

      IF v_home IS NULL THEN v_is_bye := true; v_bye_uid := v_away;
      ELSIF v_away IS NULL THEN v_is_bye := true; v_bye_uid := v_home;
      ELSE v_is_bye := false; v_bye_uid := NULL; END IF;

      INSERT INTO h2h_schedule (league_id, matchday_id, home_user_id, away_user_id, is_bye, bye_user_id)
      VALUES (p_league_id, v_matchday_ids[v_md_idx],
        CASE WHEN NOT v_is_bye THEN v_home ELSE NULL END,
        CASE WHEN NOT v_is_bye THEN v_away ELSE NULL END,
        v_is_bye, v_bye_uid);

      FOR v_i IN 1..v_half-1 LOOP
        v_home_idx := ((v_r + v_i) % (v_n_eff - 1)) + 1;
        v_away_idx := (((v_r - v_i) % (v_n_eff - 1)) + (v_n_eff - 1)) % (v_n_eff - 1) + 1;
        v_home := v_members[v_home_idx];
        v_away := v_members[v_away_idx];

        IF v_home IS NULL THEN v_is_bye := true; v_bye_uid := v_away;
        ELSIF v_away IS NULL THEN v_is_bye := true; v_bye_uid := v_home;
        ELSE v_is_bye := false; v_bye_uid := NULL; END IF;

        INSERT INTO h2h_schedule (league_id, matchday_id, home_user_id, away_user_id, is_bye, bye_user_id)
        VALUES (p_league_id, v_matchday_ids[v_md_idx],
          CASE WHEN NOT v_is_bye THEN v_home ELSE NULL END,
          CASE WHEN NOT v_is_bye THEN v_away ELSE NULL END,
          v_is_bye, v_bye_uid);
      END LOOP;

      v_md_idx := v_md_idx + 1;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'matchdays_scheduled', v_md_idx - 1,
    'total_matchdays', v_n_matchdays,
    'managers', v_n,
    'cycle_length', v_cycle_rounds
  );
END;
$$;
