-- Migration 125: Session 78 quick wins — daily_jokers deadline gating (#16) + void_bet floor (#11)

-- ── #16: a client cannot set a joker after the matchday deadline ──────────────
-- daily_jokers has an "own rows" ALL policy, so a user can insert a joker for any
-- matchday_id, including a past/locked one. Gate inserts/updates from client roles
-- on the matchday deadline. Owner/service-role (seeds, crons) are exempt so E2E can
-- seed jokers for historical rounds.
CREATE OR REPLACE FUNCTION guard_daily_joker_deadline()
RETURNS TRIGGER AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND EXISTS (
       SELECT 1 FROM matchday_deadlines
        WHERE matchday_id = NEW.matchday_id
          AND deadline_at < NOW()
     ) THEN
    RAISE EXCEPTION 'Joker cannot be set after the matchday deadline';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_guard_daily_joker_deadline ON daily_jokers;
CREATE TRIGGER trg_guard_daily_joker_deadline
  BEFORE INSERT OR UPDATE ON daily_jokers
  FOR EACH ROW EXECUTE FUNCTION guard_daily_joker_deadline();

-- ── #11: void_bet budget claw-back must not drive a squad negative ────────────
-- If a winner already spent the credited reward, subtracting it can go below 0.
-- Floor at 0 (treat the rest as forgiven rather than creating negative budget).
CREATE OR REPLACE FUNCTION public.void_bet(p_instance_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_league_id   UUID;
  v_reward_type TEXT;
  v_status      TEXT;
  v_cleared     INT;
BEGIN
  SELECT league_id, reward_type, status INTO v_league_id, v_reward_type, v_status
    FROM bet_instances WHERE id = p_instance_id;
  IF v_league_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND'); END IF;
  IF NOT EXISTS (
    SELECT 1 FROM league_members
     WHERE league_id = v_league_id AND user_id = auth.uid() AND role = 'commissioner'
  ) THEN RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED'); END IF;
  -- DD-L5: reverse budget credits if already resolved as a budget-type bet.
  -- #11: floor at 0 so a spent reward can't create negative budget.
  IF v_status = 'resolved' AND v_reward_type = 'budget' THEN
    UPDATE squads s
       SET budget_remaining = GREATEST(budget_remaining - bs.reward_awarded, 0)
      FROM bet_submissions bs
     WHERE bs.bet_instance_id = p_instance_id
       AND bs.is_correct = true
       AND bs.reward_awarded IS NOT NULL
       AND s.id = bs.squad_id;
  END IF;
  UPDATE bet_submissions SET is_correct = false, reward_awarded = NULL WHERE bet_instance_id = p_instance_id;
  GET DIAGNOSTICS v_cleared = ROW_COUNT;
  UPDATE bet_instances SET status = 'cancelled' WHERE id = p_instance_id;
  RETURN jsonb_build_object('ok', true, 'submissions_cleared', v_cleared);
END;
$function$;
