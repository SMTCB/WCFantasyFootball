-- Migration 252: Wishlist Draft submissions
--
-- Recurring, opt-in transfer-window allocation for draft-mode leagues. Any
-- manager may submit a ranked wishlist of target players (up to 10, index 0 =
-- highest priority) plus a list of their own current squad players they're
-- willing to drop to fund those targets. A separate automated process
-- (run-wishlist-draft / auto-open-transfer-window pre-step) resolves these
-- via a snake-draft allocation before the general transfer window opens,
-- removing the "whoever's online when the market opens wins" timezone bias.
--
-- Keyed on round_number (not matchday_id) because that's exactly what
-- transfer_windows and auto-open-transfer-window already key on, and it's
-- known before any window row or matchday resolution exists for that round.
--
-- Mirrors knockout_keep_submissions' RLS/RPC shape (migration 143).

-- ── 1. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS wishlist_draft_submissions (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id      uuid        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_number   int         NOT NULL,
  target_ids     text[]      NOT NULL DEFAULT '{}',
  drop_ids       text[]      NOT NULL DEFAULT '{}',
  submitted_at   timestamptz NOT NULL DEFAULT NOW(),
  status         draft_status NOT NULL DEFAULT 'pending',
  UNIQUE (league_id, user_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_wishlist_draft_submissions_league_round
  ON wishlist_draft_submissions (league_id, round_number)
  WHERE status = 'pending';

-- ── 2. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE wishlist_draft_submissions ENABLE ROW LEVEL SECURITY;

-- Members can read all submissions for their league (needed for participant
-- counts and the eventual gazette report).
CREATE POLICY "wishlist_draft_submissions_select"
  ON wishlist_draft_submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_id = wishlist_draft_submissions.league_id
        AND user_id   = auth.uid()
    )
  );

-- Managers write their own row only; server-side validation happens in the RPC.
CREATE POLICY "wishlist_draft_submissions_insert"
  ON wishlist_draft_submissions FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "wishlist_draft_submissions_update"
  ON wishlist_draft_submissions FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 3. submit_wishlist_draft RPC ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION submit_wishlist_draft(
  p_league_id    uuid,
  p_round_number int,
  p_target_ids   text[],
  p_drop_ids     text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user           uuid := auth.uid();
  v_format         text;
  v_league_mode    text;
  v_enabled        text;
  v_max_targets    int := 10;
  v_max_drops      int := 5;
  v_squad_players  text[];
  v_processed_at   timestamptz;
  pid              text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_user
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not a league member');
  END IF;

  SELECT format, league_mode INTO v_format, v_league_mode
    FROM leagues WHERE id = p_league_id;

  -- Feature only applies to draft-mode leagues (player exclusivity). This is
  -- the same combined check the allocator code trusts elsewhere in the repo.
  IF v_format IS DISTINCT FROM 'noduplicate' AND v_league_mode IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Wishlist draft only available in draft-mode leagues');
  END IF;

  -- Per-league config (falls back to defaults, same convention as knockout_keep_slots)
  SELECT (config_value #>> '{}')::int INTO v_max_targets
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_targets';
  IF v_max_targets IS NULL THEN v_max_targets := 10; END IF;

  SELECT (config_value #>> '{}')::int INTO v_max_drops
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_drops';
  IF v_max_drops IS NULL THEN v_max_drops := 5; END IF;

  SELECT (config_value #>> '{}') INTO v_enabled
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_enabled';
  IF v_enabled = 'false' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Wishlist draft is disabled for this league');
  END IF;

  -- Guard: round must not already have been processed.
  SELECT processed_at INTO v_processed_at
    FROM wishlist_draft_windows
   WHERE league_id = p_league_id AND round_number = p_round_number;
  IF v_processed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'code',  'WINDOW_CLOSED',
      'error', 'This round''s wishlist draft has already been allocated'
    );
  END IF;

  -- Count checks
  IF array_length(p_target_ids, 1) > v_max_targets THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'code',  'TOO_MANY_TARGETS',
      'error', 'Maximum ' || v_max_targets || ' target players allowed'
    );
  END IF;
  IF array_length(p_drop_ids, 1) > v_max_drops THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'code',  'TOO_MANY_DROPS',
      'error', 'Maximum ' || v_max_drops || ' players can be released'
    );
  END IF;

  -- drop_ids must be a subset of the manager's current squad
  SELECT players INTO v_squad_players
    FROM squads
   WHERE league_id = p_league_id AND user_id = v_user
   ORDER BY created_at DESC LIMIT 1;

  IF p_drop_ids IS NOT NULL AND array_length(p_drop_ids, 1) > 0 THEN
    IF v_squad_players IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'No squad found for this league');
    END IF;
    FOREACH pid IN ARRAY p_drop_ids LOOP
      IF NOT (v_squad_players @> ARRAY[pid]) THEN
        RETURN jsonb_build_object(
          'ok',    false,
          'code',  'NOT_IN_SQUAD',
          'error', 'Player ' || pid || ' is not in your squad'
        );
      END IF;
    END LOOP;
  END IF;

  -- Upsert — managers can revise their submission until the round is processed
  INSERT INTO wishlist_draft_submissions
    (league_id, user_id, round_number, target_ids, drop_ids, submitted_at, status)
  VALUES
    (p_league_id, v_user, p_round_number,
     COALESCE(p_target_ids, ARRAY[]::text[]), COALESCE(p_drop_ids, ARRAY[]::text[]),
     NOW(), 'pending')
  ON CONFLICT (league_id, user_id, round_number) DO UPDATE
    SET target_ids   = EXCLUDED.target_ids,
        drop_ids     = EXCLUDED.drop_ids,
        submitted_at = EXCLUDED.submitted_at,
        status       = 'pending';

  RETURN jsonb_build_object(
    'ok',           true,
    'target_count', COALESCE(array_length(p_target_ids, 1), 0),
    'drop_count',   COALESCE(array_length(p_drop_ids, 1), 0),
    'max_targets',  v_max_targets,
    'max_drops',    v_max_drops
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION submit_wishlist_draft(uuid, int, text[], text[]) FROM anon;
GRANT  EXECUTE ON FUNCTION submit_wishlist_draft(uuid, int, text[], text[]) TO authenticated;
