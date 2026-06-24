-- Migration 204: P2P-3 — challenge core
-- p2p_challenges table + 4 RPCs + gazette enum + coin_transactions FK + expire cron

-- ── 0. gazette_entry_type enum additions
ALTER TYPE gazette_entry_type ADD VALUE IF NOT EXISTS 'p2p_challenge';
ALTER TYPE gazette_entry_type ADD VALUE IF NOT EXISTS 'p2p_result';

-- ── 1. p2p_challenges table

CREATE TABLE IF NOT EXISTS p2p_challenges (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       uuid        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  challenger_id   uuid        NOT NULL REFERENCES auth.users(id),
  opponent_id     uuid        NOT NULL REFERENCES auth.users(id),
  bet_type        text        NOT NULL DEFAULT 'gw_total'
                              CHECK (bet_type IN ('gw_total')),
  matchday_id     text        NOT NULL,  -- e.g. '429-r2'
  stake_coins     int         NOT NULL CHECK (stake_coins > 0),
  message         text        CHECK (char_length(message) <= 140),
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','accepted','declined','cancelled','resolved','expired')),
  winner_id       uuid        REFERENCES auth.users(id),
  resolved_at     timestamptz,
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_challenge CHECK (challenger_id <> opponent_id)
);

CREATE INDEX IF NOT EXISTS idx_p2p_challenges_league    ON p2p_challenges(league_id);
CREATE INDEX IF NOT EXISTS idx_p2p_challenges_challenger ON p2p_challenges(challenger_id);
CREATE INDEX IF NOT EXISTS idx_p2p_challenges_opponent   ON p2p_challenges(opponent_id);
CREATE INDEX IF NOT EXISTS idx_p2p_challenges_status     ON p2p_challenges(status);
CREATE INDEX IF NOT EXISTS idx_p2p_challenges_matchday   ON p2p_challenges(matchday_id);

ALTER TABLE p2p_challenges ENABLE ROW LEVEL SECURITY;

-- League members can read challenges in their league
CREATE POLICY "p2p_challenges_select" ON p2p_challenges
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_members.league_id = p2p_challenges.league_id
        AND league_members.user_id = auth.uid()
    )
  );

-- No direct INSERT/UPDATE — all writes go through RPCs

-- ── 2. FK from coin_transactions.challenge_id to p2p_challenges
--    The column already exists (added in migration 202 as uuid with no FK).
--    Adding FK now that the table exists.
ALTER TABLE coin_transactions
  ADD CONSTRAINT fk_coin_transactions_challenge
  FOREIGN KEY (challenge_id) REFERENCES p2p_challenges(id)
  ON DELETE SET NULL;

