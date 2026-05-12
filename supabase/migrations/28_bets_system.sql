-- #034 / #035 / #036: Flexible Bets System
-- Competition-agnostic framework for league-scoped prediction widgets.
-- Two-layer design: templates (what types exist) + instances (live bets per league/matchday).

-- ── Templates ─────────────────────────────────────────────────────────────────
-- Defines reusable bet archetypes. Admin-seeded; not user-created.
CREATE TABLE IF NOT EXISTS bet_templates (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT    UNIQUE NOT NULL,
  title         TEXT    NOT NULL,
  description   TEXT,
  -- answer_type drives which UI widget renders
  answer_type   TEXT    NOT NULL CHECK (answer_type IN ('player_pick', 'team_pick', 'number', 'yes_no')),
  -- scope_type determines how instances are grouped
  scope_type    TEXT    NOT NULL CHECK (scope_type IN ('match', 'matchday', 'season')),
  reward_type   TEXT    NOT NULL DEFAULT 'points' CHECK (reward_type IN ('points', 'budget')),
  default_reward NUMERIC DEFAULT 5,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order    INT     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Instances ─────────────────────────────────────────────────────────────────
-- One row per active bet in a league. Commissioner or cron creates these.
CREATE TABLE IF NOT EXISTS bet_instances (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id     UUID    NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  template_id   UUID    REFERENCES bet_templates(id) ON DELETE SET NULL,
  -- prompt is the human-readable question shown in the widget
  title         TEXT    NOT NULL,
  prompt        TEXT    NOT NULL,
  -- options: [{"key": "p1", "label": "Mbappé", "meta": {"club":"FRA","pos":"FWD"}}]
  -- empty array means free-text / number input
  options       JSONB   NOT NULL DEFAULT '[]'::jsonb,
  -- correct_answer is set on resolution (matches a key from options)
  correct_answer TEXT,
  reward_type   TEXT    NOT NULL DEFAULT 'points' CHECK (reward_type IN ('points', 'budget')),
  reward_value  NUMERIC NOT NULL DEFAULT 5,
  deadline_at   TIMESTAMPTZ NOT NULL,
  resolves_at   TIMESTAMPTZ,
  scope_type    TEXT    NOT NULL DEFAULT 'matchday',
  scope_ref     TEXT,   -- e.g. matchday number "4" or fixture_id
  status        TEXT    NOT NULL DEFAULT 'open'
                CHECK (status IN ('upcoming', 'open', 'closed', 'resolved', 'cancelled')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bet_instances_league_status
  ON bet_instances (league_id, status);

-- ── Submissions ───────────────────────────────────────────────────────────────
-- One row per squad per bet instance. Immutable once deadline passes.
CREATE TABLE IF NOT EXISTS bet_submissions (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  bet_instance_id  UUID    NOT NULL REFERENCES bet_instances(id) ON DELETE CASCADE,
  squad_id         UUID    NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id          UUID    NOT NULL REFERENCES auth.users(id),
  answer           TEXT    NOT NULL,  -- key from options, or free-text value
  is_correct       BOOLEAN,           -- null until resolved
  reward_awarded   NUMERIC,           -- null until resolved
  submitted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bet_instance_id, squad_id)
);

CREATE INDEX IF NOT EXISTS bet_submissions_instance
  ON bet_submissions (bet_instance_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE bet_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bet_instances  ENABLE ROW LEVEL SECURITY;
ALTER TABLE bet_submissions ENABLE ROW LEVEL SECURITY;

-- Templates: anyone authenticated can read
CREATE POLICY "authenticated users view bet templates"
  ON bet_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Instances: only members of that league can view
CREATE POLICY "league members view bet instances"
  ON bet_instances FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = bet_instances.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- Instances: only commissioners can create/update
CREATE POLICY "commissioner manages bet instances"
  ON bet_instances FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = bet_instances.league_id
        AND lm.user_id   = auth.uid()
        AND lm.role       = 'commissioner'
    )
  );

CREATE POLICY "commissioner updates bet instances"
  ON bet_instances FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = bet_instances.league_id
        AND lm.user_id   = auth.uid()
        AND lm.role       = 'commissioner'
    )
  );

