-- Migration 138: Fix get_h2h_standings — column reference "user_id" was ambiguous
-- Root cause: the auth check referenced "user_id" which collided with a PL/pgSQL context.
-- Fix: use explicit table alias in the EXISTS check.

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
  v_caller   uuid := auth.uid();
  v_win_pts  int;
  v_draw_pts int;
  v_loss_pts int;
BEGIN
  -- Only league members (or service-role) may call this
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM league_members lm
    WHERE lm.league_id = p_league_id AND lm.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

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
    SELECT home_user_id AS uid, home_h2h_pts AS pts
    FROM h2h_schedule
    WHERE league_id = p_league_id AND resolved_at IS NOT NULL AND is_bye = false AND home_user_id IS NOT NULL
    UNION ALL
    SELECT away_user_id, away_h2h_pts
    FROM h2h_schedule
    WHERE league_id = p_league_id AND resolved_at IS NOT NULL AND is_bye = false AND away_user_id IS NOT NULL
    UNION ALL
    SELECT bye_user_id, home_h2h_pts
    FROM h2h_schedule
    WHERE league_id = p_league_id AND resolved_at IS NOT NULL AND is_bye = true AND bye_user_id IS NOT NULL
  ),
  agg AS (
    SELECT
      r.uid,
      COUNT(*) FILTER (WHERE r.pts = v_win_pts)::int AS wins,
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
  ORDER BY h2h_rank, a.wins DESC;
END;
$$;
