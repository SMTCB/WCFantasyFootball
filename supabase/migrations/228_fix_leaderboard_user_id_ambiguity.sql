-- Migration 228: fix ambiguous "user_id" in Tennis leaderboard RPCs
-- Bug found during v2 cutover dry-run (Tennis UI pass): get_player_box_leaderboard
-- and get_tennis_season_summary (migration 201) both declare a `user_id` OUT
-- column (RETURNS TABLE), which becomes a PL/pgSQL variable in scope for the
-- whole function body. Both functions' membership-check guard referenced
-- `user_id = auth.uid()` unqualified, which Postgres cannot resolve between
-- the table column (player_box_members.user_id) and the OUT variable --
-- causing "column reference \"user_id\" is ambiguous" on every call.
-- Same bug class as migration 138 (get_h2h_standings). Fix: qualify with the
-- table alias. FULLY ADDITIVE / CORRECTIVE: no schema changes, replace-only.

CREATE OR REPLACE FUNCTION get_player_box_leaderboard(
  p_player_box_id uuid,
  p_season_year   int DEFAULT 2026
)
RETURNS TABLE (
  user_id              uuid,
  username             text,
  total_points         int,
  tournaments_played   int,
  best_tournament_pts  int,
  worst_dropped        int,
  rank                 int
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_completed_standard_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM player_box_members pbm
    WHERE pbm.player_box_id = p_player_box_id AND pbm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;

  SELECT COUNT(*) INTO v_completed_standard_count
  FROM tennis_tournaments
  WHERE season_year = p_season_year
    AND tournament_type IN ('grand_slam', 'masters_1000')
    AND status = 'completed';

  RETURN QUERY
  WITH box_members AS (
    SELECT pbm.user_id
    FROM player_box_members pbm
    WHERE pbm.player_box_id = p_player_box_id
  ),
  user_scores AS (
    SELECT
      bm.user_id,
      tt.tournament_type,
      tts.total_points,
      ROW_NUMBER() OVER (
        PARTITION BY bm.user_id
        ORDER BY tts.total_points ASC
      ) AS score_rank_asc
    FROM box_members bm
    JOIN tennis_tournament_scores tts ON tts.user_id = bm.user_id
    JOIN tennis_tournaments tt ON tt.id = tts.tournament_id
      AND tt.season_year = p_season_year
  ),
  user_totals AS (
    SELECT
      us.user_id,
      COUNT(*)::int                                     AS tournaments_played,
      MAX(us.total_points)                              AS best_tournament_pts,
      CASE
        WHEN v_completed_standard_count >= 5 THEN
          MIN(CASE WHEN us.tournament_type != 'atp_finals' THEN us.total_points END)
        ELSE 0
      END                                               AS worst_dropped,
      SUM(us.total_points) -
        CASE
          WHEN v_completed_standard_count >= 5 THEN
            COALESCE(MIN(CASE WHEN us.tournament_type != 'atp_finals' THEN us.total_points END), 0)
          ELSE 0
        END                                             AS total_points
    FROM user_scores us
    GROUP BY us.user_id
  )
  SELECT
    ut.user_id,
    u.username,
    ut.total_points::int,
    ut.tournaments_played,
    ut.best_tournament_pts::int,
    COALESCE(ut.worst_dropped, 0)::int,
    RANK() OVER (ORDER BY ut.total_points DESC, ut.tournaments_played DESC)::int AS rank
  FROM user_totals ut
  JOIN users u ON u.id = ut.user_id
  ORDER BY rank;
END;
$$;

CREATE OR REPLACE FUNCTION get_tennis_season_summary(
  p_player_box_id uuid,
  p_season_year   int DEFAULT 2026
)
RETURNS TABLE (
  user_id        uuid,
  username       text,
  tournament_id  uuid,
  tournament_name text,
  tournament_type text,
  sort_order     int,
  total_points   int,
  base_points    int,
  captain_bonus  int,
  ace_card_bonus int,
  breakdown      jsonb
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM player_box_members pbm
    WHERE pbm.player_box_id = p_player_box_id AND pbm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;

  RETURN QUERY
  SELECT
    pbm.user_id,
    u.username,
    tt.id,
    tt.name,
    tt.tournament_type::text,
    tt.sort_order,
    COALESCE(tts.total_points, 0)::int,
    COALESCE(tts.base_points, 0)::int,
    COALESCE(tts.captain_bonus, 0)::int,
    COALESCE(tts.ace_card_bonus, 0)::int,
    tts.breakdown
  FROM player_box_members pbm
  JOIN users u ON u.id = pbm.user_id
  CROSS JOIN tennis_tournaments tt
  LEFT JOIN tennis_tournament_scores tts
    ON tts.user_id = pbm.user_id AND tts.tournament_id = tt.id
  WHERE pbm.player_box_id = p_player_box_id
    AND tt.season_year = p_season_year
    AND tt.status IN ('in_progress', 'qf_captain_open', 'completed')
  ORDER BY u.username, tt.sort_order;
END;
$$;
