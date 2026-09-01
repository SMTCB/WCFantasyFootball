-- Migration 271: bet activity feed in Clubhouse chat (PR 4).
--
-- Adds kind/bet_ref to clubhouse_messages so create/resolve events on
-- p2p_bets and p2p_challenges post a system message into the circle's
-- default chat channel. A new internal helper, post_bet_activity_message,
-- resolves circle_id -> default channel_id and inserts the row; it swallows
-- its own exceptions so a messaging failure (e.g. missing default channel)
-- can never roll back the underlying bet/challenge/coin operation it's
-- called from.
--
-- Eight CREATE OR REPLACE touches, each adding exactly one
-- `PERFORM post_bet_activity_message(...)` call using data the function
-- already has in scope — every other line is reproduced unchanged from the
-- current production body (confirmed against supabase/schema.sql, not just
-- migration files, since p2p_challenges' freeform bet_type postdates the
-- older challenge migrations). finalize_declared_bets and
-- auto_void_stale_bet_disputes widen their cron loop variable from a plain
-- id to a RECORD (adding circle_id, creator_id, question, stake_coins to
-- the SELECT) so the message has what it needs.

ALTER TABLE clubhouse_messages
  ADD COLUMN kind text NOT NULL DEFAULT 'text',
  ADD COLUMN bet_ref jsonb;

ALTER TABLE clubhouse_messages
  ADD CONSTRAINT clubhouse_messages_kind_check CHECK (kind IN ('text', 'bet_activity'));

