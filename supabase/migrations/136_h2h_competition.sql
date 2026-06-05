-- Migration 136: Draft + H2H parallel competition mode
-- Adds h2h_enabled flag to leagues, h2h_schedule table, and supporting RPCs.
-- H2H scoring: configurable W/D/L points stored in league_config (defaults: 5/2/0).
-- All H2H logic is additive — zero changes to fantasy_points or scoring pipeline.

-- ── 1. Add h2h_enabled to leagues ─────────────────────────────────────────────

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS h2h_enabled boolean DEFAULT false NOT NULL;

-- ── 2. h2h_schedule table ─────────────────────────────────────────────────────
-- Stores both the schedule (pre-play, scores null) and results (post-resolution).
-- Bye rows: is_bye=true, home/away_user_id null, bye_user_id = the manager getting the bye.

CREATE TABLE IF NOT EXISTS h2h_schedule (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  matchday_id     text NOT NULL,
  home_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  away_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  is_bye          boolean NOT NULL DEFAULT false,
  bye_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  home_score      numeric,     -- fantasy_points.total for home manager, null until resolved
  away_score      numeric,
  home_h2h_pts    integer,     -- configured win/draw/loss pts, null until resolved
  away_h2h_pts    integer,     -- null for bye rows
  resolved_at     timestamptz,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE h2h_schedule ENABLE ROW LEVEL SECURITY;

-- League members can read schedule + results
CREATE POLICY "h2h_schedule_league_members_select"
  ON h2h_schedule FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = h2h_schedule.league_id
        AND lm.user_id = auth.uid()
    )
  );

-- No direct INSERT/UPDATE for authenticated users — all writes go through SECURITY DEFINER RPCs

-- ── 3. Update create_league — add p_h2h_enabled parameter ────────────────────
-- Drop existing full overload (4 params) and recreate with 5th param (default false).
-- Existing callers with 4 args still work via the default.

DROP FUNCTION IF EXISTS create_league(text, text, uuid, text);

CREATE FUNCTION create_league(
  p_name          text,
  p_format        text,
  p_user_id       uuid,          -- ignored; auth.uid() used instead
  p_tournament_id text,
  p_h2h_enabled   boolean DEFAULT false
) RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_caller    uuid := auth.uid();
  v_league    leagues%ROWTYPE;
  v_join_code text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: must be authenticated to create a league';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tournaments WHERE forza_id = p_tournament_id) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND: tournament % does not exist', p_tournament_id;
  END IF;

  v_join_code := upper(substring(md5(random()::text) for 6));

  INSERT INTO leagues (name, format, tournament_id, created_by, join_code, h2h_enabled)
  VALUES (p_name, p_format::league_format, p_tournament_id, v_caller, v_join_code, p_h2h_enabled)
  RETURNING * INTO v_league;

  INSERT INTO league_members (league_id, user_id, role)
  VALUES (v_league.id, v_caller, 'commissioner')
  ON CONFLICT (league_id, user_id) DO NOTHING;

  -- Seed league_config defaults (existing keys + H2H scoring keys)
  INSERT INTO league_config (league_id, config_key, config_value)
  VALUES
    (v_league.id, 'transfers_per_round',      '3'::jsonb),
    (v_league.id, 'transfer_reopen_hours',    '6'::jsonb),
    (v_league.id, 'transfer_wildcard_round',  'null'::jsonb),
    (v_league.id, 'club_cap_default',         '3'::jsonb),
    (v_league.id, 'club_cap_tier1_threshold', '8'::jsonb),
    (v_league.id, 'club_cap_tier1_value',     '4'::jsonb),
    (v_league.id, 'club_cap_tier2_threshold', '4'::jsonb),
    (v_league.id, 'club_cap_tier2_value',     '5'::jsonb),
    (v_league.id, 'club_cap_tier3_threshold', '2'::jsonb),
    (v_league.id, 'club_cap_tier3_value',     'null'::jsonb),
    (v_league.id, 'lineup_lock_per_fixture',  'true'::jsonb),
    (v_league.id, 'h2h_win_pts',              '5'::jsonb),
    (v_league.id, 'h2h_draw_pts',             '2'::jsonb),
    (v_league.id, 'h2h_loss_pts',             '0'::jsonb)
  ON CONFLICT (league_id, config_key) DO NOTHING;

  RETURN row_to_json(v_league);
END;
$$;

-- Also seed H2H config for any existing h2h-enabled leagues (retroactive safety)
INSERT INTO league_config (league_id, config_key, config_value)
SELECT id, 'h2h_win_pts',  '5'::jsonb FROM leagues WHERE h2h_enabled = true
ON CONFLICT (league_id, config_key) DO NOTHING;
INSERT INTO league_config (league_id, config_key, config_value)
SELECT id, 'h2h_draw_pts', '2'::jsonb FROM leagues WHERE h2h_enabled = true
ON CONFLICT (league_id, config_key) DO NOTHING;
INSERT INTO league_config (league_id, config_key, config_value)
SELECT id, 'h2h_loss_pts', '0'::jsonb FROM leagues WHERE h2h_enabled = true
ON CONFLICT (league_id, config_key) DO NOTHING;

