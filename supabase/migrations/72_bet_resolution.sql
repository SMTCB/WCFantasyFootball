-- Migration 72: Bet resolution hardening
-- L2.1: resolve_bet validates p_correct_answer is in options (prevents typo from locking all wrong)
-- 3.4:  resolve-bets cron fires every 15 min to auto-resolve finished match_result bets

-- ── Harden resolve_bet ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION resolve_bet(
  p_instance_id    UUID,
  p_correct_answer TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_instance  bet_instances;
  v_winners   BIGINT;
  v_total     BIGINT;
BEGIN
  SELECT * INTO v_instance FROM bet_instances WHERE id = p_instance_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bet not found.');
  END IF;

  IF v_instance.status = 'resolved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Already resolved.');
  END IF;

  -- L2.1: Validate answer is one of the declared options (skip for free-text bets with empty options).
  IF jsonb_array_length(v_instance.options) > 0
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_instance.options) o
       WHERE o->>'key' = p_correct_answer
     ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'p_correct_answer not in options');
  END IF;

  -- Mark instance resolved
  UPDATE bet_instances
  SET status = 'resolved', correct_answer = p_correct_answer
  WHERE id = p_instance_id;

  -- Count winners and total before update (for return value)
  SELECT
    COUNT(*) FILTER (WHERE answer = p_correct_answer),
    COUNT(*)
  INTO v_winners, v_total
  FROM bet_submissions WHERE bet_instance_id = p_instance_id;

  -- Mark correct/wrong and award rewards
  UPDATE bet_submissions
  SET
    is_correct     = (answer = p_correct_answer),
    reward_awarded = CASE WHEN answer = p_correct_answer THEN v_instance.reward_value ELSE 0 END
  WHERE bet_instance_id = p_instance_id;

  RETURN jsonb_build_object('ok', true, 'winners', v_winners, 'total', v_total);
END;
$$;

-- ── resolve-bets edge function cron (15 min, auto-resolves match_result bets) ──

SELECT cron.schedule(
  'resolve-finished-bets',
  '*/15 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/resolve-bets',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    )
  $$
);
