-- 313: get_live_league_table — the league table as it stands during a matchweek (MD-7).
--
-- Read-only. league_members.total_points already includes the round being played:
-- calculate-scores upserts fantasy_points on every live pass and then re-runs
-- aggregate_league_member_points. So the live table is total_points as it is now,
-- and the rank before this round is the rank of (total_points - this round's points).
--
-- SECURITY DEFINER because fantasy_points of other squads is not readable under RLS;
-- the membership check below keeps it to people in the league.

CREATE OR REPLACE FUNCTION public.get_live_league_table(p_league_id uuid, p_matchday_id text)
RETURNS TABLE (
  user_id          uuid,
  username         text,
  total_points     numeric,
  matchday_points  numeric,
  live_rank        int,
  rank_before      int
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM league_members lm
    WHERE lm.league_id = p_league_id AND lm.user_id = v_caller
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  RETURN QUERY
  WITH md AS (
    SELECT s.user_id AS uid, SUM(fp.total) AS pts
    FROM fantasy_points fp
    JOIN squads s ON s.id = fp.squad_id
    WHERE s.league_id = p_league_id
      AND fp.matchday_id = p_matchday_id
    GROUP BY s.user_id
  ),
  base AS (
    SELECT lm.user_id AS uid,
           u.username AS uname,
           COALESCE(lm.total_points, 0)::numeric AS tp,
           COALESCE(md.pts, 0)::numeric AS mp
    FROM league_members lm
    LEFT JOIN users u ON u.id = lm.user_id
    LEFT JOIN md ON md.uid = lm.user_id
    WHERE lm.league_id = p_league_id
  )
  SELECT b.uid,
         b.uname,
         b.tp,
         b.mp,
         (RANK() OVER (ORDER BY b.tp DESC))::int,
         (RANK() OVER (ORDER BY (b.tp - b.mp) DESC))::int
  FROM base b
  ORDER BY b.tp DESC, b.uname ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_live_league_table(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_live_league_table(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_live_league_table(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_live_league_table(uuid, text) TO service_role;
