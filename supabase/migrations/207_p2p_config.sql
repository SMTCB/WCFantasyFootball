-- Migration 207: P2P-6 — p2p_config + RLS audit
--
-- 1. p2p_config table — white-label config per league (future: per circle)
-- 2. get_p2p_config(p_league_id) — member-readable RPC
-- 3. update_p2p_config(p_league_id, ...) — commissioner-only RPC
-- 4. RLS audit: ensure all P2P coin tables are locked down
-- 5. Invariant comment: no withdrawal/payout type may EVER be added

-- ── 1. p2p_config table
--    One row per league. Stores display and limit settings for the P2P layer.
--    Created on first commissioner update; read by useChallenges hook.
CREATE TABLE IF NOT EXISTS p2p_config (
  league_id              uuid        PRIMARY KEY REFERENCES leagues(id) ON DELETE CASCADE,
  min_stake              int         NOT NULL DEFAULT 10   CHECK (min_stake >= 1),
  max_stake              int         NOT NULL DEFAULT 500  CHECK (max_stake >= min_stake),
  daily_challenge_limit  int         NOT NULL DEFAULT 5    CHECK (daily_challenge_limit >= 1),
  challenges_enabled     boolean     NOT NULL DEFAULT true,
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT max_stake_hard_cap CHECK (max_stake <= 10000)
);

ALTER TABLE p2p_config ENABLE ROW LEVEL SECURITY;

-- League members can read their league config
CREATE POLICY "p2p_config_select" ON p2p_config
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_members.league_id = p2p_config.league_id
        AND league_members.user_id = auth.uid()
    )
  );

-- No direct client INSERT/UPDATE — go through update_p2p_config RPC

-- ── 2. get_p2p_config(p_league_id) — member-readable
CREATE OR REPLACE FUNCTION get_p2p_config(p_league_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_cfg    p2p_config;
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id AND user_id = v_caller
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_LEAGUE_MEMBER');
  END IF;

  SELECT * INTO v_cfg FROM p2p_config WHERE league_id = p_league_id;

  IF NOT FOUND THEN
    -- Return defaults if no row exists yet
    RETURN jsonb_build_object(
      'league_id',             p_league_id,
      'min_stake',             10,
      'max_stake',             500,
      'daily_challenge_limit', 5,
      'challenges_enabled',    true
    );
  END IF;

  RETURN jsonb_build_object(
    'league_id',             v_cfg.league_id,
    'min_stake',             v_cfg.min_stake,
    'max_stake',             v_cfg.max_stake,
    'daily_challenge_limit', v_cfg.daily_challenge_limit,
    'challenges_enabled',    v_cfg.challenges_enabled,
    'updated_at',            v_cfg.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION get_p2p_config(uuid) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION get_p2p_config(uuid) TO authenticated;

-- ── 3. update_p2p_config(p_league_id, ...) — commissioner only
--    UPSERT with commission auth guard.
--    Passing NULL for any param leaves that field at its current/default value.
CREATE OR REPLACE FUNCTION update_p2p_config(
  p_league_id             uuid,
  p_min_stake             int     DEFAULT NULL,
  p_max_stake             int     DEFAULT NULL,
  p_daily_challenge_limit int     DEFAULT NULL,
  p_challenges_enabled    boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  IF v_caller IS NULL THEN
    RETURN jsonb_build_object('error', 'UNAUTHORIZED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM league_members
    WHERE league_id = p_league_id
      AND user_id   = v_caller
      AND role      = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('error', 'NOT_COMMISSIONER');
  END IF;

  INSERT INTO p2p_config (
    league_id,
    min_stake,
    max_stake,
    daily_challenge_limit,
    challenges_enabled,
    updated_at
  ) VALUES (
    p_league_id,
    COALESCE(p_min_stake,             10),
    COALESCE(p_max_stake,             500),
    COALESCE(p_daily_challenge_limit, 5),
    COALESCE(p_challenges_enabled,    true),
    now()
  )
  ON CONFLICT (league_id) DO UPDATE SET
    min_stake             = COALESCE(p_min_stake,             p2p_config.min_stake),
    max_stake             = COALESCE(p_max_stake,             p2p_config.max_stake),
    daily_challenge_limit = COALESCE(p_daily_challenge_limit, p2p_config.daily_challenge_limit),
    challenges_enabled    = COALESCE(p_challenges_enabled,    p2p_config.challenges_enabled),
    updated_at            = now();

  RETURN get_p2p_config(p_league_id);
END;
$$;

REVOKE ALL ON FUNCTION update_p2p_config(uuid, int, int, int, boolean) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION update_p2p_config(uuid, int, int, int, boolean) TO authenticated;

-- ── 4. Honour p2p_config in create_p2p_challenge
--    Reject challenges when disabled or stake out of bounds.
--    This replaces the function wholesale to add the config checks before stake debit.
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

  -- Deduct challenger stake to escrow
  PERFORM debit_coins_to_escrow(
    v_challenger_id,
    p_stake_coins,
    NULL,
    jsonb_build_object('reason', 'challenge_stake', 'matchday_id', p_matchday_id)
  );

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
    AND created_at > now() - interval '5 seconds';

  RETURN jsonb_build_object('challenge_id', v_challenge_id);
END;
$$;

REVOKE ALL ON FUNCTION create_p2p_challenge(uuid, uuid, text, int, text) FROM public, authenticated, anon;
GRANT  EXECUTE ON FUNCTION create_p2p_challenge(uuid, uuid, text, int, text) TO authenticated;

-- ── 5. RLS audit — verify all P2P coin tables have RLS enabled
--    (These were enabled in earlier migrations; this block re-confirms.)
ALTER TABLE coin_wallets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coin_packs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_challenges    ENABLE ROW LEVEL SECURITY;
-- p2p_config — already enabled above

-- ── 6. Invariant documentation
--    LEGAL/COMPLIANCE NON-NEGOTIABLE:
--    Coins are non-withdrawable virtual goods. The type CHECK on coin_transactions
--    must NEVER include 'withdrawal', 'payout', 'cashout', or any money-equivalent type.
--    Violating this could constitute unlicensed gambling or financial services in many
--    jurisdictions. Any future feature that debits coins MUST be a new virtual-goods
--    transaction type approved through a compliance review.
--
--    Current allowed types (migration 206):
--      'purchase','stake','win','loss','rake','refund','admin','entry_fee'
--
--    To add a new type: ALTER TABLE coin_transactions DROP CONSTRAINT ... / ADD CONSTRAINT
--    in a new migration, with a comment explaining the new type's purpose.