-- Submissions: league members can view all (for leaderboard purposes)
CREATE POLICY "league members view submissions"
  ON bet_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM bet_instances bi
      JOIN league_members lm ON lm.league_id = bi.league_id
      WHERE bi.id        = bet_submissions.bet_instance_id
        AND lm.user_id   = auth.uid()
    )
  );

-- Submissions: squad owner can insert/update own submission before deadline
CREATE POLICY "squad owner submits bet"
  ON bet_submissions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM squads s WHERE s.id = squad_id AND s.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM bet_instances bi
      WHERE bi.id = bet_instance_id
        AND bi.status = 'open'
        AND bi.deadline_at > NOW()
    )
  );

CREATE POLICY "squad owner updates own bet"
  ON bet_submissions FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM bet_instances bi
      WHERE bi.id = bet_instance_id
        AND bi.status = 'open'
        AND bi.deadline_at > NOW()
    )
  );

-- ── submit_bet RPC ─────────────────────────────────────────────────────────────
-- Called by the client. Validates deadline and idempotently upserts submission.
CREATE OR REPLACE FUNCTION submit_bet(
  p_instance_id UUID,
  p_squad_id    UUID,
  p_answer      TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_instance  bet_instances;
  v_squad     squads;
BEGIN
  SELECT * INTO v_instance FROM bet_instances WHERE id = p_instance_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bet not found.');
  END IF;

  IF v_instance.status <> 'open' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This bet is no longer open.');
  END IF;

  IF v_instance.deadline_at < NOW() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Deadline has passed.');
  END IF;

  -- Verify caller owns the squad
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found or not yours.');
  END IF;

  -- Verify squad is in the same league as this bet
  IF NOT EXISTS (
    SELECT 1 FROM league_members lm
    WHERE lm.league_id = v_instance.league_id AND lm.user_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'You are not a member of this league.');
  END IF;

  INSERT INTO bet_submissions (bet_instance_id, squad_id, user_id, answer)
  VALUES (p_instance_id, p_squad_id, auth.uid(), p_answer)
  ON CONFLICT (bet_instance_id, squad_id)
  DO UPDATE SET answer = EXCLUDED.answer, submitted_at = NOW();

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── resolve_bet RPC ────────────────────────────────────────────────────────────
-- Called by commissioner or edge function after results are known.
-- Marks correct submissions and awards rewards.
CREATE OR REPLACE FUNCTION resolve_bet(
  p_instance_id   UUID,
  p_correct_answer TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_instance  bet_instances;
  v_updated   INT;
BEGIN
  SELECT * INTO v_instance FROM bet_instances WHERE id = p_instance_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Bet not found.');
  END IF;

  IF v_instance.status = 'resolved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Already resolved.');
  END IF;

  -- Mark instance resolved
  UPDATE bet_instances
  SET status = 'resolved', correct_answer = p_correct_answer
  WHERE id = p_instance_id;

  -- Mark correct/wrong and award rewards
  UPDATE bet_submissions
  SET
    is_correct     = (answer = p_correct_answer),
    reward_awarded = CASE WHEN answer = p_correct_answer THEN v_instance.reward_value ELSE 0 END
  WHERE bet_instance_id = p_instance_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'submissions_updated', v_updated);
END;
$$;

-- ── Seed: 3 starter templates ─────────────────────────────────────────────────
INSERT INTO bet_templates (slug, title, description, answer_type, scope_type, reward_type, default_reward, sort_order)
VALUES
  (
    'top_scorer',
    'Matchday Top Scorer',
    'Predict which player will score the most goals this matchday',
    'player_pick',
    'matchday',
    'points',
    5,
    1
  ),
  (
    'match_result',
    'Match Result',
    'Predict the outcome of a specific match',
    'team_pick',
    'match',
    'points',
    3,
    2
  ),
  (
    'player_block',
    'Player Block',
    'Pick an opponent''s player — if they score fewer than 5 fantasy points, you earn the reward',
    'player_pick',
    'matchday',
    'points',
    4,
    3
  )
ON CONFLICT (slug) DO NOTHING;
