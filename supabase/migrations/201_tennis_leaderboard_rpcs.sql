-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 201 — Tennis Module: Leaderboard + Season Summary RPCs (Sprint T-3)
-- Sprint T-3 (Phase 2, v2 branch only)
--
-- get_player_box_leaderboard: season standings for all users in a Player's Box
-- get_tennis_season_summary:  per-tournament breakdown per user for history/recap screen
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. get_player_box_leaderboard ────────────────────────────────────────────
-- Returns season standings for a Player's Box.
--
-- Masters Drop Rule: in a season with ≥ 5 completed standard tournaments,
-- each user's worst single standard-tournament score is dropped (not counted).
-- ATP Finals is always counted (never dropped).
-- This rewards consistency while allowing one bad tournament.
--
-- Returns: sorted by total_points DESC, then by tournaments_played DESC.

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
  worst_dropped        int,   -- pts dropped via Masters Drop Rule (0 if not applied)
  rank                 int
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_completed_standard_count int;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM player_box_members WHERE player_box_id = p_player_box_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'NOT_A_MEMBER';
  END IF;

  -- Count completed standard tournaments this season
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
      -- rank of score per user: 1 = highest (best), N = lowest (worst to drop)
      ROW_NUMBER() OVER (
        PARTITION BY bm.user_id
        ORDER BY tts.total_points ASC   -- ASC so rank 1 = worst score
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
      -- Drop worst standard tournament if ≥ 5 completed standard events
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

-- ── 2. get_tennis_season_summary ─────────────────────────────────────────────
-- Returns per-tournament scores for every box member, for the history screen.
-- One row per (user, tournament) pair. Used to build the tournament-by-tournament
-- score grid in TennisLeaderboardScreen.

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
    SELECT 1 FROM player_box_members WHERE player_box_id = p_player_box_id AND user_id = auth.uid()
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

-- ── 3. get_tennis_tournament_list ────────────────────────────────────────────
-- Returns the 2026 ATP calendar with player counts and user roster status.
-- Used by TennisHomeScreen to show the season calendar.

CREATE OR REPLACE FUNCTION get_tennis_tournament_list(p_season_year int DEFAULT 2026)
RETURNS TABLE (
  tournament_id    uuid,
  name             text,
  tournament_type  text,
  surface          text,
  draw_size        int,
  start_date       date,
  end_date         date,
  roster_lock_at   timestamptz,
  status           text,
  sort_order       int,
  player_count     bigint,
  has_my_roster    boolean
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  RETURN QUERY
  SELECT
    tt.id,
    tt.name,
    tt.tournament_type::text,
    tt.surface::text,
    tt.draw_size,
    tt.start_date,
    tt.end_date,
    tt.roster_lock_at,
    tt.status,
    tt.sort_order,
    COUNT(DISTINCT ttp.id)                               AS player_count,
    EXISTS (
      SELECT 1 FROM tennis_rosters tr
      WHERE tr.tournament_id = tt.id AND tr.user_id = auth.uid()
    )                                                    AS has_my_roster
  FROM tennis_tournaments tt
  LEFT JOIN tennis_tournament_players ttp ON ttp.tournament_id = tt.id
  WHERE tt.season_year = p_season_year
  GROUP BY tt.id
  ORDER BY tt.sort_order;
END;
$$;
