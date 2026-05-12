-- #036 Continued: Bet Reward Integration
-- Aggregates both fantasy points and bet rewards into league_members.total_points

-- ── aggregate_league_member_points RPC ─────────────────────────────────────────
-- Called after scoring or bet resolution to recalculate total points including rewards.
-- Takes league_id and user_id, sums:
--   1. Fantasy points from all squads in that league
--   2. Bet rewards from all bet_submissions in that league
CREATE OR REPLACE FUNCTION aggregate_league_member_points(
  p_league_id UUID,
  p_user_id   UUID
) RETURNS NUMERIC
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_fantasy_total NUMERIC := 0;
  v_bet_total     NUMERIC := 0;
  v_combined_total NUMERIC := 0;
BEGIN
  -- Sum fantasy points: all squads owned by user in this league
  SELECT COALESCE(SUM(fp.total), 0)
  INTO v_fantasy_total
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE s.user_id = p_user_id
    AND s.league_id = p_league_id;

  -- Sum bet rewards: all correct bet submissions by user in this league
  SELECT COALESCE(SUM(bs.reward_awarded), 0)
  INTO v_bet_total
  FROM bet_submissions bs
  JOIN bet_instances bi ON bi.id = bs.bet_instance_id
  WHERE bs.user_id = p_user_id
    AND bi.league_id = p_league_id
    AND bs.reward_awarded IS NOT NULL;

  v_combined_total := v_fantasy_total + v_bet_total;

  -- Update league_members with combined total (rounded to 2 decimals)
  UPDATE league_members
  SET total_points = ROUND(v_combined_total::numeric, 2)
  WHERE league_id = p_league_id
    AND user_id = p_user_id;

  RETURN v_combined_total;
END;
$$;

-- ── Trigger on bet_submissions: refresh league member points ────────────────────
-- When a bet is resolved (reward_awarded is populated), trigger aggregation
CREATE OR REPLACE FUNCTION trigger_bet_reward_update()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_league_id UUID;
BEGIN
  -- Get league_id from bet_instance
  SELECT league_id INTO v_league_id
  FROM bet_instances
  WHERE id = NEW.bet_instance_id;

  -- Trigger aggregation for this user in this league
  PERFORM aggregate_league_member_points(v_league_id, NEW.user_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bet_submissions_reward_update ON bet_submissions;
CREATE TRIGGER bet_submissions_reward_update
  AFTER UPDATE OF reward_awarded ON bet_submissions
  FOR EACH ROW
  WHEN (NEW.reward_awarded IS NOT NULL AND OLD.reward_awarded IS NULL)
  EXECUTE FUNCTION trigger_bet_reward_update();

-- ── Comment for clarity ─────────────────────────────────────────────────────────
COMMENT ON FUNCTION aggregate_league_member_points(UUID, UUID) IS
  'Recalculates league_members.total_points by summing fantasy points + bet rewards.
   Called after scoring updates or bet resolution. Returns combined total.';
