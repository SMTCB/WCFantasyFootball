-- Freeform (manually-agreed) P2P bets: declare -> confirm/dispute -> owner-arbitrates.
--
-- p2p_challenges is currently empty in prod (confirmed via row count before writing
-- this migration) -- every schema change below is additive/widening with zero backfill
-- or orphan-handling risk.
--
-- Widens bet_type/status, makes matchday_id nullable (236 added circle scope but never
-- touched matchday_id -- gw_total still requires it, freeform never has one), and adds
-- the declare/confirm/dispute/arbitrate columns + a competition-shape guard so a row
-- can't mix gw_total and freeform fields.
--
-- New RPCs mirror resolve_p2p_challenge's already-fixed (224) payout pattern directly
-- (release_escrow + credit_coins('win', ...) for the winner; direct escrow decrement +
-- a manual 'loss' coin_transactions row for the loser -- credit_coins rejects non-'win'/
-- 'purchase'/'refund'/'admin' types) rather than calling resolve_p2p_challenge itself,
-- since that function is ADMIN_ONLY-gated and hardcoded to gazette/league/matchday
-- scoring that freeform bets don't have.

-- ── 1. Schema: widen CHECKs, relax matchday_id, add freeform columns ──────────

ALTER TABLE p2p_challenges ALTER COLUMN matchday_id DROP NOT NULL;

ALTER TABLE p2p_challenges DROP CONSTRAINT p2p_challenges_bet_type_check;
ALTER TABLE p2p_challenges ADD CONSTRAINT p2p_challenges_bet_type_check
  CHECK (bet_type IN ('gw_total', 'freeform'));

ALTER TABLE p2p_challenges DROP CONSTRAINT p2p_challenges_status_check;
ALTER TABLE p2p_challenges ADD CONSTRAINT p2p_challenges_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'resolved', 'expired', 'disputed'));

ALTER TABLE p2p_challenges
  ADD COLUMN resolution_mode text NOT NULL DEFAULT 'auto'
    CHECK (resolution_mode IN ('auto', 'manual')),
  ADD COLUMN question text,
  ADD COLUMN proposed_winner_id uuid REFERENCES auth.users(id),
  ADD COLUMN proposed_by uuid REFERENCES auth.users(id),
  ADD COLUMN proposed_at timestamptz,
  ADD COLUMN dispute_deadline timestamptz;

ALTER TABLE p2p_challenges ADD CONSTRAINT p2p_challenges_question_check
  CHECK (char_length(question) <= 140);

-- A row is either a gw_total bet (league+matchday, no question) or a freeform
-- bet (question, no competition FK) -- never a mix of both shapes.
ALTER TABLE p2p_challenges ADD CONSTRAINT p2p_competition_shape
  CHECK (
    (bet_type = 'gw_total' AND question IS NULL
      AND league_id IS NOT NULL AND matchday_id IS NOT NULL)
    OR
    (bet_type = 'freeform' AND question IS NOT NULL
      AND league_id IS NULL AND matchday_id IS NULL
      AND paddock_id IS NULL AND player_box_id IS NULL)
  );

CREATE INDEX idx_p2p_challenges_dispute_deadline
  ON p2p_challenges (dispute_deadline)
  WHERE status = 'disputed';

-- ── 2. create_p2p_challenge: add the freeform branch ───────────────────────
-- Same signature as 237 (CREATE OR REPLACE, not DROP+CREATE) so the existing
-- REVOKE/GRANT from 238 stays in force without needing to be reissued.

