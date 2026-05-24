-- Sprint 1 — aggregate_league_member_points signature + L3.7 reward_type filter
--
-- Migration 66 created this function with signature (UUID, TEXT) — the second
-- parameter p_matchday_id was never used in the body.  calculate-scores calls
-- it with named args { p_league_id, p_user_id }, which PostgreSQL rejects when
-- the declared parameter name is p_matchday_id.  This migration drops the old
-- overload and replaces it with (UUID, UUID) matching the callers.
--
-- L3.7: filter bet rewards to reward_type='points' only so 'budget'-type bets
--       don't bleed into standings totals.
--
-- Also fixes the bet join: bet_submissions has no user_id column — must join
-- through squads to resolve the owning manager.

DROP FUNCTION IF EXISTS public.aggregate_league_member_points(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.aggregate_league_member_points(
  p_league_id  UUID,
  p_user_id    UUID
) RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fantasy_points NUMERIC(10,2) := 0;
  v_bet_rewards    NUMERIC(10,2) := 0;
  v_total          NUMERIC(10,2);
BEGIN
  -- Sum fantasy_points for all squads owned by this user in this league.
  SELECT COALESCE(SUM(fp.total), 0)
  INTO v_fantasy_points
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE s.league_id = p_league_id
    AND s.user_id   = p_user_id;

  -- Sum resolved 'points'-type bet rewards only (L3.7: exclude 'budget' rewards).
  -- bet_submissions links to the manager through squad_id → squads.user_id.
  SELECT COALESCE(SUM(bs.reward_awarded), 0)
  INTO v_bet_rewards
  FROM bet_submissions bs
  JOIN bet_instances   bi ON bi.id = bs.bet_instance_id
  JOIN squads          s  ON s.id  = bs.squad_id
  WHERE bi.league_id      = p_league_id
    AND s.user_id          = p_user_id
    AND bs.reward_awarded IS NOT NULL
    AND bi.status          = 'resolved'
    AND bi.reward_type     = 'points';

  v_total := ROUND((v_fantasy_points + v_bet_rewards)::numeric, 2);

  UPDATE public.league_members
  SET total_points = v_total
  WHERE league_id = p_league_id
    AND user_id   = p_user_id;

  RETURN v_total;
END;
$$;
