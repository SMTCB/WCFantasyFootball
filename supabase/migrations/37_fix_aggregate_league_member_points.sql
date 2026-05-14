-- Fix aggregate_league_member_points:
-- 1. fantasy_points.total_points → fantasy_points.total (correct column name)
-- 2. fp.league_id doesn't exist → filter through squads.league_id instead

CREATE OR REPLACE FUNCTION public.aggregate_league_member_points(p_league_id uuid, p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fantasy_points NUMERIC := 0;
  v_bet_rewards    NUMERIC := 0;
  v_total          NUMERIC;
BEGIN
  -- Sum fantasy points from league standings (column is 'total', league via squads)
  SELECT COALESCE(SUM(fp.total), 0) INTO v_fantasy_points
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE s.league_id = p_league_id
    AND s.user_id   = p_user_id;

  -- Sum bet rewards for this user's squads in the league
  SELECT COALESCE(SUM(bs.reward_awarded), 0) INTO v_bet_rewards
  FROM bet_submissions bs
  JOIN bet_instances bi ON bi.id = bs.bet_instance_id
  JOIN squads s ON s.id = bs.squad_id
  WHERE bi.league_id       = p_league_id
    AND s.user_id           = p_user_id
    AND bs.reward_awarded  IS NOT NULL
    AND bi.status           = 'resolved';

  v_total := v_fantasy_points + v_bet_rewards;
  RETURN v_total;
END;
$$;