-- ── 4. generate_h2h_schedule RPC ─────────────────────────────────────────────
-- Commissioner-only. Generates a round-robin schedule from p_start_matchday_id
-- onwards for all league members. Repeats the cycle until all matchdays are covered.
-- Odd manager count: one manager gets a bye (auto-win) per matchday, rotating evenly.
-- Uses the Berger circle method: one team is fixed, others rotate each round.
-- Safe to call again — deletes unresolved future rows before regenerating.

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
  -- Auth: must be commissioner (or service-role for seeding)
  IF v_caller IS NOT NULL THEN
    SELECT (created_by = v_caller)
    INTO v_is_comm
    FROM leagues WHERE id = p_league_id;

    IF NOT v_is_comm THEN
      RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;
  END IF;

  -- Get league members ordered by join time
  SELECT array_agg(user_id ORDER BY created_at)
  INTO v_members
  FROM league_members
  WHERE league_id = p_league_id;

  v_n := coalesce(array_length(v_members, 1), 0);
  IF v_n < 2 THEN
    RAISE EXCEPTION 'LEAGUE_TOO_SMALL: need at least 2 members';
  END IF;

  -- Round up to even (odd → add NULL as bye slot at the end of the array)
  v_n_eff := v_n + (v_n % 2);
  v_half := v_n_eff / 2;
  v_cycle_rounds := v_n_eff - 1;

  IF v_n % 2 = 1 THEN
    v_members := array_append(v_members, NULL::uuid);
  END IF;

  -- Get tournament
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;

  -- Extract start round number from matchday_id (format: '{tid}-rN')
  v_start_round := (regexp_replace(p_start_matchday_id, '^.*-r', ''))::int;

  -- Get all matchday IDs for this tournament from start round onwards, sorted by round
  SELECT array_agg(matchday_id ORDER BY round_num)
  INTO v_matchday_ids
  FROM (
    SELECT DISTINCT
      matchday_id,
      (regexp_replace(matchday_id, '^.*-r', ''))::int AS round_num
    FROM fixtures
    WHERE tournament_id = v_tournament_id
      AND matchday_id IS NOT NULL
      AND (regexp_replace(matchday_id, '^.*-r', ''))::int >= v_start_round
  ) t;

  v_n_matchdays := coalesce(array_length(v_matchday_ids, 1), 0);
  IF v_n_matchdays = 0 THEN
    RAISE EXCEPTION 'NO_MATCHDAYS: no matchdays found from %', p_start_matchday_id;
  END IF;

  -- Delete any unresolved schedule rows for matchdays at or after start (safe re-generate)
  DELETE FROM h2h_schedule
  WHERE league_id = p_league_id
    AND resolved_at IS NULL
    AND (regexp_replace(matchday_id, '^.*-r', ''))::int >= v_start_round;

  -- ── Generate round-robin schedule (Berger circle method) ──────────────────
  -- v_members[v_n_eff] is the FIXED team (does not rotate).
  -- v_members[1..v_n_eff-1] rotate counterclockwise each round.
  -- Formula for round v_r (0-indexed):
  --   Match 0: fixed (v_members[v_n_eff]) vs v_members[(v_r % (v_n_eff-1)) + 1]
  --   Match i (i=1..half-1):
  --     home_idx = ((v_r + i) % (v_n_eff-1)) + 1
  --     away_idx = (((v_r - i) % (v_n_eff-1)) + (v_n_eff-1)) % (v_n_eff-1) + 1

  v_md_idx := 1;

  <<outer_loop>>
  WHILE v_md_idx <= v_n_matchdays LOOP
    FOR v_r IN 0..v_cycle_rounds-1 LOOP
      EXIT outer_loop WHEN v_md_idx > v_n_matchdays;

      -- Match 0: fixed team vs rotating team at position (v_r % (v_n_eff-1))
      v_home := v_members[v_n_eff];
      v_away := v_members[(v_r % (v_n_eff - 1)) + 1];

      IF v_home IS NULL THEN
        v_is_bye := true; v_bye_uid := v_away;
      ELSIF v_away IS NULL THEN
        v_is_bye := true; v_bye_uid := v_home;
      ELSE
        v_is_bye := false; v_bye_uid := NULL;
      END IF;

      INSERT INTO h2h_schedule (league_id, matchday_id, home_user_id, away_user_id, is_bye, bye_user_id)
      VALUES (
        p_league_id,
        v_matchday_ids[v_md_idx],
        CASE WHEN NOT v_is_bye THEN v_home ELSE NULL END,
        CASE WHEN NOT v_is_bye THEN v_away ELSE NULL END,
        v_is_bye,
        v_bye_uid
      );

      -- Remaining matches (i = 1..half-1)
      FOR v_i IN 1..v_half-1 LOOP
        v_home_idx := ((v_r + v_i) % (v_n_eff - 1)) + 1;
        v_away_idx := (((v_r - v_i) % (v_n_eff - 1)) + (v_n_eff - 1)) % (v_n_eff - 1) + 1;

        v_home := v_members[v_home_idx];
        v_away := v_members[v_away_idx];

        IF v_home IS NULL THEN
          v_is_bye := true; v_bye_uid := v_away;
        ELSIF v_away IS NULL THEN
          v_is_bye := true; v_bye_uid := v_home;
        ELSE
          v_is_bye := false; v_bye_uid := NULL;
        END IF;

        INSERT INTO h2h_schedule (league_id, matchday_id, home_user_id, away_user_id, is_bye, bye_user_id)
        VALUES (
          p_league_id,
          v_matchday_ids[v_md_idx],
          CASE WHEN NOT v_is_bye THEN v_home ELSE NULL END,
          CASE WHEN NOT v_is_bye THEN v_away ELSE NULL END,
          v_is_bye,
          v_bye_uid
        );
      END LOOP;

      v_md_idx := v_md_idx + 1;
    END LOOP;
  END LOOP;

  RETURN json_build_object(
    'ok', true,
    'matchdays_scheduled', v_md_idx - 1,
    'total_matchdays',     v_n_matchdays,
    'managers',            v_n,
    'cycle_length',        v_cycle_rounds
  );
