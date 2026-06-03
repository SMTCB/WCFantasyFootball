-- Migration 124: Session 78 — fix bet auto-resolution (A1)
--
-- resolve_bet required auth.uid() to be a league commissioner. The resolve-finished-bets
-- cron calls it via the service-role client, where auth.uid() is NULL, so EVERY auto-
-- resolution returned UNAUTHORIZED — bets only settled if a commissioner resolved each
-- one manually in the app. Allow the trusted server context (auth.uid() IS NULL) while
-- still rejecting authenticated non-commissioners (a user cannot null their own uid).

CREATE OR REPLACE FUNCTION public.resolve_bet(p_instance_id uuid, p_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_league_id    UUID;
  v_reward_value NUMERIC;
  v_reward_type  TEXT;
  v_status       TEXT;
  v_deadline_at  TIMESTAMPTZ;
  v_winners      INT;
  v_total        INT;
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

  IF v_status = 'open' AND v_deadline_at IS NOT NULL AND v_deadline_at > NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_STILL_OPEN');
  END IF;

  -- A1: only enforce the commissioner check for authenticated callers. The cron /
  -- service-role context has no auth.uid() and is trusted to auto-resolve.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
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
$function$;
