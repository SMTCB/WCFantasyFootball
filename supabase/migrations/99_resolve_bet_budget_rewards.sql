-- AUDIT-57-03: resolve_bet showed budget-type reward in UI but never credited
-- squads.budget_remaining. Fix: after marking winners, apply budget credits when
-- reward_type = 'budget'.
-- Also carries forward the commissioner auth guard from migration 97.

CREATE OR REPLACE FUNCTION public.resolve_bet(p_instance_id uuid, p_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_league_id    UUID;
  v_reward_value NUMERIC;
  v_reward_type  TEXT;
  v_winners      INT;
  v_total        INT;
BEGIN
  SELECT league_id, reward_value, reward_type
    INTO v_league_id, v_reward_value, v_reward_type
    FROM bet_instances WHERE id = p_instance_id;

  IF v_league_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND');
  END IF;

  -- Caller must be commissioner of this league (from migration 97)
  IF NOT EXISTS (
    SELECT 1 FROM league_members
     WHERE league_id = v_league_id
       AND user_id   = auth.uid()
       AND role      = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED');
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE answer = p_answer)
    INTO v_total, v_winners
    FROM bet_submissions WHERE bet_instance_id = p_instance_id;

  UPDATE bet_submissions
     SET is_correct     = (answer = p_answer),
         reward_awarded = CASE WHEN answer = p_answer THEN v_reward_value ELSE NULL END
   WHERE bet_instance_id = p_instance_id;

  -- Credit budget_remaining for budget-type bets
  IF v_reward_type = 'budget' THEN
    UPDATE squads
       SET budget_remaining = budget_remaining + v_reward_value
     WHERE id IN (
       SELECT squad_id FROM bet_submissions
        WHERE bet_instance_id = p_instance_id AND answer = p_answer
     );
  END IF;

  UPDATE bet_instances
     SET status            = 'resolved',
         correct_answer    = p_answer,
         winners_count     = v_winners,
         total_submissions = v_total
   WHERE id = p_instance_id;

  RETURN jsonb_build_object('ok', true, 'winners', v_winners, 'total', v_total,
                             'submissions_updated', v_total);
END;
$$;