CREATE OR REPLACE FUNCTION public.create_p2p_challenge(
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

  -- Both parties must be members of the circle (shared by both bet types)
  IF NOT is_circle_member(p_circle_id) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_MEMBER';
  END IF;
  IF NOT EXISTS (
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
$function$;

-- ── 3. get_my_challenges: surface the new freeform fields ──────────────────
-- Same signature as 237 (CREATE OR REPLACE) -- grants stay in force.

CREATE OR REPLACE FUNCTION public.get_my_challenges(p_circle_id uuid DEFAULT NULL::uuid)
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
      'id',                       c.id,
      'circle_id',                c.circle_id,
      'league_id',                c.league_id,
      'challenger_id',            c.challenger_id,
      'challenger_username',      cu.username,
      'opponent_id',              c.opponent_id,
      'opponent_username',        ou.username,
      'bet_type',                 c.bet_type,
      'resolution_mode',          c.resolution_mode,
      'matchday_id',              c.matchday_id,
      'question',                 c.question,
      'stake_coins',              c.stake_coins,
      'message',                  c.message,
      'status',                   c.status,
      'winner_id',                c.winner_id,
      'challenger_pts',           c.challenger_pts,
      'opponent_pts',             c.opponent_pts,
      'proposed_winner_id',       c.proposed_winner_id,
      'proposed_winner_username', pu.username,
      'proposed_by',              c.proposed_by,
      'proposed_at',              c.proposed_at,
      'dispute_deadline',         c.dispute_deadline,
      'expires_at',               c.expires_at,
      'resolved_at',              c.resolved_at,
      'created_at',               c.created_at,
      'updated_at',               c.updated_at
    )
    ORDER BY c.created_at DESC
  )
  INTO v_result
  FROM p2p_challenges c
  LEFT JOIN users cu ON cu.id = c.challenger_id
  LEFT JOIN users ou ON ou.id = c.opponent_id
  LEFT JOIN users pu ON pu.id = c.proposed_winner_id
  WHERE (
      c.challenger_id = v_user_id
      OR c.opponent_id = v_user_id
      -- Circle owners can also see disputed freeform bets they're not a party
      -- to, so they can arbitrate. Everything else stays participant-only.
      OR (
        c.status = 'disputed'
        AND c.bet_type = 'freeform'
        AND EXISTS (
          SELECT 1 FROM circle_members cm
          WHERE cm.circle_id = c.circle_id AND cm.user_id = v_user_id AND cm.role = 'owner'
        )
      )
    )
    AND (p_circle_id IS NULL OR c.circle_id = p_circle_id)
    AND (
      c.status IN ('pending', 'accepted', 'disputed')
      OR c.created_at > now() - interval '30 days'
    );

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- ── 4. declare_freeform_result: either party proposes an outcome ───────────

