-- Migration 262: P2P Group Bets — structured options, multi-target challenges,
-- start/end time enforcement, and a Clubhouse-scoped P2P dashboard.
--
-- Fully additive. Does NOT touch p2p_challenges (the existing 1:1 quick-challenge
-- flow keeps working exactly as-is). Adds a parallel "Clubhouse Bets" schema for
-- richer bets: multiple-choice answers (single or multi-select), targeting one
-- person / several people / the whole Clubhouse, and a start/end time window.
--
-- Decisions locked in with the user before writing this file:
--   - Join model: opt-in only. "Whole clubhouse" targeting means "open to anyone
--     in the clubhouse to join", not auto-enrolment — nobody's coins move until
--     they actively accept, same as the existing 1:1 flow.
--   - Payout: winners split the pot evenly (every participant stakes the same
--     amount, so an even split is a simple pro-rata share), minus the existing
--     5% rake.
--   - Resolution: creator declares the outcome. A 48h objection window follows —
--     if nobody disputes, it auto-finalizes. Any participant can dispute within
--     that window, which escalates to the Clubhouse owner to arbitrate (7-day
--     deadline, mirroring the existing freeform-challenge dispute pattern from
--     migration 239). If the owner never arbitrates, it auto-voids (refund all).
--
-- Reuses existing coin_transactions types only ('stake','win','loss','refund') —
-- no new ledger type, per the migration 202 invariant (coins are non-withdrawable
-- virtual goods; never add a withdrawal/payout-equivalent type).

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Core tables
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE p2p_bets (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id           uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  creator_id          uuid NOT NULL REFERENCES auth.users(id),
  question            text NOT NULL CHECK (char_length(question) BETWEEN 1 AND 140),
  answer_mode         text NOT NULL CHECK (answer_mode IN ('freeform_text', 'multiple_choice')),
  allow_multiple_answers boolean NOT NULL DEFAULT false,
  target_mode         text NOT NULL CHECK (target_mode IN ('selected_users', 'whole_clubhouse')),
  stake_coins         int NOT NULL CHECK (stake_coins BETWEEN 10 AND 10000),
  starts_at           timestamptz NOT NULL DEFAULT now(),
  ends_at             timestamptz,
  status              text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open', 'closed', 'disputed', 'resolved', 'cancelled')),
  declared_by         uuid REFERENCES auth.users(id),
  declared_at         timestamptz,
  objection_deadline  timestamptz,
  dispute_deadline    timestamptz,
  resolved_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at > starts_at),
  -- freeform_text bets never use the multi-select toggle — one answer per participant
  CHECK (answer_mode = 'multiple_choice' OR allow_multiple_answers = false)
);

CREATE INDEX idx_p2p_bets_circle ON p2p_bets(circle_id);
CREATE INDEX idx_p2p_bets_status_ends_at ON p2p_bets(status, ends_at) WHERE status IN ('open', 'closed');
CREATE INDEX idx_p2p_bets_declared ON p2p_bets(status, objection_deadline) WHERE status = 'closed';
CREATE INDEX idx_p2p_bets_disputed ON p2p_bets(status, dispute_deadline) WHERE status = 'disputed';

CREATE TABLE p2p_bet_options (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id      uuid NOT NULL REFERENCES p2p_bets(id) ON DELETE CASCADE,
  label       text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  sort_order  int NOT NULL DEFAULT 0,
  is_correct  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_p2p_bet_options_bet ON p2p_bet_options(bet_id);

CREATE TABLE p2p_bet_targets (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id   uuid NOT NULL REFERENCES p2p_bets(id) ON DELETE CASCADE,
  user_id  uuid NOT NULL REFERENCES auth.users(id),
  UNIQUE (bet_id, user_id)
);

CREATE INDEX idx_p2p_bet_targets_user ON p2p_bet_targets(user_id);

CREATE TABLE p2p_bet_participants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_id            uuid NOT NULL REFERENCES p2p_bets(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id),
  status            text NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'declined')),
  stake_coins       int,
  answer_text       text,
  declared_correct  boolean NOT NULL DEFAULT false,
  is_winner         boolean NOT NULL DEFAULT false,
  joined_at         timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bet_id, user_id)
);

