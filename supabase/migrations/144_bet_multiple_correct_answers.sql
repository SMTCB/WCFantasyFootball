-- Migration 144: Bets — multiple correct answers + explicit "no winner" resolution
--
-- Problem 1 — Ties: a top-scorer bet where two players end level cannot be
--   resolved correctly with the old single-text p_answer. One group of managers
--   would be incorrectly left unrewarded.
--
-- Problem 2 — No winner: when no manager's prediction was correct (e.g. nobody
--   scores, or none of the options happened), there was no clean way to resolve
--   the bet with 0 winners. The only option was VOID, which cancels the bet
--   entirely and is semantically wrong for a valid bet with a valid (null) outcome.
--
-- Changes:
--   1. Add correct_answers text[] column to bet_instances.
--      Keeps correct_answer text for backward compat (set to first element).
--   2. Rebuild resolve_bet to accept p_answers text[] instead of p_answer text.
--      Empty array → no winner: 0 pts awarded, bet resolves with status='resolved'.
--   3. Backfill correct_answers from existing correct_answer rows.

-- ── 1. New column ─────────────────────────────────────────────────────────────
ALTER TABLE bet_instances
  ADD COLUMN IF NOT EXISTS correct_answers text[] DEFAULT '{}';

-- Backfill existing resolved bets
UPDATE bet_instances
SET correct_answers = ARRAY[correct_answer]
WHERE correct_answer IS NOT NULL
  AND (correct_answers IS NULL OR correct_answers = '{}');

-- ── 2. Rebuild resolve_bet ────────────────────────────────────────────────────
-- New signature: p_answers text[] (replaces p_answer text)
--   Empty array  → "no winner" — resolves with 0 winners, 0 pts awarded
--   Non-empty    → marks all submissions matching ANY element as correct
--
-- The old single-text overload is kept as a thin wrapper so any callers that
-- haven't been updated yet continue to work without error.

DROP FUNCTION IF EXISTS resolve_bet(uuid, text[]);

CREATE OR REPLACE FUNCTION resolve_bet(p_instance_id uuid, p_answers text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_league_id       UUID;
  v_reward_value    NUMERIC;
  v_reward_type     TEXT;
  v_status          TEXT;
  v_deadline_at     TIMESTAMPTZ;
  v_winners         INT := 0;
  v_total           INT := 0;
  v_is_commissioner BOOLEAN;
  v_no_winner       BOOLEAN;
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

  v_is_commissioner := auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM league_members
     WHERE league_id = v_league_id AND user_id = auth.uid() AND role = 'commissioner'
  );

  IF auth.uid() IS NOT NULL AND NOT v_is_commissioner THEN
    RETURN jsonb_build_object('ok', false, 'error', 'UNAUTHORIZED');
  END IF;

  IF NOT v_is_commissioner
     AND v_status = 'open'
     AND v_deadline_at IS NOT NULL
     AND v_deadline_at > NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_STILL_OPEN');
  END IF;

  -- NULL or empty array = "no winner" resolution
  v_no_winner := (p_answers IS NULL OR array_length(p_answers, 1) IS NULL OR array_length(p_answers, 1) = 0);

  SELECT COUNT(*) INTO v_total FROM bet_submissions WHERE bet_instance_id = p_instance_id;

  IF v_no_winner THEN
    -- No winner: mark all incorrect, award nothing
    UPDATE bet_submissions
       SET is_correct = false, reward_awarded = NULL
     WHERE bet_instance_id = p_instance_id;
    v_winners := 0;
  ELSE
    -- One or more correct answers: mark matching submissions as correct
    SELECT COUNT(*) FILTER (WHERE answer = ANY(p_answers))
      INTO v_winners
      FROM bet_submissions WHERE bet_instance_id = p_instance_id;

    UPDATE bet_submissions
       SET is_correct     = (answer = ANY(p_answers)),
           reward_awarded = CASE WHEN answer = ANY(p_answers) THEN v_reward_value ELSE NULL END
     WHERE bet_instance_id = p_instance_id;

    IF v_reward_type = 'budget' THEN
      UPDATE squads
         SET budget_remaining = budget_remaining + v_reward_value
       WHERE id IN (
         SELECT squad_id FROM bet_submissions
          WHERE bet_instance_id = p_instance_id AND answer = ANY(p_answers)
       );
    END IF;
  END IF;

  UPDATE bet_instances
     SET status            = 'resolved',
         -- correct_answer (legacy text): first element or NULL for no-winner
         correct_answer    = CASE WHEN v_no_winner THEN NULL ELSE p_answers[1] END,
         -- correct_answers (new array): full set, empty array for no-winner
         correct_answers   = COALESCE(p_answers, '{}'),
         winners_count     = v_winners,
         total_submissions = v_total
   WHERE id = p_instance_id;

  RETURN jsonb_build_object(
    'ok',                  true,
    'winners',             v_winners,
    'total',               v_total,
    'no_winner',           v_no_winner,
    'submissions_updated', v_total
  );
END;
$$;

-- ── 3. Backward-compat wrapper (single text answer) ──────────────────────────
-- Keeps the old signature working so the resolve-bets auto-cron does not break
-- before its edge function is redeployed with the new array signature.

DROP FUNCTION IF EXISTS resolve_bet(uuid, text);

CREATE OR REPLACE FUNCTION resolve_bet(p_instance_id uuid, p_answer text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT resolve_bet(p_instance_id, ARRAY[p_answer]::text[]);
$$;

GRANT EXECUTE ON FUNCTION resolve_bet(uuid, text[]) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION resolve_bet(uuid, text)   TO service_role, authenticated;
