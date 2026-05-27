-- BUG: submit_bet RPC was missing user_id in INSERT (NOT NULL constraint violation)
-- and had no UNIQUE index for ON CONFLICT (squad_id, bet_instance_id).
-- Both caused silent failures when managers tried to submit bet picks via the UI.

CREATE UNIQUE INDEX IF NOT EXISTS bet_submissions_unique_squad_bet
  ON public.bet_submissions (squad_id, bet_instance_id);

CREATE OR REPLACE FUNCTION public.submit_bet(p_squad_id uuid, p_instance_id uuid, p_answer text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_status   TEXT;
  v_deadline TIMESTAMPTZ;
BEGIN
  SELECT status, deadline_at INTO v_status, v_deadline
    FROM bet_instances WHERE id = p_instance_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND');
  END IF;

  IF v_status NOT IN ('open') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_CLOSED');
  END IF;

  IF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DEADLINE_PASSED');
  END IF;

  INSERT INTO bet_submissions (squad_id, bet_instance_id, user_id, answer, is_correct, reward_awarded)
  VALUES (p_squad_id, p_instance_id, auth.uid(), p_answer, NULL, NULL)
  ON CONFLICT (squad_id, bet_instance_id)
  DO UPDATE SET
    answer         = EXCLUDED.answer,
    submitted_at   = NOW(),
    is_correct     = NULL,
    reward_awarded = NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;
