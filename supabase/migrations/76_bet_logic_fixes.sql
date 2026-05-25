-- Migration 76: Bet logic fixes
-- L2.2: Add winners_count + total_submissions to bet_instances for frontend display
-- L2.5: Reset is_correct to NULL on re-submit after resolution
-- L3.9: reward_awarded = NULL (not 0) for losing submissions in resolve_bet

-- L2.2 — aggregate columns on bet_instances
ALTER TABLE bet_instances
  ADD COLUMN IF NOT EXISTS winners_count     INT,
  ADD COLUMN IF NOT EXISTS total_submissions INT;

-- L2.2 — update resolve_bet to populate winners_count + total_submissions
-- Drop first to allow changing return type if it differs from the existing function
DROP FUNCTION IF EXISTS resolve_bet(UUID, TEXT);
CREATE OR REPLACE FUNCTION resolve_bet(
  p_instance_id UUID,
  p_answer      TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reward_value  NUMERIC;
  v_reward_type   TEXT;
  v_winners       INT;
  v_total         INT;
BEGIN
  -- Get reward metadata
  SELECT reward_value, reward_type
    INTO v_reward_value, v_reward_type
    FROM bet_instances
   WHERE id = p_instance_id;

  -- Count total submissions and winners
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE answer = p_answer)
  INTO v_total, v_winners
  FROM bet_submissions
  WHERE bet_instance_id = p_instance_id;

  -- Mark correct submissions and award rewards
  UPDATE bet_submissions
     SET is_correct     = (answer = p_answer),
         reward_awarded = CASE
           WHEN answer = p_answer THEN v_reward_value
           ELSE NULL   -- L3.9: losers get NULL, not 0
         END
   WHERE bet_instance_id = p_instance_id;

  -- Close the instance with answer + aggregate stats
  UPDATE bet_instances
     SET status             = 'resolved',
         resolution_answer  = p_answer,
         resolved_at        = NOW(),
         winners_count      = v_winners,
         total_submissions  = v_total
   WHERE id = p_instance_id;
END;
$$;

-- L2.5 — reset is_correct to NULL when squad re-submits a previously resolved bet
DROP FUNCTION IF EXISTS submit_bet(UUID, UUID, TEXT);
CREATE OR REPLACE FUNCTION submit_bet(
  p_squad_id    UUID,
  p_instance_id UUID,
  p_answer      TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_status     TEXT;
  v_deadline   TIMESTAMPTZ;
BEGIN
  SELECT status, deadline_at
    INTO v_status, v_deadline
    FROM bet_instances
   WHERE id = p_instance_id;

  IF v_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND');
  END IF;

  IF v_status NOT IN ('open') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_CLOSED');
  END IF;

  IF v_deadline IS NOT NULL AND NOW() > v_deadline THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DEADLINE_PASSED');
  END IF;

  INSERT INTO bet_submissions (squad_id, bet_instance_id, answer, is_correct, reward_awarded)
  VALUES (p_squad_id, p_instance_id, p_answer, NULL, NULL)  -- L2.5: always NULL on submit
  ON CONFLICT (squad_id, bet_instance_id)
  DO UPDATE SET
    answer         = EXCLUDED.answer,
    submitted_at   = NOW(),
    is_correct     = NULL,   -- L2.5: reset to NULL on re-submit
    reward_awarded = NULL;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_bet(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_bet(UUID, UUID, TEXT) TO authenticated;