CREATE INDEX idx_p2p_bet_participants_bet ON p2p_bet_participants(bet_id);
CREATE INDEX idx_p2p_bet_participants_user ON p2p_bet_participants(user_id);

CREATE TABLE p2p_bet_participant_answers (
  participant_id  uuid NOT NULL REFERENCES p2p_bet_participants(id) ON DELETE CASCADE,
  option_id       uuid NOT NULL REFERENCES p2p_bet_options(id) ON DELETE CASCADE,
  PRIMARY KEY (participant_id, option_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Ledger: link coin_transactions to bets (challenge_id's FK is specific to
--    p2p_challenges and can't be reused here — this is an additive sibling).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE coin_transactions
  ADD COLUMN bet_id uuid REFERENCES p2p_bets(id) ON DELETE SET NULL;

CREATE INDEX idx_coin_transactions_bet ON coin_transactions(bet_id) WHERE bet_id IS NOT NULL;

-- Extend the existing escrow helpers with an optional p_bet_id param. Additive:
-- every existing caller keeps working unchanged (new param defaults NULL).

CREATE OR REPLACE FUNCTION credit_coins(
  p_user_id       uuid,
  p_amount        int,
  p_type          text DEFAULT 'admin',
  p_challenge_id  uuid DEFAULT NULL,
  p_meta          jsonb DEFAULT '{}'::jsonb,
  p_currency      char(3) DEFAULT 'FRC',
  p_reference_id  text DEFAULT NULL,
  p_bet_id        uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_type NOT IN ('purchase', 'win', 'refund', 'admin') THEN
    RAISE EXCEPTION 'INVALID_CREDIT_TYPE';
  END IF;
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  UPDATE coin_wallets SET balance = balance + p_amount WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WALLET_NOT_FOUND';
  END IF;

  INSERT INTO coin_transactions (user_id, type, amount, challenge_id, bet_id, meta, currency, reference_id)
  VALUES (p_user_id, p_type, p_amount, p_challenge_id, p_bet_id, p_meta, p_currency, p_reference_id);
END;
$$;

CREATE OR REPLACE FUNCTION debit_coins_to_escrow(
  p_user_id       uuid,
  p_amount        int,
  p_challenge_id  uuid DEFAULT NULL,
  p_meta          jsonb DEFAULT '{}'::jsonb,
  p_bet_id        uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_staked int;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_daily_staked
  FROM coin_transactions
  WHERE user_id = p_user_id AND type = 'stake' AND created_at > now() - interval '24 hours';

  IF v_daily_staked + p_amount > 1000 THEN
    RAISE EXCEPTION 'DAILY_STAKE_LIMIT_EXCEEDED';
  END IF;

  UPDATE coin_wallets
  SET balance = balance - p_amount, escrow = escrow + p_amount
  WHERE user_id = p_user_id AND balance >= p_amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_BALANCE';
  END IF;

  INSERT INTO coin_transactions (user_id, type, amount, challenge_id, bet_id, meta)
  VALUES (p_user_id, 'stake', -p_amount, p_challenge_id, p_bet_id, p_meta);
END;
$$;

CREATE OR REPLACE FUNCTION release_escrow(
  p_user_id       uuid,
  p_amount        int,
  p_challenge_id  uuid DEFAULT NULL,
  p_meta          jsonb DEFAULT '{}'::jsonb,
  p_bet_id        uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT';
  END IF;

  UPDATE coin_wallets
  SET balance = balance + p_amount, escrow = escrow - p_amount
  WHERE user_id = p_user_id AND escrow >= p_amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INSUFFICIENT_ESCROW';
  END IF;

  INSERT INTO coin_transactions (user_id, type, amount, challenge_id, bet_id, meta)
  VALUES (p_user_id, 'refund', p_amount, p_challenge_id, p_bet_id, p_meta);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. clubhouse_notifications: widen source_type to allow 'p2p_bet' (same fix
--    pattern as migration 261, applied proactively this time).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE clubhouse_notifications DROP CONSTRAINT IF EXISTS clubhouse_notifications_source_type_check;
ALTER TABLE clubhouse_notifications ADD CONSTRAINT clubhouse_notifications_source_type_check
  CHECK (source_type IN ('league', 'paddock', 'box', 'clubhouse', 'p2p_challenge', 'p2p_bet'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE p2p_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_bet_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_bet_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_bet_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE p2p_bet_participant_answers ENABLE ROW LEVEL SECURITY;

-- All writes happen via SECURITY DEFINER RPCs below — no client INSERT/UPDATE/DELETE policies.

CREATE POLICY p2p_bets_select ON p2p_bets
  FOR SELECT USING (is_circle_member(circle_id));

CREATE POLICY p2p_bet_options_select ON p2p_bet_options
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM p2p_bets b WHERE b.id = p2p_bet_options.bet_id AND is_circle_member(b.circle_id)
  ));

CREATE POLICY p2p_bet_targets_select ON p2p_bet_targets
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM p2p_bets b WHERE b.id = p2p_bet_targets.bet_id AND is_circle_member(b.circle_id)
  ));

-- Answers stay private to the participant themself, the bet creator, and the
-- circle owner while a bet is still 'open' — once it's closed/disputed/resolved
-- everyone in the circle can see who answered what.
CREATE POLICY p2p_bet_participants_select ON p2p_bet_participants
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM p2p_bets b WHERE b.id = p2p_bet_participants.bet_id AND b.creator_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM p2p_bets b
      JOIN circle_members cm ON cm.circle_id = b.circle_id
      WHERE b.id = p2p_bet_participants.bet_id AND cm.user_id = auth.uid() AND cm.role = 'owner'
    )
    OR EXISTS (
      SELECT 1 FROM p2p_bets b
      WHERE b.id = p2p_bet_participants.bet_id AND b.status <> 'open' AND is_circle_member(b.circle_id)
    )
  );

CREATE POLICY p2p_bet_participant_answers_select ON p2p_bet_participant_answers
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM p2p_bet_participants p WHERE p.id = p2p_bet_participant_answers.participant_id
    AND (
      p.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM p2p_bets b WHERE b.id = p.bet_id AND b.creator_id = auth.uid())
      OR EXISTS (
        SELECT 1 FROM p2p_bets b
        JOIN circle_members cm ON cm.circle_id = b.circle_id
        WHERE b.id = p.bet_id AND cm.user_id = auth.uid() AND cm.role = 'owner'
      )
      OR EXISTS (
        SELECT 1 FROM p2p_bets b WHERE b.id = p.bet_id AND b.status <> 'open' AND is_circle_member(b.circle_id)
      )
    )
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. create_p2p_bet
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION create_p2p_bet(
  p_circle_id             uuid,
  p_question              text,
  p_answer_mode           text,
  p_allow_multiple_answers boolean,
  p_target_mode           text,
  p_target_user_ids       uuid[],
  p_options               text[],
  p_stake_coins           int,
  p_starts_at             timestamptz,
  p_ends_at               timestamptz
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  RETURN v_bet_id;
END;
$$;

REVOKE ALL ON FUNCTION create_p2p_bet(uuid, text, text, boolean, text, uuid[], text[], int, timestamptz, timestamptz) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION create_p2p_bet(uuid, text, text, boolean, text, uuid[], text[], int, timestamptz, timestamptz) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. join_p2p_bet / decline_p2p_bet
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION join_p2p_bet(p_bet_id uuid) RETURNS void
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
  IF v_bet.status <> 'open' THEN
    RAISE EXCEPTION 'BET_NOT_OPEN';
  END IF;
  IF v_bet.ends_at IS NOT NULL AND v_bet.ends_at <= now() THEN
    RAISE EXCEPTION 'BET_WINDOW_CLOSED';
  END IF;
  IF EXISTS (SELECT 1 FROM p2p_bet_participants WHERE bet_id = p_bet_id AND user_id = auth.uid() AND status = 'joined') THEN
    RAISE EXCEPTION 'ALREADY_JOINED';
  END IF;

  IF v_bet.target_mode = 'whole_clubhouse' THEN
    IF NOT is_circle_member(v_bet.circle_id) THEN
      RAISE EXCEPTION 'NOT_CIRCLE_MEMBER';
    END IF;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM p2p_bet_targets WHERE bet_id = p_bet_id AND user_id = auth.uid()) THEN
      RAISE EXCEPTION 'NOT_INVITED';
    END IF;
  END IF;

  PERFORM debit_coins_to_escrow(auth.uid(), v_bet.stake_coins, NULL, jsonb_build_object('bet_id', p_bet_id), p_bet_id);

  INSERT INTO p2p_bet_participants (bet_id, user_id, status, stake_coins, joined_at)
  VALUES (p_bet_id, auth.uid(), 'joined', v_bet.stake_coins, now())
  ON CONFLICT (bet_id, user_id) DO UPDATE
    SET status = 'joined', stake_coins = v_bet.stake_coins, joined_at = now();
END;
$$;

REVOKE ALL ON FUNCTION join_p2p_bet(uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION join_p2p_bet(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION decline_p2p_bet(p_bet_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM p2p_bets WHERE id = p_bet_id AND status = 'open') THEN
    RAISE EXCEPTION 'BET_NOT_OPEN';
  END IF;
  IF EXISTS (SELECT 1 FROM p2p_bet_participants WHERE bet_id = p_bet_id AND user_id = auth.uid() AND status = 'joined') THEN
    RAISE EXCEPTION 'ALREADY_JOINED';
  END IF;

  INSERT INTO p2p_bet_participants (bet_id, user_id, status)
  VALUES (p_bet_id, auth.uid(), 'declined')
  ON CONFLICT (bet_id, user_id) DO UPDATE SET status = 'declined';
END;
$$;

REVOKE ALL ON FUNCTION decline_p2p_bet(uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION decline_p2p_bet(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. submit_bet_answer
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION submit_bet_answer(
  p_bet_id      uuid,
  p_answer_text text DEFAULT NULL,
  p_option_ids  uuid[] DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet         p2p_bets%ROWTYPE;
  v_participant p2p_bet_participants%ROWTYPE;
  v_option_id   uuid;
  v_count       int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  SELECT * INTO v_bet FROM p2p_bets WHERE id = p_bet_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BET_NOT_FOUND';
  END IF;
  IF v_bet.status <> 'open' THEN
    RAISE EXCEPTION 'BET_NOT_OPEN';
  END IF;
  IF v_bet.ends_at IS NOT NULL AND v_bet.ends_at <= now() THEN
    RAISE EXCEPTION 'BET_WINDOW_CLOSED';
  END IF;

  SELECT * INTO v_participant FROM p2p_bet_participants
  WHERE bet_id = p_bet_id AND user_id = auth.uid() AND status = 'joined'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_A_PARTICIPANT';
  END IF;

  IF v_bet.answer_mode = 'freeform_text' THEN
    IF p_answer_text IS NULL OR char_length(trim(p_answer_text)) = 0 THEN
      RAISE EXCEPTION 'ANSWER_REQUIRED';
    END IF;
    UPDATE p2p_bet_participants SET answer_text = p_answer_text WHERE id = v_participant.id;
  ELSE
    IF p_option_ids IS NULL OR array_length(p_option_ids, 1) < 1 THEN
      RAISE EXCEPTION 'ANSWER_REQUIRED';
    END IF;
    IF NOT v_bet.allow_multiple_answers AND array_length(p_option_ids, 1) <> 1 THEN
      RAISE EXCEPTION 'SINGLE_ANSWER_ONLY';
    END IF;

    SELECT COUNT(*) INTO v_count FROM p2p_bet_options WHERE bet_id = p_bet_id AND id = ANY(p_option_ids);
    IF v_count <> array_length(p_option_ids, 1) THEN
      RAISE EXCEPTION 'INVALID_OPTION';
    END IF;

    DELETE FROM p2p_bet_participant_answers WHERE participant_id = v_participant.id;
    FOREACH v_option_id IN ARRAY p_option_ids LOOP
      INSERT INTO p2p_bet_participant_answers (participant_id, option_id) VALUES (v_participant.id, v_option_id);
    END LOOP;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION submit_bet_answer(uuid, text, uuid[]) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION submit_bet_answer(uuid, text, uuid[]) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. close_p2p_bet / cancel_p2p_bet
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION close_p2p_bet(p_bet_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  UPDATE p2p_bets SET status = 'closed', updated_at = now()
  WHERE id = p_bet_id AND creator_id = auth.uid() AND status = 'open';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BET_NOT_FOUND_OR_NOT_OPEN';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION close_p2p_bet(uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION close_p2p_bet(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION cancel_p2p_bet(p_bet_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_participant RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM p2p_bets WHERE id = p_bet_id AND creator_id = auth.uid() AND status = 'open' FOR UPDATE) THEN
    RAISE EXCEPTION 'BET_NOT_FOUND_OR_NOT_OPEN';
  END IF;

  FOR v_participant IN
    SELECT user_id, stake_coins FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined'
  LOOP
    PERFORM release_escrow(v_participant.user_id, v_participant.stake_coins, NULL,
      jsonb_build_object('bet_id', p_bet_id, 'reason', 'cancelled'), p_bet_id);
  END LOOP;

  UPDATE p2p_bets SET status = 'cancelled', updated_at = now() WHERE id = p_bet_id;
END;
$$;

REVOKE ALL ON FUNCTION cancel_p2p_bet(uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION cancel_p2p_bet(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Internal payout helper (not exposed to clients — no GRANT to authenticated)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION finalize_bet_payout(p_bet_id uuid) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pot          int;
  v_winner_count int;
  v_rake         int;
  v_prize_pool   int;
  v_share        int;
  v_p            RECORD;
BEGIN
  SELECT COALESCE(SUM(stake_coins), 0) INTO v_pot
  FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined';

  SELECT COUNT(*) INTO v_winner_count
  FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined' AND is_winner = true;

  IF v_winner_count = 0 THEN
    -- Push / void: refund everyone their own stake, no rake taken.
    FOR v_p IN SELECT user_id, stake_coins FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined' LOOP
      PERFORM release_escrow(v_p.user_id, v_p.stake_coins, NULL,
        jsonb_build_object('bet_id', p_bet_id, 'reason', 'push'), p_bet_id);
    END LOOP;
    RETURN;
  END IF;

  v_rake := FLOOR(v_pot * 0.05);
  v_prize_pool := v_pot - v_rake;
  v_share := FLOOR(v_prize_pool / v_winner_count);

  FOR v_p IN SELECT user_id, stake_coins, is_winner FROM p2p_bet_participants WHERE bet_id = p_bet_id AND status = 'joined' LOOP
    IF v_p.is_winner THEN
      -- Settle directly to v_share rather than refund-then-top-up: when every
      -- participant wins (no losers to fund the payout), v_share can land
      -- BELOW the winner's own stake once the 5% rake is taken out. A plain
      -- release_escrow(stake) would refund the full stake and let the rake
      -- go uncollected in that case, so move escrow->balance for the net
      -- share directly instead.
      UPDATE coin_wallets SET balance = balance + v_share, escrow = escrow - v_p.stake_coins
      WHERE user_id = v_p.user_id AND escrow >= v_p.stake_coins;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'INSUFFICIENT_ESCROW';
      END IF;
      INSERT INTO coin_transactions (user_id, type, amount, bet_id, meta)
      VALUES (v_p.user_id, 'win', v_share - v_p.stake_coins, p_bet_id, jsonb_build_object('bet_id', p_bet_id));
    ELSE
      UPDATE coin_wallets SET escrow = escrow - v_p.stake_coins WHERE user_id = v_p.user_id;
      INSERT INTO coin_transactions (user_id, type, amount, bet_id, meta)
      VALUES (v_p.user_id, 'loss', -v_p.stake_coins, p_bet_id, jsonb_build_object('bet_id', p_bet_id));
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION finalize_bet_payout(uuid) FROM public, authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. declare_bet_outcome / dispute_bet_outcome / arbitrate_bet_outcome
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION declare_bet_outcome(
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
  IF v_bet.creator_id <> auth.uid() THEN
    RAISE EXCEPTION 'NOT_BET_CREATOR';
  END IF;
  IF v_bet.status <> 'closed' THEN
    RAISE EXCEPTION 'BET_NOT_CLOSED';
  END IF;

  IF v_bet.answer_mode = 'multiple_choice' THEN
    IF p_winning_option_ids IS NOT NULL AND array_length(p_winning_option_ids, 1) > 0 THEN
      IF (SELECT COUNT(*) FROM p2p_bet_options WHERE bet_id = p_bet_id AND id = ANY(p_winning_option_ids))
         <> array_length(p_winning_option_ids, 1) THEN
        RAISE EXCEPTION 'INVALID_OPTION';
      END IF;
      UPDATE p2p_bet_options SET is_correct = true WHERE bet_id = p_bet_id AND id = ANY(p_winning_option_ids);
      UPDATE p2p_bet_participants pp SET declared_correct = true
      WHERE pp.bet_id = p_bet_id AND pp.status = 'joined' AND EXISTS (
        SELECT 1 FROM p2p_bet_participant_answers pa
        WHERE pa.participant_id = pp.id AND pa.option_id = ANY(p_winning_option_ids)
      );
    END IF;
  ELSE
    IF p_winning_user_ids IS NOT NULL AND array_length(p_winning_user_ids, 1) > 0 THEN
      UPDATE p2p_bet_participants SET declared_correct = true
      WHERE bet_id = p_bet_id AND status = 'joined' AND user_id = ANY(p_winning_user_ids);
    END IF;
  END IF;

  UPDATE p2p_bets
  SET declared_by = auth.uid(), declared_at = now(), objection_deadline = now() + interval '48 hours', updated_at = now()
  WHERE id = p_bet_id;
END;
$$;

REVOKE ALL ON FUNCTION declare_bet_outcome(uuid, uuid[], uuid[]) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION declare_bet_outcome(uuid, uuid[], uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION dispute_bet_outcome(p_bet_id uuid) RETURNS void
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
  IF v_bet.status <> 'closed' OR v_bet.declared_at IS NULL THEN
    RAISE EXCEPTION 'BET_NOT_DECLARED';
  END IF;
  IF v_bet.objection_deadline IS NOT NULL AND v_bet.objection_deadline <= now() THEN
    RAISE EXCEPTION 'OBJECTION_WINDOW_CLOSED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM p2p_bet_participants WHERE bet_id = p_bet_id AND user_id = auth.uid() AND status = 'joined') THEN
    RAISE EXCEPTION 'NOT_A_PARTICIPANT';
  END IF;

  UPDATE p2p_bets
  SET status = 'disputed', dispute_deadline = now() + interval '7 days', updated_at = now()
  WHERE id = p_bet_id;

  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  SELECT v_bet.circle_id, cm.user_id, 'p2p_bet', p_bet_id, 'dispute',
         jsonb_build_object('bet_id', p_bet_id, 'question', v_bet.question)
  FROM circle_members cm
  WHERE cm.circle_id = v_bet.circle_id AND cm.role = 'owner';
END;
$$;

REVOKE ALL ON FUNCTION dispute_bet_outcome(uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION dispute_bet_outcome(uuid) TO authenticated;

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

  PERFORM finalize_bet_payout(p_bet_id);

  UPDATE p2p_bets SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = p_bet_id;
END;
$$;

REVOKE ALL ON FUNCTION arbitrate_bet_outcome(uuid, uuid[], uuid[]) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION arbitrate_bet_outcome(uuid, uuid[], uuid[]) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. Cron functions (ADMIN_ONLY — service role only, no client GRANT)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_close_expired_bets() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  UPDATE p2p_bets SET status = 'closed', updated_at = now()
  WHERE status = 'open' AND ends_at IS NOT NULL AND ends_at <= now();
END;
$$;

CREATE OR REPLACE FUNCTION finalize_declared_bets() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  FOR v_bet_id IN
    SELECT id FROM p2p_bets
    WHERE status = 'closed' AND declared_at IS NOT NULL AND objection_deadline <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE p2p_bet_participants SET is_winner = declared_correct WHERE bet_id = v_bet_id;
    PERFORM finalize_bet_payout(v_bet_id);
    UPDATE p2p_bets SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = v_bet_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION auto_void_stale_bet_disputes() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bet_id uuid;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;

  FOR v_bet_id IN
    SELECT id FROM p2p_bets WHERE status = 'disputed' AND dispute_deadline <= now()
    FOR UPDATE SKIP LOCKED
  LOOP
    UPDATE p2p_bet_participants SET is_winner = false, declared_correct = false WHERE bet_id = v_bet_id;
    PERFORM finalize_bet_payout(v_bet_id);
    UPDATE p2p_bets SET status = 'resolved', resolved_at = now(), updated_at = now() WHERE id = v_bet_id;
  END LOOP;
END;
$$;

SELECT cron.schedule('auto-close-expired-p2p-bets', '0 * * * *', $$SELECT auto_close_expired_bets();$$);
SELECT cron.schedule('finalize-declared-p2p-bets', '0 * * * *', $$SELECT finalize_declared_bets();$$);
SELECT cron.schedule('auto-void-stale-p2p-bet-disputes', '0 * * * *', $$SELECT auto_void_stale_bet_disputes();$$);

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. Dashboard read RPC (single round-trip for the new P2P Clubhouse tab)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_clubhouse_bets(p_circle_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF NOT is_circle_member(p_circle_id) THEN
    RAISE EXCEPTION 'NOT_CIRCLE_MEMBER';
  END IF;

  SELECT jsonb_agg(row_to_json(b) ORDER BY b.created_at DESC) INTO v_result
  FROM (
    SELECT
      bt.*,
      (SELECT jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'sort_order', o.sort_order, 'is_correct', o.is_correct) ORDER BY o.sort_order)
       FROM p2p_bet_options o WHERE o.bet_id = bt.id) AS options,
      (SELECT COUNT(*) FROM p2p_bet_participants pp WHERE pp.bet_id = bt.id AND pp.status = 'joined') AS participant_count,
      EXISTS (SELECT 1 FROM p2p_bet_participants pp WHERE pp.bet_id = bt.id AND pp.user_id = auth.uid() AND pp.status = 'joined') AS is_participant
    FROM p2p_bets bt
    WHERE bt.circle_id = p_circle_id
  ) b;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION get_clubhouse_bets(uuid) FROM public, authenticated, anon;
GRANT EXECUTE ON FUNCTION get_clubhouse_bets(uuid) TO authenticated;
