-- Circle-scope challenge creation and listing.
--
-- create_p2p_challenge/get_my_challenges are rewritten from single-league scope to
-- Clubhouse (circle) scope: eligibility becomes circle_members for both parties.
-- bet_type='gw_total' (the only legal value until the freeform PR widens the table's
-- bet_type CHECK) additionally requires a league_id/matchday_id and that the league is
-- linked to the circle. p_question is accepted in the signature now (so the freeform PR
-- doesn't need another signature change) but unused -- the p2p_challenges table has no
-- `question` column yet, and this function rejects any bet_type other than 'gw_total'.
--
-- This is a breaking signature change (new required p_circle_id, p_bet_type params;
-- p_league_id/p_matchday_id become optional). Old overloads are dropped, not replaced,
-- so no stale single-league entrypoint is left callable. Ships with the matching
-- frontend change in the same PR -- this also fixes the live bug where
-- ChallengeScreen.jsx hardcoded leagueId={null}, since the new eligibility path no
-- longer requires a league at the top level.

DROP FUNCTION IF EXISTS public.create_p2p_challenge(uuid, uuid, text, integer, text);
DROP FUNCTION IF EXISTS public.get_my_challenges(uuid);

CREATE FUNCTION public.create_p2p_challenge(
  p_circle_id    uuid,
  p_opponent_id  uuid,
  p_bet_type     text,
  p_stake_coins  integer,
  p_message      text DEFAULT NULL::text,
  p_league_id    uuid DEFAULT NULL::uuid,
  p_matchday_id  text DEFAULT NULL::text,
  p_question     text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_challenger_id uuid := auth.uid();
  v_challenge_id  uuid;
  v_min_stake     int  := 10;
  v_max_stake     int  := 500;
  v_enabled       boolean := true;
  v_daily_limit   int  := 5;
  v_today_count   int  := 0;
  v_cfg           p2p_config;
BEGIN
  IF v_challenger_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  IF p_bet_type <> 'gw_total' THEN
    RAISE EXCEPTION 'BET_TYPE_NOT_SUPPORTED';
  END IF;

  IF p_league_id IS NULL OR p_matchday_id IS NULL THEN
    RAISE EXCEPTION 'LEAGUE_AND_MATCHDAY_REQUIRED';
  END IF;

  -- Both parties must be members of the circle
  IF NOT is_circle_member(p_circle_id) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_MEMBER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = p_opponent_id
  ) THEN
    RAISE EXCEPTION 'OPPONENT_NOT_CIRCLE_MEMBER';
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

  IF p_stake_coins < v_min_stake THEN
    RAISE EXCEPTION 'STAKE_TOO_LOW (min=%)', v_min_stake;
  END IF;

  IF p_stake_coins > v_max_stake THEN
    RAISE EXCEPTION 'STAKE_TOO_HIGH (max=%)', v_max_stake;
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

  -- Both parties must also be members of the specific league this bet is on
  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = v_challenger_id
  ) THEN
    RAISE EXCEPTION 'NOT_LEAGUE_MEMBER';
  END IF;
  IF NOT EXISTS (
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

  -- Deduct challenger stake to escrow
  PERFORM debit_coins_to_escrow(
    v_challenger_id,
    p_stake_coins,
    NULL,
    jsonb_build_object('reason', 'challenge_stake', 'matchday_id', p_matchday_id)
  );

  INSERT INTO p2p_challenges (
    circle_id, league_id, challenger_id, opponent_id, matchday_id,
    bet_type, stake_coins, message, status
  ) VALUES (
    p_circle_id, p_league_id, v_challenger_id, p_opponent_id, p_matchday_id,
    p_bet_type, p_stake_coins, p_message, 'pending'
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
$function$;

REVOKE ALL ON FUNCTION public.create_p2p_challenge(uuid, uuid, text, integer, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_p2p_challenge(uuid, uuid, text, integer, text, uuid, text, text) TO authenticated;

CREATE FUNCTION public.get_my_challenges(p_circle_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_result  jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                   c.id,
      'circle_id',            c.circle_id,
      'league_id',            c.league_id,
      'challenger_id',        c.challenger_id,
      'challenger_username',  cu.username,
      'opponent_id',          c.opponent_id,
      'opponent_username',    ou.username,
      'bet_type',             c.bet_type,
      'matchday_id',          c.matchday_id,
      'stake_coins',          c.stake_coins,
      'message',              c.message,
      'status',               c.status,
      'winner_id',            c.winner_id,
      'challenger_pts',       c.challenger_pts,
      'opponent_pts',         c.opponent_pts,
      'expires_at',           c.expires_at,
      'resolved_at',          c.resolved_at,
      'created_at',           c.created_at,
      'updated_at',           c.updated_at
    )
    ORDER BY c.created_at DESC
  )
  INTO v_result
  FROM p2p_challenges c
  LEFT JOIN users cu ON cu.id = c.challenger_id
  LEFT JOIN users ou ON ou.id = c.opponent_id
  WHERE (c.challenger_id = v_user_id OR c.opponent_id = v_user_id)
    AND (p_circle_id IS NULL OR c.circle_id = p_circle_id)
    AND (
      c.status IN ('pending', 'accepted')
      OR c.created_at > now() - interval '30 days'
    );

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_challenges(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_challenges(uuid) TO authenticated;