-- ── 3. create_p2p_challenge(p_league_id, p_opponent_id, p_matchday_id, p_stake_coins, p_message)
--    Validates both parties are league members, deducts stake from challenger to escrow.
CREATE OR REPLACE FUNCTION create_p2p_challenge(
  p_league_id    uuid,
  p_opponent_id  uuid,
  p_matchday_id  text,
  p_stake_coins  int,
  p_message      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_challenger_id uuid := auth.uid();
  v_challenge_id  uuid;
BEGIN
  IF v_challenger_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED';
  END IF;

  -- Both parties must be league members
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

  -- Deduct challenger stake to escrow (validates daily cap + balance)
  -- challenge_id passed as NULL here — we update after insert
  PERFORM debit_coins_to_escrow(
    v_challenger_id,
    p_stake_coins,
    NULL,
    jsonb_build_object('reason', 'challenge_stake', 'matchday_id', p_matchday_id)
  );

  -- Create challenge row
  INSERT INTO p2p_challenges (
    league_id, challenger_id, opponent_id, matchday_id,
    stake_coins, message, status
  ) VALUES (
    p_league_id, v_challenger_id, p_opponent_id, p_matchday_id,
    p_stake_coins, p_message, 'pending'
  )
  RETURNING id INTO v_challenge_id;

  -- Back-fill challenge_id on the stake transaction
  UPDATE coin_transactions
  SET challenge_id = v_challenge_id
  WHERE user_id    = v_challenger_id
    AND type       = 'stake'
    AND challenge_id IS NULL
    AND created_at > now() - interval '5 seconds'
  ;

  RETURN jsonb_build_object('challenge_id', v_challenge_id);
END;
$$;

REVOKE ALL ON FUNCTION create_p2p_challenge(uuid, uuid, text, int, text) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION create_p2p_challenge(uuid, uuid, text, int, text) TO authenticated;

-- ── 4. accept_p2p_challenge(p_challenge_id)
--    Opponent accepts — deducts their stake to escrow.
CREATE OR REPLACE FUNCTION accept_p2p_challenge(p_challenge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id  uuid := auth.uid();
  v_ch       p2p_challenges;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.opponent_id <> v_user_id THEN RAISE EXCEPTION 'NOT_OPPONENT'; END IF;
  IF v_ch.status <> 'pending' THEN RAISE EXCEPTION 'CHALLENGE_NOT_PENDING'; END IF;
  IF v_ch.expires_at < now() THEN RAISE EXCEPTION 'CHALLENGE_EXPIRED'; END IF;

  -- Deduct opponent stake to escrow
  PERFORM debit_coins_to_escrow(
    v_user_id,
    v_ch.stake_coins,
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_stake', 'matchday_id', v_ch.matchday_id)
  );

  UPDATE p2p_challenges
  SET status = 'accepted', updated_at = now()
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('status', 'accepted');
END;
$$;

REVOKE ALL ON FUNCTION accept_p2p_challenge(uuid) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION accept_p2p_challenge(uuid) TO authenticated;

-- ── 5. decline_p2p_challenge(p_challenge_id)
--    Opponent declines — refunds challenger's escrow.
CREATE OR REPLACE FUNCTION decline_p2p_challenge(p_challenge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ch      p2p_challenges;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.opponent_id <> v_user_id THEN RAISE EXCEPTION 'NOT_OPPONENT'; END IF;
  IF v_ch.status <> 'pending' THEN RAISE EXCEPTION 'CHALLENGE_NOT_PENDING'; END IF;

  -- Refund challenger's stake from escrow
  PERFORM release_escrow(
    v_ch.challenger_id,
    v_ch.stake_coins,
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_declined')
  );
  -- Log refund transaction
  PERFORM credit_coins(
    v_ch.challenger_id,
    v_ch.stake_coins,
    'refund',
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_declined')
  );

  UPDATE p2p_challenges
  SET status = 'declined', updated_at = now()
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('status', 'declined');
END;
$$;

REVOKE ALL ON FUNCTION decline_p2p_challenge(uuid) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION decline_p2p_challenge(uuid) TO authenticated;

-- ── 6. cancel_p2p_challenge(p_challenge_id)
--    Challenger cancels their own pending challenge — refunds their stake.
CREATE OR REPLACE FUNCTION cancel_p2p_challenge(p_challenge_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_ch      p2p_challenges;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT * INTO v_ch FROM p2p_challenges WHERE id = p_challenge_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CHALLENGE_NOT_FOUND'; END IF;
  IF v_ch.challenger_id <> v_user_id THEN RAISE EXCEPTION 'NOT_CHALLENGER'; END IF;
  IF v_ch.status NOT IN ('pending') THEN RAISE EXCEPTION 'CANNOT_CANCEL'; END IF;

  -- Refund challenger's stake
  PERFORM release_escrow(
    v_ch.challenger_id,
    v_ch.stake_coins,
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_cancelled')
  );
  PERFORM credit_coins(
    v_ch.challenger_id,
    v_ch.stake_coins,
    'refund',
    p_challenge_id,
    jsonb_build_object('reason', 'challenge_cancelled')
  );

  UPDATE p2p_challenges
  SET status = 'cancelled', updated_at = now()
  WHERE id = p_challenge_id;

  RETURN jsonb_build_object('status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION cancel_p2p_challenge(uuid) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION cancel_p2p_challenge(uuid) TO authenticated;

-- ── 7. get_my_challenges(p_league_id)
--    Returns pending/accepted/recent-terminal challenges for the current user.
CREATE OR REPLACE FUNCTION get_my_challenges(p_league_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_result  jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED'; END IF;

  SELECT jsonb_agg(row_to_json(c.*) ORDER BY c.created_at DESC)
  INTO v_result
  FROM p2p_challenges c
  WHERE (c.challenger_id = v_user_id OR c.opponent_id = v_user_id)
    AND (p_league_id IS NULL OR c.league_id = p_league_id)
    AND (
      c.status IN ('pending', 'accepted')
      OR c.created_at > now() - interval '30 days'
    );

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION get_my_challenges(uuid) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION get_my_challenges(uuid) TO authenticated;

-- ── 8. expire_stale_challenges() — called by pgcron hourly
--    Expires pending challenges past their expiry. Refunds challenger stake.
CREATE OR REPLACE FUNCTION expire_stale_challenges()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ch    p2p_challenges;
  v_count int := 0;
BEGIN
  FOR v_ch IN
    SELECT * FROM p2p_challenges
    WHERE status = 'pending' AND expires_at < now()
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Refund challenger stake
    BEGIN
      PERFORM release_escrow(
        v_ch.challenger_id,
        v_ch.stake_coins,
        v_ch.id,
        jsonb_build_object('reason', 'challenge_expired')
      );
      PERFORM credit_coins(
        v_ch.challenger_id,
        v_ch.stake_coins,
        'refund',
        v_ch.id,
        jsonb_build_object('reason', 'challenge_expired')
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'expire_stale_challenges: refund failed for challenge %: %', v_ch.id, SQLERRM;
    END;

    UPDATE p2p_challenges
    SET status = 'expired', updated_at = now()
    WHERE id = v_ch.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION expire_stale_challenges() FROM public, authenticated, anon;
-- Called by cron (service role) — no GRANT needed.

-- ── 9. pgcron: expire stale challenges hourly (alongside resolve-finished-bets)
SELECT cron.schedule(
  'expire-p2p-challenges',
  '0 * * * *',
  $$SELECT expire_stale_challenges();$$
);
