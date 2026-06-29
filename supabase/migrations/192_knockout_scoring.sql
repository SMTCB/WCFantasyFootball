-- Migration 192: Knockout stage scoring — shootout columns + bet override
--
-- Part A — Penalty shootout stats columns on player_match_stats
--   Shootout events scored differently from regular in-match penalties:
--     player who scores:  +1 pt  (shootout_scored)
--     player who misses: -1 pt   (shootout_missed)
--     GK who saves:      +0.5 pt (shootout_saved)
--   ingest-match-events detects a penalty-shootout period (by period.type/name)
--   and routes events here instead of penalty_scored/penalty_missed.
--
-- Part B — Commissioner override for already-resolved bets
--   resolve_bet previously returned ALREADY_RESOLVED immediately when
--   bet_instances.status = 'resolved'. Auto-resolved match_result bets could
--   not be corrected even by a commissioner.
--   Fix: commissioners may re-resolve — old budget rewards are reversed, old
--   points-type winners are re-aggregated so leaderboard stays correct.

-- ── Part A: shootout stat columns ─────────────────────────────────────────────

ALTER TABLE player_match_stats
  ADD COLUMN IF NOT EXISTS shootout_scored  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shootout_missed  INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shootout_saved   INT DEFAULT 0;

-- ── Part B: resolve_bet commissioner override ─────────────────────────────────
-- Full function rewrite (latest: migration 187 + this change).
-- Only change: the ALREADY_RESOLVED block now allows commissioner override
-- instead of hard-blocking all callers.

CREATE OR REPLACE FUNCTION resolve_bet(p_instance_id uuid, p_answers text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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

  UPDATE bet_instances
     SET status            = 'resolved',
         correct_answer    = CASE WHEN v_no_winner THEN NULL ELSE p_answers[1] END,
         correct_answers   = COALESCE(p_answers, '{}'),
         winners_count     = v_winners,
         total_submissions = v_total
   WHERE id = p_instance_id;

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

GRANT EXECUTE ON FUNCTION resolve_bet(uuid, text[]) TO service_role, authenticated;

-- Keep single-text wrapper in sync (thin delegation to the array overload)
CREATE OR REPLACE FUNCTION resolve_bet(p_instance_id uuid, p_answer text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT resolve_bet(p_instance_id, ARRAY[p_answer]::text[]);
$$;

GRANT EXECUTE ON FUNCTION resolve_bet(uuid, text) TO service_role, authenticated;
