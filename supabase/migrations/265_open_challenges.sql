-- PR 1.5: Open Challenges — let a 1:1/Football GW challenge be posted without
-- naming an opponent; first circle member to claim it becomes the opponent and
-- the challenge then behaves exactly like a normal 1:1 challenge (existing
-- accept/decline/resolve/auto-resolve flows are untouched).

-- 1. Allow opponent_id to be null (unclaimed/open), tolerate it in the self-challenge check.
ALTER TABLE p2p_challenges ALTER COLUMN opponent_id DROP NOT NULL;

ALTER TABLE p2p_challenges DROP CONSTRAINT no_self_challenge;
ALTER TABLE p2p_challenges ADD CONSTRAINT no_self_challenge
  CHECK (opponent_id IS NULL OR challenger_id <> opponent_id);

-- 2. create_p2p_challenge: opponent-membership checks become conditional on
--    p_opponent_id being provided (an open challenge has no opponent yet).
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

  RETURN jsonb_build_object('challenge_id', v_challenge_id);
END;
$$;

ALTER FUNCTION "public"."create_p2p_challenge"("p_circle_id" "uuid", "p_opponent_id" "uuid", "p_bet_type" "text", "p_stake_coins" integer, "p_message" "text", "p_league_id" "uuid", "p_matchday_id" "text", "p_question" "text") OWNER TO "postgres";

-- 3. claim_p2p_challenge: circle member (and, for gw_total, league member)
--    claims an open challenge by setting opponent_id. No staking here — the
--    claimant then calls the existing accept_p2p_challenge to stake and accept.
CREATE OR REPLACE FUNCTION "public"."claim_p2p_challenge"("p_challenge_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ch      p2p_challenges;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.opponent_id IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_CLAIMED'; END IF;
  IF v_ch.status <> 'pending' THEN RAISE EXCEPTION 'CHALLENGE_NOT_PENDING'; END IF;
  IF v_ch.expires_at < now() THEN RAISE EXCEPTION 'CHALLENGE_EXPIRED'; END IF;
  IF v_ch.challenger_id = v_user_id THEN RAISE EXCEPTION 'CANNOT_CLAIM_OWN_CHALLENGE'; END IF;

  IF NOT is_circle_member(v_ch.circle_id) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_MEMBER';
  END IF;

  IF v_ch.bet_type = 'gw_total' AND NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = v_ch.league_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'NOT_LEAGUE_MEMBER';
  END IF;

  UPDATE p2p_challenges
  SET opponent_id = v_user_id, updated_at = now()
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('status', 'claimed');
END;
$$;

ALTER FUNCTION "public"."claim_p2p_challenge"("p_challenge_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."claim_p2p_challenge"("p_challenge_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_p2p_challenge"("p_challenge_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."claim_p2p_challenge"("p_challenge_id" "uuid") TO "authenticated";

-- 4. get_open_challenges: circle-wide discovery feed of unclaimed challenges,
--    mirroring get_clubhouse_bets. Excludes the caller's own (they already see
--    those via get_my_challenges' outgoing bucket) and expired ones.
CREATE OR REPLACE FUNCTION "public"."get_open_challenges"("p_circle_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result  jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;
  IF NOT is_circle_member(p_circle_id) THEN RAISE EXCEPTION 'NOT_CIRCLE_MEMBER'; END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                  c.id,
      'circle_id',           c.circle_id,
      'league_id',           c.league_id,
      'challenger_id',       c.challenger_id,
      'challenger_username', cu.username,
      'bet_type',            c.bet_type,
      'matchday_id',         c.matchday_id,
      'question',            c.question,
      'stake_coins',         c.stake_coins,
      'message',             c.message,
      'expires_at',          c.expires_at,
      'created_at',          c.created_at
    )
    ORDER BY c.created_at DESC
  )
  INTO v_result
  FROM p2p_challenges c
  LEFT JOIN users cu ON cu.id = c.challenger_id
  WHERE c.circle_id = p_circle_id
    AND c.status = 'pending'
    AND c.opponent_id IS NULL
    AND c.expires_at > now()
    AND c.challenger_id <> v_user_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

ALTER FUNCTION "public"."get_open_challenges"("p_circle_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."get_open_challenges"("p_circle_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_open_challenges"("p_circle_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_open_challenges"("p_circle_id" "uuid") TO "authenticated";
