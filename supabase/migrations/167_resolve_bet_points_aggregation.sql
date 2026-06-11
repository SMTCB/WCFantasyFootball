-- Migration 167: resolve_bet — refresh league_members.total_points immediately
-- for points-type bet rewards.
--
-- Bug: aggregate_league_member_points(p_league_id, p_user_id) sums
--   fantasy_points.total + resolved 'points'-type bet_submissions.reward_awarded
--   into league_members.total_points (migration 70). It is currently only
--   called from calculate-scores, per squad/fixture being scored. A bet
--   resolved after a league's fixtures are all finished (no further scoring
--   runs) never triggers this aggregation, so winners' bet rewards never
--   reach the leaderboard until the next time that league happens to be
--   scored (which may be never, post-matchday).
--
-- Fix: after resolve_bet marks winning submissions for a 'points'-type bet,
--   call aggregate_league_member_points for each winning manager so their
--   total_points reflects the reward immediately.

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
    ELSIF v_reward_type = 'points' THEN
      -- Refresh league_members.total_points now for every winning manager —
      -- otherwise the reward sits in bet_submissions.reward_awarded until the
      -- next calculate-scores run for this league (which may never happen
      -- again this matchday).
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

GRANT EXECUTE ON FUNCTION resolve_bet(uuid, text[]) TO service_role, authenticated;

-- One-time backfill: recompute total_points for any (league, user) that already
-- has a resolved 'points'-type bet reward sitting unaggregated (pre-fix bets).
-- Currently affects 1 row: TEST_2_H2H_DRAFT (league c48946c1-7b5c-41a9-a412-6783d68c3527),
-- user d0f0cb5a-2327-45f0-aec2-4086dff07402, +5 pts.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT bi.league_id, s.user_id
      FROM bet_submissions bs
      JOIN bet_instances   bi ON bi.id = bs.bet_instance_id
      JOIN squads          s  ON s.id  = bs.squad_id
     WHERE bi.status = 'resolved'
       AND bi.reward_type = 'points'
       AND bs.reward_awarded IS NOT NULL
  LOOP
    PERFORM aggregate_league_member_points(r.league_id, r.user_id);
  END LOOP;
END;
$$;