END;
$$;

-- ── 5. get_h2h_standings RPC ──────────────────────────────────────────────────
-- Returns the H2H league table for all managers in a league.
-- Accessible to league members (security definer reads from h2h_schedule + users).

CREATE OR REPLACE FUNCTION get_h2h_standings(p_league_id uuid)
RETURNS TABLE (
  user_id       uuid,
  username      text,
  wins          int,
  draws         int,
  losses        int,
  total_h2h_pts int,
  h2h_rank      int
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_win_pts  int;
  v_draw_pts int;
  v_loss_pts int;
BEGIN
  -- Only league members can call this
  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Load H2H scoring config (defaults: 5/2/0)
  SELECT coalesce((config_value)::int, 5) INTO v_win_pts
  FROM league_config WHERE league_id = p_league_id AND config_key = 'h2h_win_pts';
  v_win_pts := coalesce(v_win_pts, 5);

  SELECT coalesce((config_value)::int, 2) INTO v_draw_pts
  FROM league_config WHERE league_id = p_league_id AND config_key = 'h2h_draw_pts';
  v_draw_pts := coalesce(v_draw_pts, 2);

  SELECT coalesce((config_value)::int, 0) INTO v_loss_pts
  FROM league_config WHERE league_id = p_league_id AND config_key = 'h2h_loss_pts';
  v_loss_pts := coalesce(v_loss_pts, 0);

  RETURN QUERY
  WITH all_rows AS (
    -- Home manager rows (non-bye)
    SELECT home_user_id AS uid, home_h2h_pts AS pts
    FROM h2h_schedule
    WHERE league_id = p_league_id
      AND resolved_at IS NOT NULL
      AND is_bye = false
      AND home_user_id IS NOT NULL

    UNION ALL

    -- Away manager rows (non-bye)
    SELECT away_user_id, away_h2h_pts
    FROM h2h_schedule
    WHERE league_id = p_league_id
      AND resolved_at IS NOT NULL
      AND is_bye = false
      AND away_user_id IS NOT NULL

    UNION ALL

    -- Bye rows — the manager getting the bye always wins
    SELECT bye_user_id, home_h2h_pts
    FROM h2h_schedule
    WHERE league_id = p_league_id
      AND resolved_at IS NOT NULL
      AND is_bye = true
      AND bye_user_id IS NOT NULL
  ),
  agg AS (
    SELECT
      r.uid,
      COUNT(*) FILTER (WHERE r.pts = v_win_pts)::int  AS wins,
      COUNT(*) FILTER (WHERE r.pts = v_draw_pts AND v_draw_pts <> v_win_pts)::int AS draws,
      COUNT(*) FILTER (WHERE r.pts = v_loss_pts AND v_loss_pts <> v_win_pts AND v_loss_pts <> v_draw_pts)::int AS losses,
      COALESCE(SUM(r.pts), 0)::int AS total
    FROM all_rows r
    GROUP BY r.uid
  )
  SELECT
    a.uid,
    u.username::text,
    a.wins,
    a.draws,
    a.losses,
    a.total AS total_h2h_pts,
    RANK() OVER (ORDER BY a.total DESC, a.wins DESC)::int AS h2h_rank
  FROM agg a
  JOIN users u ON u.id = a.uid
  ORDER BY 7, a.wins DESC;
END;
$$;

-- Grant execute to authenticated users (row-level auth is inside the function)
GRANT EXECUTE ON FUNCTION generate_h2h_schedule(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION get_h2h_standings(uuid) TO authenticated;