-- ── Helper ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION post_bet_activity_message(
  p_circle_id uuid, p_user_id uuid, p_content text, p_bet_ref jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_channel_id uuid;
BEGIN
  SELECT id INTO v_channel_id FROM clubhouse_channels
  WHERE circle_id = p_circle_id AND is_default = true LIMIT 1;
  IF v_channel_id IS NULL THEN RETURN; END IF;

  INSERT INTO clubhouse_messages (channel_id, user_id, content, kind, bet_ref)
  VALUES (v_channel_id, p_user_id, p_content, 'bet_activity', p_bet_ref);
EXCEPTION WHEN OTHERS THEN
  NULL; -- messaging must never block a bet/challenge/coin operation
END;
$$;

REVOKE ALL ON FUNCTION post_bet_activity_message(uuid, uuid, text, jsonb) FROM public, authenticated, anon;

-- ── 1. create_p2p_bet — created ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."create_p2p_bet"("p_circle_id" "uuid", "p_question" "text", "p_answer_mode" "text", "p_allow_multiple_answers" boolean, "p_target_mode" "text", "p_target_user_ids" "uuid"[], "p_options" "text"[], "p_stake_coins" integer, "p_starts_at" timestamp with time zone, "p_ends_at" timestamp with time zone) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_bet_id      uuid;
  v_option_id   uuid;
  v_label       text;
  v_idx         int := 0;
  v_target      uuid;
  v_daily_count int;
  v_starts_at   timestamptz := COALESCE(p_starts_at, now());
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF NOT is_circle_member(p_circle_id) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_MEMBER';
  END IF;
  IF p_answer_mode NOT IN ('freeform_text', 'multiple_choice') THEN
    RAISE EXCEPTION 'INVALID_ANSWER_MODE';
  END IF;
  IF p_target_mode NOT IN ('selected_users', 'whole_clubhouse') THEN
    RAISE EXCEPTION 'INVALID_TARGET_MODE';
  END IF;
  IF p_stake_coins < 10 OR p_stake_coins > 500 THEN
    RAISE EXCEPTION 'INVALID_STAKE';
  END IF;
  IF char_length(coalesce(p_question, '')) NOT BETWEEN 1 AND 140 THEN
    RAISE EXCEPTION 'INVALID_QUESTION';
  END IF;
  IF p_ends_at IS NOT NULL AND p_ends_at <= v_starts_at THEN
    RAISE EXCEPTION 'INVALID_TIME_WINDOW';
  END IF;

  IF p_answer_mode = 'multiple_choice' THEN
    IF p_options IS NULL OR array_length(p_options, 1) < 2 OR array_length(p_options, 1) > 8 THEN
      RAISE EXCEPTION 'INVALID_OPTIONS';
    END IF;
  ELSE
    IF p_options IS NOT NULL AND array_length(p_options, 1) > 0 THEN
      RAISE EXCEPTION 'OPTIONS_NOT_ALLOWED';
    END IF;
  END IF;

  IF p_target_mode = 'selected_users' THEN
    IF p_target_user_ids IS NULL OR array_length(p_target_user_ids, 1) < 1 OR array_length(p_target_user_ids, 1) > 50 THEN
      RAISE EXCEPTION 'INVALID_TARGETS';
    END IF;
    FOREACH v_target IN ARRAY p_target_user_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM circle_members WHERE circle_id = p_circle_id AND user_id = v_target) THEN
        RAISE EXCEPTION 'TARGET_NOT_CIRCLE_MEMBER';
      END IF;
    END LOOP;
  ELSE
    IF p_target_user_ids IS NOT NULL AND array_length(p_target_user_ids, 1) > 0 THEN
      RAISE EXCEPTION 'TARGETS_NOT_ALLOWED';
    END IF;
  END IF;

  SELECT COUNT(*) INTO v_daily_count
  FROM p2p_bets
  WHERE creator_id = auth.uid() AND circle_id = p_circle_id AND created_at > now() - interval '24 hours';
  IF v_daily_count >= 5 THEN
    RAISE EXCEPTION 'DAILY_BET_LIMIT_EXCEEDED';
  END IF;

  INSERT INTO p2p_bets (
    circle_id, creator_id, question, answer_mode, allow_multiple_answers,
    target_mode, stake_coins, starts_at, ends_at
  ) VALUES (
    p_circle_id, auth.uid(), p_question, p_answer_mode, COALESCE(p_allow_multiple_answers, false),
    p_target_mode, p_stake_coins, v_starts_at, p_ends_at
  ) RETURNING id INTO v_bet_id;

  IF p_answer_mode = 'multiple_choice' THEN
    FOREACH v_label IN ARRAY p_options LOOP
      INSERT INTO p2p_bet_options (bet_id, label, sort_order) VALUES (v_bet_id, v_label, v_idx);
      v_idx := v_idx + 1;
    END LOOP;
  END IF;

  IF p_target_mode = 'selected_users' THEN
    FOREACH v_target IN ARRAY p_target_user_ids LOOP
      INSERT INTO p2p_bet_targets (bet_id, user_id) VALUES (v_bet_id, v_target);
    END LOOP;
  END IF;

  -- Creator auto-joins as the first participant (mirrors the 1:1 challenge flow,
  -- where the challenger's stake moves to escrow the moment they send it).
  PERFORM debit_coins_to_escrow(auth.uid(), p_stake_coins, NULL, jsonb_build_object('bet_id', v_bet_id), v_bet_id);
  INSERT INTO p2p_bet_participants (bet_id, user_id, status, stake_coins, joined_at)
  VALUES (v_bet_id, auth.uid(), 'joined', p_stake_coins, now());

  PERFORM post_bet_activity_message(
    p_circle_id, auth.uid(),
    '🎲 New bet: ' || p_question || ' · ' || p_stake_coins || ' coins',
    jsonb_build_object('ref_kind', 'bet', 'ref_id', v_bet_id, 'event', 'created', 'question', p_question, 'stake_coins', p_stake_coins)
  );

  RETURN v_bet_id;
END;
$$;

-- ── 2. create_p2p_challenge — created ───────────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."create_p2p_challenge"("p_circle_id" "uuid", "p_opponent_id" "uuid", "p_bet_type" "text", "p_stake_coins" integer, "p_message" "text" DEFAULT NULL::"text", "p_league_id" "uuid" DEFAULT NULL::"uuid", "p_matchday_id" "text" DEFAULT NULL::"text", "p_question" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_challenger_id   uuid := auth.uid();
  v_challenge_id    uuid;
  v_min_stake       int  := 10;
  v_max_stake       int  := 500;
  v_enabled         boolean := true;
  v_daily_limit     int  := 5;
  v_today_count     int  := 0;
  v_cfg             p2p_config;
  v_resolution_mode text;
BEGIN
  IF v_challenger_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_bet_type NOT IN ('gw_total', 'freeform') THEN
    RAISE EXCEPTION 'BET_TYPE_NOT_SUPPORTED';
  END IF;

  -- Both parties must be members of the circle (shared by both bet types).
  -- An open challenge (p_opponent_id IS NULL) has no opponent yet — skip.
  IF NOT is_circle_member(p_circle_id) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_MEMBER';
  END IF;
  IF p_opponent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = p_opponent_id
  ) THEN
    RAISE EXCEPTION 'OPPONENT_NOT_CIRCLE_MEMBER';
  END IF;

  IF p_bet_type = 'gw_total' THEN
    v_resolution_mode := 'auto';
    p_question := NULL;

    IF p_league_id IS NULL OR p_matchday_id IS NULL THEN
      RAISE EXCEPTION 'LEAGUE_AND_MATCHDAY_REQUIRED';
    END IF;

    -- The league must actually belong to this circle
    IF NOT EXISTS (
      SELECT 1 FROM leagues WHERE id = p_league_id AND circle_id = p_circle_id
    ) THEN
      RAISE EXCEPTION 'LEAGUE_NOT_IN_CIRCLE';
    END IF;

    -- Load league p2p config (use defaults if no row)
    SELECT * INTO v_cfg FROM p2p_config WHERE league_id = p_league_id;
    IF FOUND THEN
      v_min_stake   := v_cfg.min_stake;
      v_max_stake   := v_cfg.max_stake;
      v_daily_limit := v_cfg.daily_challenge_limit;
      v_enabled     := v_cfg.challenges_enabled;
    END IF;

    IF NOT v_enabled THEN
      RAISE EXCEPTION 'CHALLENGES_DISABLED';
    END IF;

    -- Daily challenge limit (challenges created today by this user in this league)
    SELECT COUNT(*) INTO v_today_count
    FROM p2p_challenges
    WHERE challenger_id = v_challenger_id
      AND league_id     = p_league_id
      AND created_at    > now() - interval '24 hours';

    IF v_today_count >= v_daily_limit THEN
      RAISE EXCEPTION 'DAILY_LIMIT_REACHED (limit=%)', v_daily_limit;
    END IF;

    -- Both parties must also be members of the specific league this bet is on.
    -- Open challenges check this for the claimant at claim time instead.
    IF NOT EXISTS (
      SELECT 1 FROM league_members
      WHERE league_id = p_league_id AND user_id = v_challenger_id
    ) THEN
      RAISE EXCEPTION 'NOT_LEAGUE_MEMBER';
    END IF;
    IF p_opponent_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM league_members
      WHERE league_id = p_league_id AND user_id = p_opponent_id
    ) THEN
      RAISE EXCEPTION 'OPPONENT_NOT_MEMBER';
    END IF;

    -- No duplicate pending/accepted challenge between same pair in same matchday
    IF EXISTS (
      SELECT 1 FROM p2p_challenges
      WHERE league_id = p_league_id
        AND matchday_id = p_matchday_id
        AND status IN ('pending', 'accepted')
        AND (
          (challenger_id = v_challenger_id AND opponent_id = p_opponent_id)
          OR (challenger_id = p_opponent_id AND opponent_id = v_challenger_id)
        )
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_CHALLENGE';
    END IF;
  ELSE
    -- freeform: no league/matchday, no per-league config -- just circle-scoped
    -- daily limit + a matching question required.
    v_resolution_mode := 'manual';
    p_league_id   := NULL;
    p_matchday_id := NULL;

    IF p_question IS NULL OR char_length(trim(p_question)) = 0 THEN
      RAISE EXCEPTION 'QUESTION_REQUIRED';
    END IF;

    IF char_length(p_question) > 140 THEN
      RAISE EXCEPTION 'QUESTION_TOO_LONG';
    END IF;

    SELECT COUNT(*) INTO v_today_count
    FROM p2p_challenges
    WHERE challenger_id = v_challenger_id
      AND circle_id     = p_circle_id
      AND bet_type      = 'freeform'
      AND created_at    > now() - interval '24 hours';

    IF v_today_count >= v_daily_limit THEN
      RAISE EXCEPTION 'DAILY_LIMIT_REACHED (limit=%)', v_daily_limit;
    END IF;

    -- No duplicate pending/accepted identical-question challenge between same pair
    IF EXISTS (
      SELECT 1 FROM p2p_challenges
      WHERE circle_id = p_circle_id
        AND bet_type  = 'freeform'
        AND question  = p_question
        AND status IN ('pending', 'accepted')
        AND (
          (challenger_id = v_challenger_id AND opponent_id = p_opponent_id)
          OR (challenger_id = p_opponent_id AND opponent_id = v_challenger_id)
        )
    ) THEN
      RAISE EXCEPTION 'DUPLICATE_CHALLENGE';
    END IF;
  END IF;

  IF p_stake_coins < v_min_stake THEN
    RAISE EXCEPTION 'STAKE_TOO_LOW (min=%)', v_min_stake;
  END IF;

  IF p_stake_coins > v_max_stake THEN
    RAISE EXCEPTION 'STAKE_TOO_HIGH (max=%)', v_max_stake;
  END IF;

  -- Deduct challenger stake to escrow
  PERFORM debit_coins_to_escrow(
    v_challenger_id,
    p_stake_coins,
    NULL,
    jsonb_build_object('reason', 'challenge_stake', 'bet_type', p_bet_type, 'matchday_id', p_matchday_id)
  );

  INSERT INTO p2p_challenges (
    circle_id, league_id, challenger_id, opponent_id, matchday_id,
    bet_type, resolution_mode, stake_coins, message, question, status
  ) VALUES (
    p_circle_id, p_league_id, v_challenger_id, p_opponent_id, p_matchday_id,
    p_bet_type, v_resolution_mode, p_stake_coins, p_message, p_question, 'pending'
  )
  RETURNING id INTO v_challenge_id;

  -- Back-fill challenge_id on the stake transaction
  UPDATE coin_transactions
  SET challenge_id = v_challenge_id
  WHERE user_id    = v_challenger_id
    AND type       = 'stake'
    AND challenge_id IS NULL
    AND created_at > now() - interval '5 seconds';

  PERFORM post_bet_activity_message(
    p_circle_id, v_challenger_id,
    '⚔ New challenge: ' || COALESCE(p_question, 'GW ' || p_matchday_id) || ' · ' || p_stake_coins || ' coins',
    jsonb_build_object('ref_kind', 'challenge', 'ref_id', v_challenge_id, 'event', 'created', 'question', COALESCE(p_question, 'GW ' || p_matchday_id), 'stake_coins', p_stake_coins)
  );

  RETURN jsonb_build_object('challenge_id', v_challenge_id);
END;
$$;

-- ── 3. arbitrate_bet_outcome — resolved ─────────────────────────────────────

CREATE OR REPLACE FUNCTION arbitrate_bet_outcome(
  p_bet_id             uuid,
  p_winning_option_ids uuid[] DEFAULT NULL,
  p_winning_user_ids   uuid[] DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet p2p_bets%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_bet FROM p2p_bets WHERE id = p_bet_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BET_NOT_FOUND';
  END IF;
  IF v_bet.status <> 'disputed' THEN
    RAISE EXCEPTION 'BET_NOT_DISPUTED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM circle_members WHERE circle_id = v_bet.circle_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_OWNER';
  END IF;

  UPDATE p2p_bet_participants SET declared_correct = false, is_winner = false WHERE bet_id = p_bet_id;
  UPDATE p2p_bet_options SET is_correct = false WHERE bet_id = p_bet_id;

  IF v_bet.answer_mode = 'multiple_choice' THEN
    IF p_winning_option_ids IS NOT NULL AND array_length(p_winning_option_ids, 1) > 0 THEN
      IF (SELECT COUNT(*) FROM p2p_bet_options WHERE bet_id = p_bet_id AND id = ANY(p_winning_option_ids))
         <> array_length(p_winning_option_ids, 1) THEN
        RAISE EXCEPTION 'INVALID_OPTION';
      END IF;
      UPDATE p2p_bet_options SET is_correct = true WHERE bet_id = p_bet_id AND id = ANY(p_winning_option_ids);
      UPDATE p2p_bet_participants pp SET is_winner = true
      WHERE pp.bet_id = p_bet_id AND pp.status = 'joined' AND EXISTS (
        SELECT 1 FROM p2p_bet_participant_answers pa
        WHERE pa.participant_id = pp.id AND pa.option_id = ANY(p_winning_option_ids)
      );
    END IF;
  ELSE
    IF p_winning_user_ids IS NOT NULL AND array_length(p_winning_user_ids, 1) > 0 THEN
      UPDATE p2p_bet_participants SET is_winner = true
      WHERE bet_id = p_bet_id AND status = 'joined' AND user_id = ANY(p_winning_user_ids);
    END IF;
  END IF;

  PERFORM settle_bet_coins(p_bet_id);

  UPDATE p2p_bets SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = p_bet_id;

  PERFORM post_bet_activity_message(
    v_bet.circle_id, auth.uid(),
    '✅ Bet resolved: ' || v_bet.question,
    jsonb_build_object('ref_kind', 'bet', 'ref_id', p_bet_id, 'event', 'resolved', 'question', v_bet.question, 'stake_coins', v_bet.stake_coins)
  );
END;
$$;

REVOKE ALL ON FUNCTION arbitrate_bet_outcome(uuid, uuid[], uuid[]) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION arbitrate_bet_outcome(uuid, uuid[], uuid[]) TO authenticated;

-- ── 4. finalize_declared_bets (cron) — resolved ─────────────────────────────

CREATE OR REPLACE FUNCTION finalize_declared_bets() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet RECORD;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  FOR v_bet IN
    SELECT id, circle_id, creator_id, question, stake_coins FROM p2p_bets
    WHERE status = 'closed' AND declared_at IS NOT NULL AND objection_deadline <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE p2p_bet_participants SET is_winner = declared_correct WHERE bet_id = v_bet.id;
    PERFORM settle_bet_coins(v_bet.id);
    UPDATE p2p_bets SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = v_bet.id;
    PERFORM post_bet_activity_message(
      v_bet.circle_id, v_bet.creator_id,
      '✅ Bet resolved: ' || v_bet.question,
      jsonb_build_object('ref_kind', 'bet', 'ref_id', v_bet.id, 'event', 'resolved', 'question', v_bet.question, 'stake_coins', v_bet.stake_coins)
    );
  END LOOP;
END;
$$;

-- ── 5. auto_void_stale_bet_disputes (cron) — resolved ───────────────────────

CREATE OR REPLACE FUNCTION auto_void_stale_bet_disputes() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet RECORD;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  FOR v_bet IN
    SELECT id, circle_id, creator_id, question, stake_coins FROM p2p_bets
    WHERE status = 'disputed' AND dispute_deadline <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE p2p_bet_participants SET is_winner = false, declared_correct = false WHERE bet_id = v_bet.id;
    PERFORM settle_bet_coins(v_bet.id);
    UPDATE p2p_bets SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = v_bet.id;
    PERFORM post_bet_activity_message(
      v_bet.circle_id, v_bet.creator_id,
      '⚖️ Bet voided (dispute unresolved): ' || v_bet.question,
      jsonb_build_object('ref_kind', 'bet', 'ref_id', v_bet.id, 'event', 'resolved', 'question', v_bet.question, 'stake_coins', v_bet.stake_coins)
    );
  END LOOP;
END;
$$;

-- ── 6. resolve_p2p_challenge (cron) — resolved ──────────────────────────────

CREATE OR REPLACE FUNCTION "public"."resolve_p2p_challenge"("p_challenge_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_ch              p2p_challenges;
  v_challenger_pts  numeric;
  v_opponent_pts    numeric;
  v_winner_id       uuid;
  v_is_tie          boolean := false;
  v_total_pot       int;
  v_rake            int;
  v_prize           int;
  v_loser_id        uuid;
  v_challenger_name text;
  v_opponent_name   text;
  v_loser_escrow    int;
BEGIN
  -- Service role / cron check — authenticated users cannot call this
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.status <> 'accepted' THEN
    RAISE EXCEPTION 'CHALLENGE_NOT_ACCEPTED (status=%)', v_ch.status;
  END IF;

  -- Guard: only resolve when the matchday is settled (gazette activity entry exists for this league+round)
  IF NOT EXISTS (
    SELECT 1 FROM gazette_entries
    WHERE league_id   = v_ch.league_id
      AND entry_type  = 'activity'
      AND full_data->>'matchday_id' = v_ch.matchday_id
  ) THEN
    RAISE EXCEPTION 'MATCHDAY_NOT_SETTLED';
  END IF;

  -- Get pts for both managers (latest squad in this league for each user)
  SELECT fp.total INTO v_challenger_pts
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE fp.matchday_id = v_ch.matchday_id
    AND s.league_id    = v_ch.league_id
    AND s.user_id      = v_ch.challenger_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT fp.total INTO v_opponent_pts
  FROM fantasy_points fp
  JOIN squads s ON s.id = fp.squad_id
  WHERE fp.matchday_id = v_ch.matchday_id
    AND s.league_id    = v_ch.league_id
    AND s.user_id      = v_ch.opponent_id
  ORDER BY s.created_at DESC
  LIMIT 1;

  -- Default missing pts to 0 (no squad / no score yet)
  v_challenger_pts := COALESCE(v_challenger_pts, 0);
  v_opponent_pts   := COALESCE(v_opponent_pts, 0);

  -- Determine outcome
  IF v_challenger_pts > v_opponent_pts THEN
    v_winner_id := v_ch.challenger_id;
    v_loser_id  := v_ch.opponent_id;
  ELSIF v_opponent_pts > v_challenger_pts THEN
    v_winner_id := v_ch.opponent_id;
    v_loser_id  := v_ch.challenger_id;
  ELSE
    v_is_tie := true;
  END IF;

  -- Coin math
  v_total_pot := v_ch.stake_coins * 2;
  v_rake      := FLOOR(v_total_pot * 0.05);
  v_prize     := v_total_pot - v_rake;  -- winner's total payout (or each party gets stake back on tie)

  IF v_is_tie THEN
    -- Each player's own stake goes back to their own balance — release_escrow()
    -- already logs its own 'refund' transaction, so nothing further to credit.
    PERFORM release_escrow(v_ch.challenger_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_tie'));
    PERFORM release_escrow(v_ch.opponent_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_tie'));
  ELSE
    -- Winner: their own escrowed stake is unlocked back to their balance...
    PERFORM release_escrow(v_winner_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_resolved'));
    -- ...then the net winnings (loser's stake minus rake) are credited on top,
    -- so the winner's total gain is stake*2 - rake, sourced from the loser.
    PERFORM credit_coins(v_winner_id, v_prize - v_ch.stake_coins, 'win', p_challenge_id,
      jsonb_build_object(
        'reason',        'challenge_won',
        'stake',         v_ch.stake_coins,
        'prize',         v_prize,
        'rake',          v_rake,
        'opponent_pts',  CASE WHEN v_winner_id = v_ch.challenger_id THEN v_opponent_pts ELSE v_challenger_pts END,
        'winner_pts',    CASE WHEN v_winner_id = v_ch.challenger_id THEN v_challenger_pts ELSE v_opponent_pts END
      ));

    -- Loser: stake is forfeited — decrement escrow directly (never released back
    -- to their balance), then log an audit-only transaction. Not routed through
    -- credit_coins(): it rejects non-positive amounts, and this is not a credit.
    SELECT escrow INTO v_loser_escrow FROM coin_wallets WHERE user_id = v_loser_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
    IF v_loser_escrow < v_ch.stake_coins THEN RAISE EXCEPTION 'INSUFFICIENT_ESCROW'; END IF;

    UPDATE coin_wallets
    SET escrow     = escrow - v_ch.stake_coins,
        updated_at = now()
    WHERE user_id = v_loser_id;

    INSERT INTO coin_transactions (user_id, type, amount, challenge_id, meta)
    VALUES (v_loser_id, 'loss', v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'challenge_lost', 'stake_lost', v_ch.stake_coins));
  END IF;

  -- Update challenge row
  UPDATE p2p_challenges SET
    status          = 'resolved',
    winner_id       = v_winner_id,  -- NULL on tie
    challenger_pts  = v_challenger_pts,
    opponent_pts    = v_opponent_pts,
    resolved_at     = now(),
    updated_at      = now()
  WHERE id = p_challenge_id;

  -- Write gazette entry (p2p_result) so it shows in league activity feed
  SELECT username INTO v_challenger_name FROM users WHERE id = v_ch.challenger_id;
  SELECT username INTO v_opponent_name   FROM users WHERE id = v_ch.opponent_id;

  INSERT INTO gazette_entries (league_id, entry_type, headline, bullets, full_data, published_at)
  VALUES (
    v_ch.league_id,
    'p2p_result',
    CASE
      WHEN v_is_tie THEN
        v_challenger_name || ' vs ' || v_opponent_name || ' — ' ||
        'DRAW · ' || v_ch.stake_coins || ' coins each returned'
      ELSE
        (CASE WHEN v_winner_id = v_ch.challenger_id THEN v_challenger_name ELSE v_opponent_name END) ||
        ' beat ' ||
        (CASE WHEN v_winner_id = v_ch.challenger_id THEN v_opponent_name ELSE v_challenger_name END) ||
        ' — ' || v_prize || ' coins won'
    END,
    jsonb_build_array(
      v_challenger_name || ' · ' || v_challenger_pts || ' pts',
      v_opponent_name   || ' · ' || v_opponent_pts   || ' pts',
      'GW: ' || v_ch.matchday_id || ' · Stake: ' || v_ch.stake_coins || ' coins'
    ),
    jsonb_build_object(
      'challenge_id',    p_challenge_id,
      'matchday_id',     v_ch.matchday_id,
      'is_tie',          v_is_tie,
      'winner_id',       v_winner_id,
      'prize',           v_prize,
      'rake',            v_rake
    ),
    now()
  );

  PERFORM post_bet_activity_message(
    v_ch.circle_id,
    COALESCE(v_winner_id, v_ch.challenger_id),
    CASE
      WHEN v_is_tie THEN v_challenger_name || ' vs ' || v_opponent_name || ' — draw, coins returned'
      ELSE (CASE WHEN v_winner_id = v_ch.challenger_id THEN v_challenger_name ELSE v_opponent_name END) || ' won ' || v_prize || ' coins'
    END,
    jsonb_build_object('ref_kind', 'challenge', 'ref_id', p_challenge_id, 'event', 'resolved', 'question', COALESCE(v_ch.question, 'GW ' || v_ch.matchday_id), 'stake_coins', v_ch.stake_coins)
  );

  RETURN jsonb_build_object(
    'status',          'resolved',
    'is_tie',          v_is_tie,
    'winner_id',       v_winner_id,
    'challenger_pts',  v_challenger_pts,
    'opponent_pts',    v_opponent_pts,
    'prize',           v_prize,
    'rake',            v_rake
  );
END;
$$;

-- ── 7. confirm_freeform_result — resolved ───────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."confirm_freeform_result"("p_challenge_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_ch            p2p_challenges;
  v_winner_id     uuid;
  v_loser_id      uuid;
  v_total_pot     int;
  v_rake          int;
  v_prize         int;
  v_loser_escrow  int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.bet_type <> 'freeform' THEN RAISE EXCEPTION 'NOT_FREEFORM'; END IF;
  IF v_ch.status <> 'accepted' THEN RAISE EXCEPTION 'INVALID_STATUS (status=%)', v_ch.status; END IF;
  IF v_ch.proposed_by IS NULL THEN RAISE EXCEPTION 'NO_PROPOSAL'; END IF;
  IF v_uid = v_ch.proposed_by THEN RAISE EXCEPTION 'CANNOT_CONFIRM_OWN_PROPOSAL'; END IF;
  IF v_uid NOT IN (v_ch.challenger_id, v_ch.opponent_id) THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT';
  END IF;

  v_winner_id := v_ch.proposed_winner_id;
  v_total_pot := v_ch.stake_coins * 2;

  IF v_winner_id IS NULL THEN
    -- Push: each party's own stake goes back to their own balance.
    PERFORM release_escrow(v_ch.challenger_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'freeform_push'));
    PERFORM release_escrow(v_ch.opponent_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'freeform_push'));
  ELSE
    v_loser_id := CASE WHEN v_winner_id = v_ch.challenger_id THEN v_ch.opponent_id ELSE v_ch.challenger_id END;
    v_rake     := FLOOR(v_total_pot * 0.05);
    v_prize    := v_total_pot - v_rake;

    PERFORM release_escrow(v_winner_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'freeform_resolved'));
    PERFORM credit_coins(v_winner_id, v_prize - v_ch.stake_coins, 'win', p_challenge_id,
      jsonb_build_object('reason', 'freeform_won', 'stake', v_ch.stake_coins, 'prize', v_prize, 'rake', v_rake));

    SELECT escrow INTO v_loser_escrow FROM coin_wallets WHERE user_id = v_loser_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
    IF v_loser_escrow < v_ch.stake_coins THEN RAISE EXCEPTION 'INSUFFICIENT_ESCROW'; END IF;

    UPDATE coin_wallets
    SET escrow = escrow - v_ch.stake_coins, updated_at = now()
    WHERE user_id = v_loser_id;

    INSERT INTO coin_transactions (user_id, type, amount, challenge_id, meta)
    VALUES (v_loser_id, 'loss', v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'freeform_lost', 'stake_lost', v_ch.stake_coins));
  END IF;

  UPDATE p2p_challenges
  SET status      = 'resolved',
      winner_id   = v_winner_id,
      resolved_at = now(),
      updated_at  = now()
  WHERE id = p_challenge_id;

  PERFORM post_bet_activity_message(
    v_ch.circle_id, v_uid,
    '✅ Challenge resolved: ' || v_ch.question,
    jsonb_build_object('ref_kind', 'challenge', 'ref_id', p_challenge_id, 'event', 'resolved', 'question', v_ch.question, 'stake_coins', v_ch.stake_coins)
  );

  RETURN jsonb_build_object('status', 'resolved', 'winner_id', v_winner_id);
END;
$$;

-- ── 8. arbitrate_freeform_result — resolved ─────────────────────────────────

CREATE OR REPLACE FUNCTION "public"."arbitrate_freeform_result"("p_challenge_id" "uuid", "p_winner_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_ch            p2p_challenges;
  v_loser_id      uuid;
  v_total_pot     int;
  v_rake          int;
  v_prize         int;
  v_loser_escrow  int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.bet_type <> 'freeform' THEN RAISE EXCEPTION 'NOT_FREEFORM'; END IF;
  IF v_ch.status <> 'disputed' THEN RAISE EXCEPTION 'INVALID_STATUS (status=%)', v_ch.status; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = v_ch.circle_id AND user_id = v_uid AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_OWNER';
  END IF;
  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (v_ch.challenger_id, v_ch.opponent_id) THEN
    RAISE EXCEPTION 'INVALID_WINNER';
  END IF;

  v_total_pot := v_ch.stake_coins * 2;

  IF p_winner_id IS NULL THEN
    -- Void: each party's own stake goes back to their own balance.
    PERFORM release_escrow(v_ch.challenger_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'freeform_voided'));
    PERFORM release_escrow(v_ch.opponent_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'freeform_voided'));
  ELSE
    v_loser_id := CASE WHEN p_winner_id = v_ch.challenger_id THEN v_ch.opponent_id ELSE v_ch.challenger_id END;
    v_rake     := FLOOR(v_total_pot * 0.05);
    v_prize    := v_total_pot - v_rake;

    PERFORM release_escrow(p_winner_id, v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'freeform_arbitrated'));
    PERFORM credit_coins(p_winner_id, v_prize - v_ch.stake_coins, 'win', p_challenge_id,
      jsonb_build_object('reason', 'freeform_arbitrated_win', 'stake', v_ch.stake_coins, 'prize', v_prize, 'rake', v_rake));

    SELECT escrow INTO v_loser_escrow FROM coin_wallets WHERE user_id = v_loser_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'WALLET_NOT_FOUND'; END IF;
    IF v_loser_escrow < v_ch.stake_coins THEN RAISE EXCEPTION 'INSUFFICIENT_ESCROW'; END IF;

    UPDATE coin_wallets
    SET escrow = escrow - v_ch.stake_coins, updated_at = now()
    WHERE user_id = v_loser_id;

    INSERT INTO coin_transactions (user_id, type, amount, challenge_id, meta)
    VALUES (v_loser_id, 'loss', v_ch.stake_coins, p_challenge_id,
      jsonb_build_object('reason', 'freeform_arbitrated_loss', 'stake_lost', v_ch.stake_coins));
  END IF;

  UPDATE p2p_challenges
  SET status      = 'resolved',
      winner_id   = p_winner_id,
      resolved_at = now(),
      updated_at  = now()
  WHERE id = p_challenge_id;

  PERFORM post_bet_activity_message(
    v_ch.circle_id, v_uid,
    '✅ Challenge resolved: ' || v_ch.question,
    jsonb_build_object('ref_kind', 'challenge', 'ref_id', p_challenge_id, 'event', 'resolved', 'question', v_ch.question, 'stake_coins', v_ch.stake_coins)
  );

  RETURN jsonb_build_object('status', 'resolved', 'winner_id', p_winner_id);
END;
$$;
