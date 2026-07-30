-- 242_resolve_bet_status_order.sql
-- Fix: resolve_bet() refreshes points-type winners' league_members.total_points
-- BEFORE flipping bet_instances.status to 'resolved'. aggregate_league_member_points()
-- sums bet rewards WHERE bi.status = 'resolved', so at call time the SUM is 0 and
-- the immediate refresh silently no-ops. total_points only picks up the reward
-- later, whenever some other event (next scoring pass, set_captain, set_lineup)
-- happens to re-aggregate that user.
--
-- Found 2026-07-30 while getting tests/unit/bet.test.js's
-- "updates league_members.total_points for the winning manager" test green in CI
-- (that test was written in migration 167's era encoding the CORRECT/intended
-- behavior, and has been marked `it.todo` ever since, silently documenting this
-- bug rather than failing CI). Confirmed against the current resolve_bet body
-- in supabase/schema.sql — no other DDL involved, no data backfill needed
-- (rewards remain correct once any later event re-aggregates; only the
-- *immediate* leaderboard refresh was ever wrong).
--
-- Fix: move the `UPDATE bet_instances SET status = 'resolved', ...` statement
-- so it runs before the budget/points reward-crediting and audit-log block,
-- instead of after it. No other logic changes.
--
-- 🛑 Do not apply without explicit "yes, run it" in the current session — see
-- CLAUDE.md's "NO SQL / MIGRATIONS ... WITHOUT EXPLICIT APPROVAL" rule.
-- Run from the Supabase-linked PC once approved:
--   npx supabase db query --linked --file supabase/migrations/242_resolve_bet_status_order.sql

CREATE OR REPLACE FUNCTION "public"."resolve_bet"("p_instance_id" "uuid", "p_answers" "text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_league_id            UUID;
  v_reward_value         NUMERIC;
  v_reward_type          TEXT;
  v_status               TEXT;
  v_deadline_at          TIMESTAMPTZ;
  v_winners              INT := 0;
  v_total                INT := 0;
  v_is_commissioner      BOOLEAN;
  v_no_winner            BOOLEAN;
  v_user_id              UUID;
  v_title                TEXT;
  r                      RECORD;
  v_old_points_user_ids  UUID[];
BEGIN
  SELECT league_id, reward_value, reward_type, status, deadline_at, title
    INTO v_league_id, v_reward_value, v_reward_type, v_status, v_deadline_at, v_title
    FROM bet_instances WHERE id = p_instance_id;

  IF v_league_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'BET_NOT_FOUND');
  END IF;

  -- Check commissioner status first — needed to decide whether ALREADY_RESOLVED
  -- is a hard block (non-commissioner) or an overrideable state (commissioner).
  v_is_commissioner := auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM league_members
     WHERE league_id = v_league_id AND user_id = auth.uid() AND role = 'commissioner'
  );

  IF v_status = 'resolved' THEN
    IF NOT v_is_commissioner THEN
      RETURN jsonb_build_object('ok', false, 'error', 'ALREADY_RESOLVED');
    END IF;

    -- Commissioner override: reverse old rewards before re-resolving.
    IF v_reward_type = 'budget' THEN
      -- Subtract the old reward from previously-winning squads (floor at 0).
      UPDATE squads
         SET budget_remaining = GREATEST(0, budget_remaining - v_reward_value)
       WHERE id IN (
         SELECT squad_id FROM bet_submissions
          WHERE bet_instance_id = p_instance_id AND is_correct = true
       );
    ELSIF v_reward_type = 'points' THEN
      -- Capture old winner user IDs — must re-aggregate them after the override
      -- so their total_points no longer reflects the now-invalid reward.
      SELECT COALESCE(array_agg(DISTINCT s.user_id), '{}')
        INTO v_old_points_user_ids
        FROM bet_submissions bs
        JOIN squads s ON s.id = bs.squad_id
       WHERE bs.bet_instance_id = p_instance_id AND bs.is_correct = true;
    END IF;

    -- Reset to 'closed' so normal processing proceeds (including final status update
    -- back to 'resolved' with the new correct_answers).
    UPDATE bet_instances SET status = 'closed' WHERE id = p_instance_id;
    v_status := 'closed';
  END IF;

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

  -- NULL or empty array = "no winner" resolution
  v_no_winner := (p_answers IS NULL OR array_length(p_answers, 1) IS NULL OR array_length(p_answers, 1) = 0);

  SELECT COUNT(*) INTO v_total FROM bet_submissions WHERE bet_instance_id = p_instance_id;

  IF v_no_winner THEN
    UPDATE bet_submissions
       SET is_correct = false, reward_awarded = NULL
     WHERE bet_instance_id = p_instance_id;
    v_winners := 0;
  ELSE
    SELECT COUNT(*) FILTER (WHERE answer = ANY(p_answers))
      INTO v_winners
      FROM bet_submissions WHERE bet_instance_id = p_instance_id;

    UPDATE bet_submissions
       SET is_correct     = (answer = ANY(p_answers)),
           reward_awarded = CASE WHEN answer = ANY(p_answers) THEN v_reward_value ELSE NULL END
     WHERE bet_instance_id = p_instance_id;
  END IF;

  -- Flip status to 'resolved' BEFORE crediting rewards below — the points-type
  -- reward path calls aggregate_league_member_points(), which sums bet rewards
  -- WHERE bi.status = 'resolved'. Doing this update first ensures that first
  -- immediate refresh actually picks up the new reward instead of silently
  -- summing 0. (Was previously the last statement in this function — see
  -- migration 242's header for the bug this fixes.)
  UPDATE bet_instances
     SET status            = 'resolved',
         correct_answer    = CASE WHEN v_no_winner THEN NULL ELSE p_answers[1] END,
         correct_answers   = COALESCE(p_answers, '{}'),
         winners_count     = v_winners,
         total_submissions = v_total
   WHERE id = p_instance_id;

  IF NOT v_no_winner THEN
    IF v_reward_type = 'budget' THEN
      UPDATE squads
         SET budget_remaining = budget_remaining + v_reward_value
       WHERE id IN (
         SELECT squad_id FROM bet_submissions
          WHERE bet_instance_id = p_instance_id AND answer = ANY(p_answers)
       );
    ELSIF v_reward_type = 'points' THEN
      -- Refresh total_points for new winners immediately
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

    -- Audit: log bet_win event for every winning submission
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
        NULL, NULL, NULL,
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

  -- Commissioner override: after the new correct_answers are written and status
  -- is back to 'resolved', re-aggregate old points-type winners so that managers
  -- who are NO LONGER correct lose their reward from the leaderboard.
  IF v_old_points_user_ids IS NOT NULL AND array_length(v_old_points_user_ids, 1) > 0 THEN
    FOREACH v_user_id IN ARRAY v_old_points_user_ids LOOP
      PERFORM aggregate_league_member_points(v_league_id, v_user_id);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',                  true,
    'winners',             v_winners,
    'total',               v_total,
    'no_winner',           v_no_winner,
    'submissions_updated', v_total
  );
END;
$$;
