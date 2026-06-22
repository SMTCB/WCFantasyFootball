-- Migration 187: log bet_win events in squad_events for budget-type bet resolutions.
--
-- resolve_bet correctly credits squads.budget_remaining for reward_type='budget' bets
-- (migration 99) and calls aggregate_league_member_points for reward_type='points' bets
-- (migration 167). Neither wrote a squad_events entry — budget wins had no audit trail
-- beyond bet_submissions.reward_awarded.
--
-- This migration adds a _log_squad_event('bet_win', ...) call inside resolve_bet for
-- budget-type winners. meta includes: bet_title, reward_type, reward_value, answer.
-- Points-type wins are also logged so the audit table is complete.

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
  v_user_id         UUID;
  v_title           TEXT;
  r                 RECORD;
BEGIN
  SELECT league_id, reward_value, reward_type, status, deadline_at, title
    INTO v_league_id, v_reward_value, v_reward_type, v_status, v_deadline_at, v_title
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

    ELSIF v_reward_type = 'points' THEN
      -- Refresh league_members.total_points now for every winning manager
      FOR v_user_id IN
        SELECT DISTINCT s.user_id
          FROM bet_submissions bs
          JOIN squads s ON s.id = bs.squad_id
         WHERE bs.bet_instance_id = p_instance_id
           AND bs.answer = ANY(p_answers)
      LOOP
        PERFORM aggregate_league_member_points(v_league_id, v_user_id);
      END LOOP;
    END IF;

    -- Log bet_win event for every winning submission (budget + points)
    FOR r IN
      SELECT bs.squad_id, bs.answer, s.user_id
        FROM bet_submissions bs
        JOIN squads s ON s.id = bs.squad_id
       WHERE bs.bet_instance_id = p_instance_id
         AND bs.answer = ANY(p_answers)
    LOOP
      PERFORM _log_squad_event(
        'bet_win',
        v_league_id,
        r.user_id,
        r.squad_id,
        NULL,   -- no matchday_id for bets
        NULL,   -- no player_in
        NULL,   -- no player_out
        jsonb_build_object(
          'bet_instance_id', p_instance_id,
          'bet_title',       v_title,
          'reward_type',     v_reward_type,
          'reward_value',    v_reward_value,
          'answer',          r.answer
        )
      );
    END LOOP;
  END IF;

  UPDATE bet_instances
     SET status            = 'resolved',
         correct_answer    = CASE WHEN v_no_winner THEN NULL ELSE p_answers[1] END,
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

GRANT EXECUTE ON FUNCTION resolve_bet(uuid, text[]) TO service_role, authenticated;
