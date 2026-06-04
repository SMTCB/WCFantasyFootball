-- Migration 134: Allow commissioner to resolve bets before deadline
--
-- The BET_STILL_OPEN guard was firing before the commissioner check,
-- meaning even the commissioner couldn't resolve a bet while it was
-- still open. Commissioners should be able to resolve at any time —
-- the deadline is for collecting submissions, not for locking resolution.
-- The guard is preserved for the auto-resolve cron (auth.uid() IS NULL).

CREATE OR REPLACE FUNCTION resolve_bet(p_instance_id uuid, p_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_league_id    UUID;
  v_reward_value NUMERIC;
  v_reward_type  TEXT;
  v_status       TEXT;
  v_deadline_at  TIMESTAMPTZ;
  v_winners      INT;
  v_total        INT;
  v_is_commissioner BOOLEAN;
BEGIN
  SELECT league_id, reward_value, reward_type, status, deadline_at
    INTO v_league_id, v_reward_value, v_reward_type, v_status, v_deadline_at
    FROM bet_instances WHERE id = p_instance_id;

  IF v_league_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND');
  END IF;

  IF v_status = 'resolved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_RESOLVED');
  END IF;

  -- Check if the caller is an authenticated commissioner
  v_is_commissioner := auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM league_members
     WHERE league_id = v_league_id
       AND user_id   = auth.uid()
       AND role      = 'commissioner'
  );

  -- Non-commissioner authenticated users are blocked
  IF auth.uid() IS NOT NULL AND NOT v_is_commissioner THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- BET_STILL_OPEN only blocks the auto-resolve cron (auth.uid() IS NULL).
  -- Commissioners can resolve at any time — the deadline is for submissions only.
  IF NOT v_is_commissioner
     AND v_status = 'open'
     AND v_deadline_at IS NOT NULL
     AND v_deadline_at > NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_STILL_OPEN');
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE answer = p_answer)
    INTO v_total, v_winners
    FROM bet_submissions WHERE bet_instance_id = p_instance_id;

  UPDATE bet_submissions
     SET is_correct     = (answer = p_answer),
         reward_awarded = CASE WHEN answer = p_answer THEN v_reward_value ELSE NULL END
   WHERE bet_instance_id = p_instance_id;

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