CREATE FUNCTION public.declare_freeform_result(p_challenge_id uuid, p_winner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ch  p2p_challenges;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.bet_type <> 'freeform' THEN RAISE EXCEPTION 'NOT_FREEFORM'; END IF;
  IF v_ch.status <> 'accepted' THEN RAISE EXCEPTION 'INVALID_STATUS (status=%)', v_ch.status; END IF;
  IF v_uid NOT IN (v_ch.challenger_id, v_ch.opponent_id) THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT';
  END IF;
  IF p_winner_id IS NOT NULL AND p_winner_id NOT IN (v_ch.challenger_id, v_ch.opponent_id) THEN
    RAISE EXCEPTION 'INVALID_WINNER';
  END IF;

  -- p_winner_id NULL = proposing a push (both stakes returned, no winner)
  UPDATE p2p_challenges
  SET proposed_winner_id = p_winner_id,
      proposed_by        = v_uid,
      proposed_at         = now(),
      dispute_deadline    = now() + interval '7 days',
      updated_at          = now()
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.declare_freeform_result(uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.declare_freeform_result(uuid, uuid) TO authenticated;

-- ── 5. confirm_freeform_result: the other party agrees, coins move now ─────

CREATE FUNCTION public.confirm_freeform_result(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  RETURN jsonb_build_object('status', 'resolved', 'winner_id', v_winner_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.confirm_freeform_result(uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.confirm_freeform_result(uuid) TO authenticated;

-- ── 6. dispute_freeform_result: the other party disagrees, escalate ────────

CREATE FUNCTION public.dispute_freeform_result(p_challenge_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ch  p2p_challenges;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.bet_type <> 'freeform' THEN RAISE EXCEPTION 'NOT_FREEFORM'; END IF;
  IF v_ch.status <> 'accepted' THEN RAISE EXCEPTION 'INVALID_STATUS (status=%)', v_ch.status; END IF;
  IF v_ch.proposed_by IS NULL THEN RAISE EXCEPTION 'NO_PROPOSAL'; END IF;
  IF v_uid = v_ch.proposed_by THEN RAISE EXCEPTION 'CANNOT_DISPUTE_OWN_PROPOSAL'; END IF;
  IF v_uid NOT IN (v_ch.challenger_id, v_ch.opponent_id) THEN
    RAISE EXCEPTION 'NOT_PARTICIPANT';
  END IF;

  UPDATE p2p_challenges
  SET status           = 'disputed',
      dispute_deadline = now() + interval '7 days',
      updated_at       = now()
  WHERE id = p_challenge_id;

  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  SELECT
    v_ch.circle_id,
    cm.user_id,
    'p2p_challenge',
    p_challenge_id,
    'arbitration_needed',
    jsonb_build_object('question', v_ch.question, 'stake_coins', v_ch.stake_coins)
  FROM circle_members cm
  WHERE cm.circle_id = v_ch.circle_id AND cm.role = 'owner';

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.dispute_freeform_result(uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.dispute_freeform_result(uuid) TO authenticated;

-- ── 7. arbitrate_freeform_result: circle owner has the final say ───────────
-- p_winner_id NULL = void, return both stakes.

CREATE FUNCTION public.arbitrate_freeform_result(p_challenge_id uuid, p_winner_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  RETURN jsonb_build_object('status', 'resolved', 'winner_id', p_winner_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.arbitrate_freeform_result(uuid, uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.arbitrate_freeform_result(uuid, uuid) TO authenticated;

-- ── 8. auto_void_stale_disputes: cron safety net for owner inactivity ──────
-- Mirrors expire_stale_challenges' ADMIN_ONLY + cron.schedule pattern (204).
-- A disputed bet the owner never arbitrates within 7 days auto-voids (both
-- stakes returned) rather than leaving coins stuck in escrow indefinitely.

CREATE FUNCTION public.auto_void_stale_disputes()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ch    p2p_challenges;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  FOR v_ch IN
    SELECT * FROM p2p_challenges
    WHERE status = 'disputed'
      AND dispute_deadline < now()
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      PERFORM release_escrow(v_ch.challenger_id, v_ch.stake_coins, v_ch.id,
        jsonb_build_object('reason', 'freeform_dispute_timeout'));
      PERFORM release_escrow(v_ch.opponent_id, v_ch.stake_coins, v_ch.id,
        jsonb_build_object('reason', 'freeform_dispute_timeout'));

      UPDATE p2p_challenges
      SET status      = 'resolved',
          winner_id   = NULL,
          resolved_at = now(),
          updated_at  = now()
      WHERE id = v_ch.id;

      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_void_stale_disputes: failed for challenge %: %', v_ch.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.auto_void_stale_disputes() FROM public, authenticated, anon;
-- Called by cron (service role) — no GRANT needed.

SELECT cron.schedule(
  'auto-void-stale-freeform-disputes',
  '0 * * * *',
  $$SELECT auto_void_stale_disputes();$$
);

-- ── 9. auto_resolve_p2p_challenges: never pick up a manual-resolution bet ──
-- Freeform challenges default resolution_mode='manual' and have no matchday/
-- gazette trail, so they'd never match this function's EXISTS clause anyway --
-- this filter is a defensive, explicit guard rather than a fix for an
-- observed bug.

CREATE OR REPLACE FUNCTION public.auto_resolve_p2p_challenges()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ch     p2p_challenges;
  v_count  int := 0;
  v_result jsonb;
BEGIN
  FOR v_ch IN
    SELECT c.*
    FROM p2p_challenges c
    WHERE c.status = 'accepted'
      AND c.resolution_mode = 'auto'
      AND EXISTS (
        -- Matchday settled for this league
        SELECT 1 FROM gazette_entries ge
        WHERE ge.league_id  = c.league_id
          AND ge.entry_type = 'activity'
          AND ge.full_data->>'matchday_id' = c.matchday_id
      )
    ORDER BY c.created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_result := resolve_p2p_challenge(v_ch.id);
      v_count  := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_resolve_p2p_challenges: failed for challenge %: %', v_ch.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$function$;
