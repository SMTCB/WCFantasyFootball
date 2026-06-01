-- void_bet() was setting status = 'voided', which violates the
-- bet_instances_status_check constraint (only allows: upcoming, open, closed,
-- resolved, cancelled). The void button appeared to succeed in the UI but the
-- status never changed. Fix: use 'cancelled' instead — same end-state, no
-- schema change required.

CREATE OR REPLACE FUNCTION public.void_bet(p_instance_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_league_id UUID;
  v_cleared   INT;
BEGIN
  SELECT league_id INTO v_league_id FROM bet_instances WHERE id = p_instance_id;

  IF v_league_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND');
  END IF;

  -- Caller must be commissioner of this league
  IF NOT EXISTS (
    SELECT 1 FROM league_members
     WHERE league_id = v_league_id
       AND user_id   = auth.uid()
       AND role      = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED');
  END IF;

  -- Clear all picks: mark as not-correct, remove any reward
  UPDATE bet_submissions
     SET is_correct     = false,
         reward_awarded = NULL
   WHERE bet_instance_id = p_instance_id;

  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  -- Mark the bet cancelled (constraint allows: upcoming/open/closed/resolved/cancelled)
  UPDATE bet_instances
     SET status = 'cancelled'
   WHERE id = p_instance_id;

  RETURN jsonb_build_object('ok', true, 'submissions_cleared', v_cleared);
END;
$$;
