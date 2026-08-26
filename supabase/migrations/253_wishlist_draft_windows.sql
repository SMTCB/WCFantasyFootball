-- Migration 253: Wishlist Draft windows
--
-- Per-league-per-round processing marker + snake-order rotation state for the
-- wishlist draft (see migration 252). `processed_at IS NULL` marks "not yet
-- run" — this is what submit_wishlist_draft checks to reject late submissions,
-- and what the allocator checks to avoid double-processing a round.
--
-- `snake_order_seed` is set once per league (first wishlist window that ever
-- runs) via a genuine random shuffle, then carried forward UNCHANGED forever
-- after — it is a per-league constant, not something that advances on its
-- own. The rotation-by-one-seat-per-window guarantee comes from folding
-- `round_number` into the shift calculation (see rotateOrder() in
-- _shared/wishlistDraft.ts: shift = (seed + round_number) % n), since
-- round_number itself increments by 1 each successive window. This avoids a
-- manager drawing last pick several windows running by chance, which would
-- look broken during an early pilot even though it's fair in expectation.
--
-- Service-role-only writes: this table is orchestration state, not something
-- a manager should ever be able to edit directly.

CREATE TABLE IF NOT EXISTS wishlist_draft_windows (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id          uuid        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  round_number       int         NOT NULL,
  snake_order_seed   int         NOT NULL,
  processed_at       timestamptz,
  participant_count  int         NOT NULL DEFAULT 0,
  created_at         timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (league_id, round_number)
);

ALTER TABLE wishlist_draft_windows ENABLE ROW LEVEL SECURITY;

-- Members can read window state for their league (drives the UI's "round open /
-- already allocated" display).
CREATE POLICY "wishlist_draft_windows_select"
  ON wishlist_draft_windows FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_id = wishlist_draft_windows.league_id
        AND user_id   = auth.uid()
    )
  );

-- No client-side INSERT/UPDATE/DELETE policies — only the service-role
-- (Edge Functions) writes this table, which bypasses RLS entirely.

-- ── get_wishlist_draft_status ────────────────────────────────────────────────
-- Single read RPC the frontend calls to know which round is currently
-- accepting submissions and this league's caps, without duplicating the
-- round-number computation (highest finished fixture round + 1 — mirrors
-- auto-open-transfer-window/index.js exactly) in client code.
CREATE OR REPLACE FUNCTION get_wishlist_draft_status(p_league_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament_id uuid;
  v_format        text;
  v_league_mode   text;
  v_round         int;
  v_processed_at  timestamptz;
  v_max_targets   int := 10;
  v_max_drops     int := 5;
  v_enabled       text;
BEGIN
  SELECT tournament_id, format, league_mode INTO v_tournament_id, v_format, v_league_mode
    FROM leagues WHERE id = p_league_id;

  IF v_tournament_id IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'league not found');
  END IF;

  IF v_format IS DISTINCT FROM 'noduplicate' AND v_league_mode IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('available', false, 'reason', 'not a draft-mode league');
  END IF;

  SELECT (config_value #>> '{}') INTO v_enabled
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_enabled';
  IF v_enabled = 'false' THEN
    RETURN jsonb_build_object('available', false, 'reason', 'disabled for this league');
  END IF;

  SELECT MAX(round_number) INTO v_round
    FROM fixtures WHERE tournament_id = v_tournament_id AND status = 'finished';

  IF v_round IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'no completed round yet');
  END IF;
  v_round := v_round + 1;

  SELECT processed_at INTO v_processed_at
    FROM wishlist_draft_windows
   WHERE league_id = p_league_id AND round_number = v_round;

  SELECT (config_value #>> '{}')::int INTO v_max_targets
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_targets';
  IF v_max_targets IS NULL THEN v_max_targets := 10; END IF;

  SELECT (config_value #>> '{}')::int INTO v_max_drops
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_drops';
  IF v_max_drops IS NULL THEN v_max_drops := 5; END IF;

  RETURN jsonb_build_object(
    'available',    v_processed_at IS NULL,
    'round_number', v_round,
    'max_targets',  v_max_targets,
    'max_drops',    v_max_drops
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION get_wishlist_draft_status(uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION get_wishlist_draft_status(uuid) TO authenticated;
