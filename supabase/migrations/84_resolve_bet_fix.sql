-- BUG: resolve_bet RPC used wrong column names:
--   resolution_answer → correct_answer  (column doesn't exist)
--   resolved_at → removed              (column doesn't exist)
-- Also changed return type from void to jsonb so client can read winners/total.

DROP FUNCTION IF EXISTS public.resolve_bet(uuid, text);

CREATE FUNCTION public.resolve_bet(p_instance_id uuid, p_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_reward_value NUMERIC;
  v_winners      INT;
  v_total        INT;
BEGIN
  SELECT reward_value INTO v_reward_value FROM bet_instances WHERE id = p_instance_id;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE answer = p_answer)
    INTO v_total, v_winners
    FROM bet_submissions WHERE bet_instance_id = p_instance_id;

  UPDATE bet_submissions
     SET is_correct     = (answer = p_answer),
         reward_awarded = CASE WHEN answer = p_answer THEN v_reward_value ELSE NULL END
   WHERE bet_instance_id = p_instance_id;

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
