-- L3.3: Recompute league_members.rank whenever total_points changes.
-- Without this trigger rank is frozen at seed value and diverges from standings.

CREATE OR REPLACE FUNCTION public.recompute_league_ranks(p_league_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  WITH ranked AS (
    SELECT user_id,
           DENSE_RANK() OVER (ORDER BY total_points DESC NULLS LAST) AS new_rank
    FROM league_members
    WHERE league_id = p_league_id
  )
  UPDATE league_members lm
  SET rank = r.new_rank
  FROM ranked r
  WHERE lm.league_id = p_league_id
    AND lm.user_id = r.user_id
    AND lm.rank IS DISTINCT FROM r.new_rank;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_recompute_ranks()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM recompute_league_ranks(NEW.league_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS league_members_rank_recompute ON public.league_members;
CREATE TRIGGER league_members_rank_recompute
  AFTER UPDATE OF total_points ON public.league_members
  FOR EACH ROW
  WHEN (NEW.total_points IS DISTINCT FROM OLD.total_points)
  EXECUTE FUNCTION tg_recompute_ranks();
