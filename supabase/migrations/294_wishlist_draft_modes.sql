-- Migration 294: Wishlist Draft modes (manual / auto / disabled) per matchday
--
-- Why: the between-matchday wishlist draft used to run the moment the previous
-- round finished — before managers had picked the new players they wanted.
-- Commissioners now choose, per league (default) and per round (override):
--
--   manual   — commissioner runs it from the admin panel. Fallback: it ALWAYS
--              runs at first-kickoff − 8h if nobody pressed the button.
--   auto     — runs at a commissioner-chosen time (suggested: kickoff − 48h),
--              never later than kickoff − 8h.
--   disabled — no draft that round: free market, first come first served.
--
-- While a draft mode is pending ("phase A"), the market is closed but
-- player-for-player trades are still allowed. While the draft is actually
-- running, everything (transfers, trades, wishlist edits) is frozen. Once it
-- commits, the market opens until kickoff − 1h.
--
-- Pieces:
--   1. wishlist_draft_windows gains mode/status/timing columns. A row for
--      round N+1 is created (by auto-open-transfer-window → create_wishlist_
--      draft_round) the moment round N finishes, snapshotting the league's
--      default mode; the commissioner can override that round only.
--   2. wishlist_draft_submissions.carried_over_from — unfinished wishlists
--      roll into the next round automatically.
--   3. wishlist_draft_mode_changes — audit log of every mode change.
--   4. RPCs: set_wishlist_draft_mode, request_wishlist_draft_run (commissioner),
--      sync_wishlist_draft_kickoffs (service role),
--      create_wishlist_draft_round, commit_wishlist_draft (service role).
--   5. commit_wishlist_draft is atomic: it locks the league's squads and
--      verifies nothing moved since the allocator's snapshot (returns STALE so
--      the Edge Function re-runs the allocation — "player taken → next").
--   6. get_transfer_window_status / accept_trade_proposal / submit_wishlist_
--      draft / get_wishlist_draft_status learn about the new phases.
--   7. run-wishlist-draft cron goes from hourly to every 15 minutes (it is now
--      the scheduler that fires auto times and the kickoff − 8h fallback).
--
-- Only draft-mode leagues (format='noduplicate' OR league_mode='draft') are
-- affected. Classic leagues and the season-start draft are unchanged.

-- ── 1. Schema ────────────────────────────────────────────────────────────────

ALTER TABLE wishlist_draft_windows
  ADD COLUMN IF NOT EXISTS mode                  text        NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS status                text        NOT NULL DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS scheduled_at          timestamptz,
  ADD COLUMN IF NOT EXISTS hard_deadline_at      timestamptz,
  ADD COLUMN IF NOT EXISTS first_kickoff_at      timestamptz,
  ADD COLUMN IF NOT EXISTS round_ended_at        timestamptz,
  ADD COLUMN IF NOT EXISTS run_requested_at      timestamptz,
  ADD COLUMN IF NOT EXISTS run_requested_by      uuid,
  ADD COLUMN IF NOT EXISTS run_trigger           text,
  ADD COLUMN IF NOT EXISTS run_token             uuid,
  ADD COLUMN IF NOT EXISTS started_at            timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_sent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS kickoff_alert_sent_at timestamptz;

-- Legacy rows: every existing row was created by the old inline path, which
-- claimed + processed in one go.
UPDATE wishlist_draft_windows SET status = 'done' WHERE processed_at IS NOT NULL AND status = 'scheduled';

ALTER TABLE wishlist_draft_windows
  ADD CONSTRAINT wishlist_draft_windows_mode_check   CHECK (mode   IN ('manual', 'auto', 'disabled')),
  ADD CONSTRAINT wishlist_draft_windows_status_check CHECK (status IN ('scheduled', 'running', 'done', 'expired'));

CREATE INDEX IF NOT EXISTS idx_wishlist_draft_windows_pending
  ON wishlist_draft_windows (status) WHERE status IN ('scheduled', 'running');

ALTER TABLE wishlist_draft_submissions
  ADD COLUMN IF NOT EXISTS carried_over_from int;

CREATE TABLE IF NOT EXISTS wishlist_draft_mode_changes (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id           uuid        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  round_number        int,                        -- NULL = league default changed
  scope               text        NOT NULL CHECK (scope IN ('round', 'default')),
  from_mode           text,
  to_mode             text        NOT NULL,
  from_scheduled_at   timestamptz,
  to_scheduled_at     timestamptz,
  transfers_in_window int         NOT NULL DEFAULT 0,
  changed_by          uuid,
  changed_at          timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wishlist_mode_changes_league
  ON wishlist_draft_mode_changes (league_id, changed_at DESC);

ALTER TABLE wishlist_draft_mode_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wishlist_draft_mode_changes_select"
  ON wishlist_draft_mode_changes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_members
       WHERE league_id = wishlist_draft_mode_changes.league_id
         AND user_id   = auth.uid()
    )
  );
-- Writes only through the SECURITY DEFINER RPCs below.

-- ── 2. Internal helpers ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._wishlist_is_draft_league(p_league_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT format = 'noduplicate' OR league_mode = 'draft' FROM leagues WHERE id = p_league_id),
    false
  );
$$;

-- League default mode. Legacy wishlist_draft_enabled='false' maps to disabled.
CREATE OR REPLACE FUNCTION public._wishlist_default_mode(p_league_id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_mode    text;
  v_enabled text;
BEGIN
  SELECT config_value #>> '{}' INTO v_mode
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_mode';
  IF v_mode IN ('manual', 'auto', 'disabled') THEN RETURN v_mode; END IF;

  SELECT config_value #>> '{}' INTO v_enabled
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_enabled';
  IF v_enabled = 'false' THEN RETURN 'disabled'; END IF;

  RETURN 'auto';
END;
$$;

-- Suggested auto draft time: kickoff − 48h, but never sooner than round end
-- + 12h nor later than kickoff − 12h. Short gaps fall back to halfway between
-- round end and kickoff (still capped at the kickoff − 8h hard deadline).
-- Unknown kickoff → round end + 24h (re-suggested once fixtures sync).
CREATE OR REPLACE FUNCTION public._wishlist_suggested_draft_at(
  p_round_ended_at timestamptz,
  p_first_kickoff  timestamptz
) RETURNS timestamptz LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_end      timestamptz := COALESCE(p_round_ended_at, NOW());
  v_earliest timestamptz;
  v_latest   timestamptz;
BEGIN
  IF p_first_kickoff IS NULL THEN
    RETURN v_end + interval '24 hours';
  END IF;

  v_earliest := v_end + interval '12 hours';
  v_latest   := p_first_kickoff - interval '12 hours';

  IF v_latest - v_earliest < interval '0' THEN
    RETURN LEAST(v_end + (p_first_kickoff - v_end) / 2, p_first_kickoff - interval '8 hours');
  END IF;

  RETURN GREATEST(v_earliest, LEAST(v_latest, p_first_kickoff - interval '48 hours'));
END;
$$;

-- Opens (or keeps open) the regular market for a round: opens now, closes
-- kickoff − 1h (48h fallback when kickoff is unknown) — same rule
-- auto-open-transfer-window has always used.
CREATE OR REPLACE FUNCTION public._wishlist_open_market(p_league_id uuid, p_round int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament_id text;
  v_kickoff       timestamptz;
  v_closes        timestamptz;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;
  SELECT MIN(kickoff_at) INTO v_kickoff
    FROM fixtures WHERE tournament_id = v_tournament_id AND round_number = p_round;

  v_closes := COALESCE(v_kickoff - interval '1 hour', NOW() + interval '48 hours');
  IF v_closes <= NOW() THEN RETURN; END IF;

  INSERT INTO transfer_windows (league_id, round_number, opens_at, closes_at, window_type, transfers_remaining)
  VALUES (p_league_id, p_round, NOW(), v_closes, 'standard', NULL)
  ON CONFLICT (league_id, round_number) DO UPDATE
    SET opens_at  = LEAST(transfer_windows.opens_at, NOW()),
        closes_at = GREATEST(transfer_windows.closes_at, EXCLUDED.closes_at);
END;
$$;

-- Carry each member's most recent earlier wishlist into p_round when they have
-- no submission for it yet. Targets already in their own squad are dropped;
-- targets owned by someone else are KEPT (the UI greys them out as "Owned by
-- X" — the allocator skips them if still owned at draft time). Releases start
-- empty, since a stale release list could drop a player the manager now wants.
CREATE OR REPLACE FUNCTION public._wishlist_carry_over(p_league_id uuid, p_round int)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count int;
BEGIN
  WITH prev AS (
    SELECT DISTINCT ON (s.user_id) s.user_id, s.round_number, s.target_ids
      FROM wishlist_draft_submissions s
      JOIN league_members m ON m.league_id = s.league_id AND m.user_id = s.user_id
     WHERE s.league_id = p_league_id
       AND s.round_number < p_round
     ORDER BY s.user_id, s.round_number DESC
  ),
  own AS (
    SELECT DISTINCT ON (q.user_id) q.user_id, COALESCE(q.players, ARRAY[]::text[]) AS players
      FROM squads q
     WHERE q.league_id = p_league_id
     ORDER BY q.user_id, q.created_at DESC
  ),
  carried AS (
    SELECT p.user_id, p.round_number,
           ARRAY(
             SELECT t FROM unnest(p.target_ids) WITH ORDINALITY AS u(t, ord)
              WHERE NOT (t = ANY (COALESCE(o.players, ARRAY[]::text[])))
              ORDER BY ord
           ) AS targets
      FROM prev p
      LEFT JOIN own o ON o.user_id = p.user_id
  ),
  ins AS (
    INSERT INTO wishlist_draft_submissions
      (league_id, user_id, round_number, target_ids, drop_ids, submitted_at, status, carried_over_from)
    SELECT p_league_id, c.user_id, p_round, c.targets, ARRAY[]::text[], NOW(), 'pending', c.round_number
      FROM carried c
     WHERE COALESCE(array_length(c.targets, 1), 0) > 0
    ON CONFLICT (league_id, user_id, round_number) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM ins;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public._wishlist_notify_members(
  p_league_id   uuid,
  p_type        text,
  p_title       text,
  p_description text,
  p_by          uuid,
  p_only_commissioners boolean DEFAULT false
) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO league_notifications
    (league_id, user_id, notification_type, triggered_by_user_id, title, description, related_entity_type)
  SELECT p_league_id, m.user_id, p_type, p_by, p_title, p_description, 'wishlist_draft'
    FROM league_members m
   WHERE m.league_id = p_league_id
     AND (NOT p_only_commissioners OR m.role = 'commissioner');
$$;

-- The round whose wishlist draft is still pending (not run, not expired, and
-- its first kickoff not yet passed). NULL when there is none — i.e. between
-- "draft done" and "next round finished", when changes apply to the next round.
CREATE OR REPLACE FUNCTION public._wishlist_pending_window(p_league_id uuid)
RETURNS wishlist_draft_windows LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT *
    FROM wishlist_draft_windows
   WHERE league_id = p_league_id
     AND status IN ('scheduled', 'running')
     AND processed_at IS NULL
     AND (first_kickoff_at IS NULL OR NOW() < first_kickoff_at)
   ORDER BY round_number DESC
   LIMIT 1;
$$;

-- Buys made in the free market since this round's window row was created —
-- shown to the commissioner before switching a disabled round back to a draft.
CREATE OR REPLACE FUNCTION public._wishlist_transfers_in_window(p_league_id uuid, p_since timestamptz)
RETURNS int LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COUNT(*)::int
    FROM squad_events
   WHERE league_id  = p_league_id
     AND event_type = 'transfer_buy'
     AND event_at >= p_since;
$$;

REVOKE EXECUTE ON FUNCTION public._wishlist_is_draft_league(uuid)               FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._wishlist_default_mode(uuid)                  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._wishlist_open_market(uuid, int)              FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._wishlist_carry_over(uuid, int)               FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._wishlist_notify_members(uuid, text, text, text, uuid, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._wishlist_pending_window(uuid)                FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._wishlist_transfers_in_window(uuid, timestamptz) FROM anon, authenticated;

-- ── 3. Service-role RPCs (Edge Functions) ────────────────────────────────────

-- Called by auto-open-transfer-window when round p_round − 1 has finished.
-- Idempotent: returns the existing row if one was already created.
CREATE OR REPLACE FUNCTION public.create_wishlist_draft_round(
  p_league_id      uuid,
  p_round          int,
  p_round_ended_at timestamptz,
  p_first_kickoff  timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row      wishlist_draft_windows;
  v_mode     text;
  v_seed     int;
  v_deadline timestamptz;
  v_carried  int := 0;
BEGIN
  SELECT * INTO v_row FROM wishlist_draft_windows WHERE league_id = p_league_id AND round_number = p_round;
  IF v_row.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'created', false, 'mode', v_row.mode, 'status', v_row.status);
  END IF;

  IF NOT _wishlist_is_draft_league(p_league_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not a draft-mode league');
  END IF;

  v_mode := _wishlist_default_mode(p_league_id);

  -- Per-league constant seed, carried forward (see migration 253).
  SELECT snake_order_seed INTO v_seed
    FROM wishlist_draft_windows WHERE league_id = p_league_id
   ORDER BY round_number DESC LIMIT 1;
  v_seed := COALESCE(v_seed, floor(random() * 1000000)::int);

  v_deadline := p_first_kickoff - interval '8 hours';

  INSERT INTO wishlist_draft_windows
    (league_id, round_number, snake_order_seed, mode, status, scheduled_at,
     hard_deadline_at, first_kickoff_at, round_ended_at)
  VALUES
    (p_league_id, p_round, v_seed, v_mode, 'scheduled',
     CASE WHEN v_mode = 'auto' THEN _wishlist_suggested_draft_at(p_round_ended_at, p_first_kickoff) END,
     v_deadline, p_first_kickoff, p_round_ended_at)
  ON CONFLICT (league_id, round_number) DO NOTHING
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    -- Lost a race with a concurrent caller — their row stands.
    RETURN jsonb_build_object('ok', true, 'created', false);
  END IF;

  v_carried := _wishlist_carry_over(p_league_id, p_round);

  IF v_mode = 'disabled' THEN
    PERFORM _wishlist_open_market(p_league_id, p_round);
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'created', true, 'mode', v_mode,
    'scheduled_at', v_row.scheduled_at, 'hard_deadline_at', v_row.hard_deadline_at,
    'carried_over', v_carried
  );
END;
$$;

-- Atomic commit of an allocation computed by the Edge Function.
--
-- p_allocations: [{ squad_id, user_id, expected_players: text[],
--                   players: text[], budget_remaining: numeric }]
--
-- Locks every squad in the league, then verifies the world still matches the
-- allocator's snapshot: each participant's squad is still their latest row
-- and still holds exactly `expected_players`, and the final rosters contain
-- no player twice (catches anyone outside the draft who grabbed an allocated
-- player). Any mismatch → { ok:false, code:'STALE' } and nothing is written;
-- the caller reloads and re-runs the allocation, so a player bought in the
-- meantime is simply "taken → next".
CREATE OR REPLACE FUNCTION public.commit_wishlist_draft(
  p_league_id         uuid,
  p_round             int,
  p_run_token         uuid,
  p_allocations       jsonb,
  p_participant_count int
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row        wishlist_draft_windows;
  v_alloc      jsonb;
  v_squad_id   uuid;
  v_latest_id  uuid;
  v_current    text[];
  v_expected   text[];
  v_dupe       text;
  v_carried    int;
BEGIN
  SELECT * INTO v_row FROM wishlist_draft_windows
   WHERE league_id = p_league_id AND round_number = p_round FOR UPDATE;
  IF v_row.id IS NULL OR v_row.status <> 'running' OR v_row.run_token IS DISTINCT FROM p_run_token THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_RUNNING');
  END IF;

  PERFORM 1 FROM squads WHERE league_id = p_league_id ORDER BY id FOR UPDATE;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) LOOP
    v_squad_id := (v_alloc->>'squad_id')::uuid;

    SELECT id INTO v_latest_id FROM squads
     WHERE league_id = p_league_id AND user_id = (v_alloc->>'user_id')::uuid
     ORDER BY created_at DESC LIMIT 1;
    IF v_latest_id IS DISTINCT FROM v_squad_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'STALE', 'reason', 'squad row changed', 'squad_id', v_squad_id);
    END IF;

    SELECT ARRAY(SELECT x FROM unnest(COALESCE(players, ARRAY[]::text[])) x ORDER BY x) INTO v_current
      FROM squads WHERE id = v_squad_id;
    SELECT ARRAY(SELECT x FROM jsonb_array_elements_text(COALESCE(v_alloc->'expected_players', '[]'::jsonb)) x ORDER BY x)
      INTO v_expected;
    IF v_current IS DISTINCT FROM v_expected THEN
      RETURN jsonb_build_object('ok', false, 'code', 'STALE', 'reason', 'squad changed since snapshot', 'squad_id', v_squad_id);
    END IF;
  END LOOP;

  -- Exclusivity across the final state of every latest squad.
  WITH latest AS (
    SELECT DISTINCT ON (user_id) id, players
      FROM squads WHERE league_id = p_league_id
     ORDER BY user_id, created_at DESC
  ),
  final_rosters AS (
    SELECT l.id,
           CASE WHEN a.value IS NOT NULL
                THEN ARRAY(SELECT jsonb_array_elements_text(a.value->'players'))
                ELSE COALESCE(l.players, ARRAY[]::text[]) END AS players
      FROM latest l
      LEFT JOIN jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) a
        ON (a.value->>'squad_id')::uuid = l.id
  )
  SELECT pid INTO v_dupe
    FROM final_rosters, unnest(players) pid
   GROUP BY pid HAVING COUNT(*) > 1
   LIMIT 1;
  IF v_dupe IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE', 'reason', 'player owned twice', 'player_id', v_dupe);
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(COALESCE(p_allocations, '[]'::jsonb)) LOOP
    UPDATE squads
       SET players          = ARRAY(SELECT jsonb_array_elements_text(v_alloc->'players')),
           budget_remaining = (v_alloc->>'budget_remaining')::numeric
     WHERE id = (v_alloc->>'squad_id')::uuid;
  END LOOP;

  UPDATE wishlist_draft_submissions
     SET status = 'processed'
   WHERE league_id = p_league_id AND round_number = p_round AND status = 'pending';

  UPDATE wishlist_draft_windows
     SET status = 'done', processed_at = NOW(), participant_count = COALESCE(p_participant_count, 0),
         run_token = NULL
   WHERE id = v_row.id;

  PERFORM _wishlist_open_market(p_league_id, p_round);

  -- Unfilled targets roll straight into the next round's wishlist.
  v_carried := _wishlist_carry_over(p_league_id, p_round + 1);

  RETURN jsonb_build_object('ok', true, 'carried_over', v_carried);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_wishlist_draft_round(uuid, int, timestamptz, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.commit_wishlist_draft(uuid, int, uuid, jsonb, int)              FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_wishlist_draft_round(uuid, int, timestamptz, timestamptz) TO service_role;
GRANT  EXECUTE ON FUNCTION public.commit_wishlist_draft(uuid, int, uuid, jsonb, int)              TO service_role;

-- Fills in kickoff-derived times for pending rounds created before their
-- fixtures were synced (first_kickoff_at NULL). Called by the scheduler every
-- tick. An auto time the league picked itself (no round-scope audit row) is
-- re-suggested from the real kickoff; a time a commissioner set is only
-- pulled forward if it now falls after the kickoff − 8h deadline. Never
-- schedules anything sooner than 6h from now unless the deadline forces it.
CREATE OR REPLACE FUNCTION public.sync_wishlist_draft_kickoffs()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row      wishlist_draft_windows;
  v_kickoff  timestamptz;
  v_deadline timestamptz;
  v_time     timestamptz;
  v_admin    boolean;
  v_count    int := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM wishlist_draft_windows
     WHERE status = 'scheduled' AND processed_at IS NULL AND first_kickoff_at IS NULL
     FOR UPDATE SKIP LOCKED
  LOOP
    SELECT MIN(f.kickoff_at) INTO v_kickoff
      FROM fixtures f JOIN leagues l ON l.tournament_id = f.tournament_id
     WHERE l.id = v_row.league_id AND f.round_number = v_row.round_number;
    CONTINUE WHEN v_kickoff IS NULL;

    v_deadline := v_kickoff - interval '8 hours';
    v_time     := v_row.scheduled_at;

    IF v_row.mode = 'auto' THEN
      v_admin := EXISTS (
        SELECT 1 FROM wishlist_draft_mode_changes
         WHERE league_id = v_row.league_id AND round_number = v_row.round_number AND scope = 'round'
      );
      IF NOT v_admin THEN
        v_time := GREATEST(_wishlist_suggested_draft_at(v_row.round_ended_at, v_kickoff),
                           NOW() + interval '6 hours');
      END IF;
      v_time := LEAST(v_time, v_deadline);
    END IF;

    UPDATE wishlist_draft_windows
       SET first_kickoff_at = v_kickoff,
           hard_deadline_at = v_deadline,
           scheduled_at     = v_time
     WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_wishlist_draft_kickoffs() FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.sync_wishlist_draft_kickoffs() TO service_role;

-- ── 4. Commissioner RPCs ─────────────────────────────────────────────────────

-- p_scope = 'round'   → change the pending round only (phase A).
-- p_scope = 'default' → change the league default (applies from the next
--                       round whose window hasn't been created yet).
CREATE OR REPLACE FUNCTION public.set_wishlist_draft_mode(
  p_league_id    uuid,
  p_scope        text,
  p_mode         text,
  p_scheduled_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user       uuid := auth.uid();
  v_row        wishlist_draft_windows;
  v_from_mode  text;
  v_time       timestamptz;
  v_min        timestamptz := NOW() + interval '6 hours' - interval '1 minute';
  v_transfers  int := 0;
  v_title      text;
  v_desc       text;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_user AND role = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Commissioner only');
  END IF;

  IF NOT _wishlist_is_draft_league(p_league_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_DRAFT', 'error', 'Wishlist draft only exists in draft-mode leagues');
  END IF;

  IF p_mode NOT IN ('manual', 'auto', 'disabled') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_MODE', 'error', 'Mode must be manual, auto or disabled');
  END IF;

  -- League default ----------------------------------------------------------
  IF p_scope = 'default' THEN
    v_from_mode := _wishlist_default_mode(p_league_id);
    IF v_from_mode = p_mode THEN
      RETURN jsonb_build_object('ok', true, 'changed', false);
    END IF;

    INSERT INTO league_config (league_id, config_key, config_value, updated_at)
    VALUES (p_league_id, 'wishlist_draft_mode', to_jsonb(p_mode), NOW())
    ON CONFLICT (league_id, config_key) DO UPDATE
      SET config_value = EXCLUDED.config_value, updated_at = NOW();

    INSERT INTO wishlist_draft_mode_changes (league_id, round_number, scope, from_mode, to_mode, changed_by)
    VALUES (p_league_id, NULL, 'default', v_from_mode, p_mode, v_user);

    PERFORM _wishlist_notify_members(
      p_league_id, 'wishlist_draft_mode', 'Wishlist draft setting changed',
      'From the next round: ' || CASE p_mode
        WHEN 'manual'   THEN 'the commissioner runs the draft (latest 8h before kickoff).'
        WHEN 'auto'     THEN 'the draft runs automatically before each round.'
        ELSE 'no draft — free market, first come, first served.' END,
      v_user);

    RETURN jsonb_build_object('ok', true, 'changed', true, 'scope', 'default');
  END IF;

  IF p_scope <> 'round' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SCOPE', 'error', 'Scope must be round or default');
  END IF;

  -- This round only --------------------------------------------------------
  SELECT * INTO v_row FROM wishlist_draft_windows w
   WHERE w.id = (_wishlist_pending_window(p_league_id)).id
   FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_PENDING_ROUND',
      'error', 'This round''s draft has already run — change the league default to affect the next round');
  END IF;

  IF v_row.status = 'running' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DRAFT_RUNNING', 'error', 'The draft is running right now — try again in a minute');
  END IF;

  v_from_mode := v_row.mode;
  v_transfers := _wishlist_transfers_in_window(p_league_id, v_row.created_at);

  IF p_mode = 'auto' THEN
    v_time := COALESCE(
      p_scheduled_at,
      GREATEST(_wishlist_suggested_draft_at(v_row.round_ended_at, v_row.first_kickoff_at), v_min + interval '1 minute')
    );
    IF v_time < v_min THEN
      RETURN jsonb_build_object('ok', false, 'code', 'TOO_SOON',
        'error', 'The draft time must be at least 6 hours from now so managers can prepare');
    END IF;
    IF v_row.hard_deadline_at IS NOT NULL AND v_time > v_row.hard_deadline_at THEN
      RETURN jsonb_build_object('ok', false, 'code', 'AFTER_DEADLINE',
        'error', 'The draft must run at least 8 hours before the first kickoff',
        'hard_deadline_at', v_row.hard_deadline_at);
    END IF;
  END IF;

  -- Re-enabling a draft from the free market needs the same 6h notice. With
  -- manual mode the effective time is the kickoff − 8h fallback.
  IF v_from_mode = 'disabled' AND p_mode = 'manual'
     AND v_row.hard_deadline_at IS NOT NULL AND v_row.hard_deadline_at < v_min THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOO_LATE',
      'error', 'Kickoff is too close to bring the draft back for this round — it stays a free market');
  END IF;

  IF v_from_mode = p_mode AND (p_mode <> 'auto' OR v_row.scheduled_at IS NOT DISTINCT FROM v_time) THEN
    RETURN jsonb_build_object('ok', true, 'changed', false);
  END IF;

  UPDATE wishlist_draft_windows
     SET mode             = p_mode,
         scheduled_at     = CASE WHEN p_mode = 'auto' THEN v_time END,
         reminder_sent_at = CASE WHEN p_mode = 'manual' THEN reminder_sent_at END
   WHERE id = v_row.id;

  IF p_mode = 'disabled' THEN
    PERFORM _wishlist_open_market(p_league_id, v_row.round_number);
  END IF;

  INSERT INTO wishlist_draft_mode_changes
    (league_id, round_number, scope, from_mode, to_mode, from_scheduled_at, to_scheduled_at,
     transfers_in_window, changed_by)
  VALUES
    (p_league_id, v_row.round_number, 'round', v_from_mode, p_mode, v_row.scheduled_at,
     CASE WHEN p_mode = 'auto' THEN v_time END, v_transfers, v_user);

  v_title := CASE p_mode
    WHEN 'disabled' THEN 'Market open — no wishlist draft this round'
    WHEN 'auto'     THEN 'Wishlist draft scheduled'
    ELSE                 'Wishlist draft: commissioner will run it' END;
  v_desc := CASE p_mode
    WHEN 'disabled' THEN 'Free market, first come, first served. Your wishlist is saved for later.'
    WHEN 'auto'     THEN 'Round ' || v_row.round_number || ' draft runs at '
                         || to_char(v_time AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' UTC. Market closed until then (trades still allowed).'
    ELSE                 'Round ' || v_row.round_number || ' draft will be run by the commissioner'
                         || COALESCE(' — latest ' || to_char(v_row.hard_deadline_at AT TIME ZONE 'UTC', 'Dy DD Mon HH24:MI') || ' UTC', '')
                         || '. Market closed until then (trades still allowed).' END;
  IF v_from_mode = 'disabled' AND p_mode <> 'disabled' AND v_transfers > 0 THEN
    v_desc := v_desc || ' ' || v_transfers || ' transfer(s) already made in the free market stand.';
  END IF;

  PERFORM _wishlist_notify_members(p_league_id, 'wishlist_draft_mode', v_title, v_desc, v_user);

  RETURN jsonb_build_object(
    'ok', true, 'changed', true, 'scope', 'round', 'round_number', v_row.round_number,
    'mode', p_mode, 'scheduled_at', CASE WHEN p_mode = 'auto' THEN v_time END,
    'transfers_in_window', v_transfers
  );
END;
$$;

-- "Run draft now" — flags the pending round; the Edge Function (called right
-- after by the client, and by cron within 15 min as a fallback) picks it up.
CREATE OR REPLACE FUNCTION public.request_wishlist_draft_run(p_league_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row  wishlist_draft_windows;
BEGIN
  IF v_user IS NULL OR NOT EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = v_user AND role = 'commissioner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'error', 'Commissioner only');
  END IF;

  v_row := _wishlist_pending_window(p_league_id);
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_PENDING_ROUND', 'error', 'No wishlist draft is waiting to run');
  END IF;
  IF v_row.status = 'running' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DRAFT_RUNNING', 'error', 'The draft is already running');
  END IF;
  IF v_row.mode = 'disabled' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DISABLED', 'error', 'The draft is disabled for this round');
  END IF;

  UPDATE wishlist_draft_windows
     SET run_requested_at = NOW(), run_requested_by = v_user
   WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'round_number', v_row.round_number, 'window_id', v_row.id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_wishlist_draft_mode(uuid, text, text, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.request_wishlist_draft_run(uuid)                        FROM anon;
GRANT  EXECUTE ON FUNCTION public.set_wishlist_draft_mode(uuid, text, text, timestamptz) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.request_wishlist_draft_run(uuid)                        TO authenticated;

-- ── 5. get_wishlist_draft_status (replaces 288) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.get_wishlist_draft_status(p_league_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_tournament_id  text;
  v_round          int;
  v_last_finished  int;
  v_max_row_round  int;
  v_row            wishlist_draft_windows;
  v_max_targets    int;
  v_max_drops      int;
  v_default_mode   text;
  v_phase          text;
  v_carried_from   int;
  v_is_comm        boolean;
BEGIN
  SELECT tournament_id INTO v_tournament_id FROM leagues WHERE id = p_league_id;
  IF v_tournament_id IS NULL THEN
    RETURN jsonb_build_object('available', false, 'reason', 'league not found');
  END IF;

  IF NOT _wishlist_is_draft_league(p_league_id) THEN
    RETURN jsonb_build_object('available', false, 'reason', 'not a draft-mode league');
  END IF;

  v_default_mode := _wishlist_default_mode(p_league_id);
  v_row          := _wishlist_pending_window(p_league_id);

  IF v_row.id IS NOT NULL THEN
    v_round := v_row.round_number;
    v_phase := CASE
      WHEN v_row.status = 'running' THEN 'running'
      WHEN v_row.mode   = 'disabled' THEN 'free_market'
      ELSE 'pre_draft' END;
  ELSE
    SELECT MAX(round_number) INTO v_last_finished
      FROM fixtures WHERE tournament_id = v_tournament_id AND status = 'finished';
    SELECT MAX(round_number) INTO v_max_row_round
      FROM wishlist_draft_windows WHERE league_id = p_league_id;

    IF v_last_finished IS NULL AND v_max_row_round IS NULL THEN
      RETURN jsonb_build_object('available', false, 'reason', 'no completed round yet');
    END IF;
    v_round := GREATEST(COALESCE(v_last_finished, 0) + 1, COALESCE(v_max_row_round, 0) + 1);
    -- Next round's window doesn't exist yet: the market (if open) belongs to
    -- the current round, and the next round will use the league default.
    v_phase := 'awaiting_round';
  END IF;

  SELECT (config_value #>> '{}')::int INTO v_max_targets
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_targets';
  SELECT (config_value #>> '{}')::int INTO v_max_drops
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_drops';

  SELECT carried_over_from INTO v_carried_from
    FROM wishlist_draft_submissions
   WHERE league_id = p_league_id AND user_id = auth.uid() AND round_number = v_round;

  v_is_comm := EXISTS (
    SELECT 1 FROM league_members WHERE league_id = p_league_id AND user_id = auth.uid() AND role = 'commissioner'
  );

  RETURN jsonb_build_object(
    'available',           true,
    'round_number',        v_round,
    'max_targets',         COALESCE(v_max_targets, 10),
    'max_drops',           COALESCE(v_max_drops, 5),
    'phase',               v_phase,
    'mode',                COALESCE(v_row.mode, v_default_mode),
    'default_mode',        v_default_mode,
    'scheduled_at',        v_row.scheduled_at,
    'hard_deadline_at',    v_row.hard_deadline_at,
    'first_kickoff_at',    v_row.first_kickoff_at,
    'round_ended_at',      v_row.round_ended_at,
    'run_requested_at',    v_row.run_requested_at,
    'carried_over_from',   v_carried_from,
    'is_commissioner',     v_is_comm,
    'transfers_in_window', CASE WHEN v_row.id IS NOT NULL
                                THEN _wishlist_transfers_in_window(p_league_id, v_row.created_at) ELSE 0 END
  );
END;
$function$;

-- ── 6. submit_wishlist_draft (replaces 252) ──────────────────────────────────
-- Changes: rejects while the draft is running; the legacy enabled=false check
-- is gone (disabled now means "paused", wishlists are kept); editing a
-- carried-over wishlist clears its carried_over_from marker.

CREATE OR REPLACE FUNCTION public.submit_wishlist_draft(
  p_league_id    uuid,
  p_round_number int,
  p_target_ids   text[],
  p_drop_ids     text[]
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user           uuid := auth.uid();
  v_max_targets    int;
  v_max_drops      int;
  v_squad_players  text[];
  v_window         wishlist_draft_windows;
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

  IF NOT _wishlist_is_draft_league(p_league_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Wishlist draft only available in draft-mode leagues');
  END IF;

  SELECT (config_value #>> '{}')::int INTO v_max_targets
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_targets';
  v_max_targets := COALESCE(v_max_targets, 10);

  SELECT (config_value #>> '{}')::int INTO v_max_drops
    FROM league_config WHERE league_id = p_league_id AND config_key = 'wishlist_draft_max_drops';
  v_max_drops := COALESCE(v_max_drops, 5);

  SELECT * INTO v_window
    FROM wishlist_draft_windows
   WHERE league_id = p_league_id AND round_number = p_round_number;
  IF v_window.status = 'running' THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'code',  'DRAFT_RUNNING',
      'error', 'The draft is running right now — wishlists are locked for a minute'
    );
  END IF;
  IF v_window.processed_at IS NOT NULL OR v_window.status IN ('done', 'expired') THEN
    RETURN jsonb_build_object(
      'ok',    false,
      'code',  'WINDOW_CLOSED',
      'error', 'This round''s wishlist draft has already been allocated'
    );
  END IF;

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

  INSERT INTO wishlist_draft_submissions
    (league_id, user_id, round_number, target_ids, drop_ids, submitted_at, status, carried_over_from)
  VALUES
    (p_league_id, v_user, p_round_number,
     COALESCE(p_target_ids, ARRAY[]::text[]), COALESCE(p_drop_ids, ARRAY[]::text[]),
     NOW(), 'pending', NULL)
  ON CONFLICT (league_id, user_id, round_number) DO UPDATE
    SET target_ids        = EXCLUDED.target_ids,
        drop_ids          = EXCLUDED.drop_ids,
        submitted_at      = EXCLUDED.submitted_at,
        status            = 'pending',
        carried_over_from = NULL;

  RETURN jsonb_build_object(
    'ok',           true,
    'target_count', COALESCE(array_length(p_target_ids, 1), 0),
    'drop_count',   COALESCE(array_length(p_drop_ids, 1), 0),
    'max_targets',  v_max_targets,
    'max_drops',    v_max_drops
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.submit_wishlist_draft(uuid, int, text[], text[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.submit_wishlist_draft(uuid, int, text[], text[]) TO authenticated;

-- ── 7. get_transfer_window_status (replaces 213) ─────────────────────────────
-- New, at the top: a pending manual/auto wishlist draft closes the market
-- (window_type 'wishlist', or 'wishlist_running' while it executes), however
-- the rest of this function would have answered. And for live draft-mode
-- leagues whose default isn't 'disabled', the deadline-based fallback below
-- no longer re-opens the market on its own between rounds — the wishlist
-- runner opens it (via a transfer_windows row) once the draft has run.
-- Everything else is unchanged from migration 213.

CREATE OR REPLACE FUNCTION public.get_transfer_window_status(p_league_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
AS $function$
DECLARE
  win                   transfer_windows;
  v_wl                  wishlist_draft_windows;
  v_tournament_id       text;
  v_league_mode         text;
  v_is_dry_run          boolean;
  v_wishlist_gated      boolean := false;
  v_prev_deadline       timestamptz;
  v_prev_matchday_id    text;
  v_next_deadline       timestamptz;
  v_next_matchday_id    text;
  v_reopen_hours        int;
  v_round_number        int;
  v_last_kickoff        timestamptz;
  v_reopen_at           timestamptz;
  v_active_round_suffix text;
  v_knockout_unlimited  boolean := false;
BEGIN
  IF _wishlist_is_draft_league(p_league_id) THEN
    v_wl := _wishlist_pending_window(p_league_id);
    IF v_wl.id IS NOT NULL AND v_wl.mode IN ('manual', 'auto') THEN
      RETURN json_build_object(
        'status',         'upcoming',
        'window_type',    CASE WHEN v_wl.status = 'running' THEN 'wishlist_running' ELSE 'wishlist' END,
        'opens_at',       CASE WHEN v_wl.mode = 'auto' THEN COALESCE(v_wl.scheduled_at, v_wl.hard_deadline_at)
                               ELSE v_wl.hard_deadline_at END,
        'draft_mode',     v_wl.mode,
        'round_number',   v_wl.round_number,
        'trades_allowed', v_wl.status = 'scheduled'
      );
    END IF;

    SELECT is_dry_run INTO v_is_dry_run FROM leagues WHERE id = p_league_id;
    v_wishlist_gated := NOT COALESCE(v_is_dry_run, false)
                        AND _wishlist_default_mode(p_league_id) <> 'disabled';
  END IF;

  SELECT (config_value #>> '{}')::int INTO v_reopen_hours
    FROM league_config
   WHERE league_id = p_league_id AND config_key = 'transfer_reopen_hours';

  win := get_active_transfer_window(p_league_id);
  IF win.id IS NOT NULL THEN
    RETURN json_build_object(
      'status',              'open',
      'closes_at',           win.closes_at,
      'transfers_remaining', win.transfers_remaining,
      'window_type',         win.window_type
    );
  END IF;

  SELECT * INTO win
    FROM transfer_windows
   WHERE league_id = p_league_id AND opens_at > NOW()
   ORDER BY opens_at ASC LIMIT 1;
  IF win.id IS NOT NULL THEN
    RETURN json_build_object('status', 'upcoming', 'opens_at', win.opens_at, 'window_type', win.window_type);
  END IF;

  SELECT tournament_id, league_mode INTO v_tournament_id, v_league_mode FROM leagues WHERE id = p_league_id;
  IF v_tournament_id IS NULL THEN RETURN json_build_object('status', 'no_window'); END IF;

  SELECT deadline_at, matchday_id
    INTO v_prev_deadline, v_prev_matchday_id
    FROM matchday_deadlines
   WHERE tournament_id = v_tournament_id AND deadline_at <= NOW()
   ORDER BY deadline_at DESC LIMIT 1;

  SELECT deadline_at, matchday_id INTO v_next_deadline, v_next_matchday_id
    FROM matchday_deadlines
   WHERE tournament_id = v_tournament_id AND deadline_at > NOW()
   ORDER BY deadline_at ASC LIMIT 1;

  v_active_round_suffix := split_part(COALESCE(v_next_matchday_id, v_prev_matchday_id, ''), '-', 2);
  IF v_league_mode = 'classic' AND v_active_round_suffix <> '' THEN
    SELECT unlimited_transfers INTO v_knockout_unlimited
      FROM club_cap_rules
     WHERE tournament_id = v_tournament_id AND round_suffix = v_active_round_suffix;
    v_knockout_unlimited := COALESCE(v_knockout_unlimited, false);
  END IF;

  IF v_prev_deadline IS NULL THEN
    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status', 'open', 'closes_at', v_next_deadline,
        'transfers_remaining', NULL,
        'window_type', CASE WHEN v_knockout_unlimited THEN 'unlimited' ELSE 'matchday' END
      );
    END IF;
    RETURN json_build_object('status', 'no_window');
  END IF;

  IF v_reopen_hours IS NULL THEN
    IF v_prev_matchday_id IS NOT NULL THEN
      v_round_number := split_part(v_prev_matchday_id, '-r', 2)::int;
    END IF;
    IF v_round_number IS NOT NULL AND v_round_number <= 3 THEN
      v_reopen_hours := 1;
    ELSE
      v_reopen_hours := 6;
    END IF;
  END IF;

  IF v_prev_matchday_id IS NOT NULL THEN
    SELECT MAX(kickoff_at) INTO v_last_kickoff
      FROM fixtures
     WHERE matchday_id   = v_prev_matchday_id
       AND tournament_id = v_tournament_id;
  END IF;

  IF v_last_kickoff IS NOT NULL THEN
    v_reopen_at := v_last_kickoff
                 + interval '2 hours'
                 + (v_reopen_hours || ' hours')::interval;
  ELSE
    v_reopen_at := v_prev_deadline + (v_reopen_hours || ' hours')::interval;
  END IF;

  IF NOW() >= v_reopen_at THEN
    IF v_wishlist_gated THEN
      -- Round finished but its wishlist window hasn't been created yet (the
      -- runner ticks every 15–30 min) or the market for this round already
      -- closed at kickoff − 1h. Stay closed; the runner opens it.
      RETURN json_build_object('status', 'upcoming', 'opens_at', NULL, 'window_type', 'wishlist_pending');
    END IF;
    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status', 'open', 'closes_at', v_next_deadline,
        'transfers_remaining', NULL,
        'window_type', CASE WHEN v_knockout_unlimited THEN 'unlimited' ELSE 'matchday' END
      );
    END IF;
    RETURN json_build_object('status', 'no_window');
  END IF;

  RETURN json_build_object(
    'status',      'upcoming',
    'opens_at',    v_reopen_at,
    'window_type', 'matchday'
  );
END;
$function$;

-- ── 8. accept_trade_proposal (replaces 183) ──────────────────────────────────
-- Only change: player-for-player trades are allowed while the market is
-- closed for a pending wishlist draft (window_type 'wishlist'), but not while
-- the draft is actually running ('wishlist_running').

CREATE OR REPLACE FUNCTION public.accept_trade_proposal(p_proposal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_proposal          trade_proposals%ROWTYPE;
  v_target_user_id    UUID;
  v_proposer_user_id  UUID;
  v_proposer_budget   NUMERIC;
  v_target_budget     NUMERIC;
  v_prop_players      TEXT[];
  v_tgt_players       TEXT[];
  v_prop_player_name  TEXT;
  v_tgt_player_name   TEXT;
  v_proposer_username TEXT;
  v_target_username   TEXT;
  v_proposer_position TEXT;
  v_target_position   TEXT;
  v_window_status     JSON;
BEGIN
  SELECT * INTO v_proposal FROM trade_proposals WHERE id = p_proposal_id FOR UPDATE;
  IF v_proposal.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_FOUND');
  END IF;
  IF v_proposal.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_NOT_PENDING');
  END IF;
  IF v_proposal.expires_at < NOW() THEN
    UPDATE trade_proposals SET status = 'expired', resolved_at = NOW() WHERE id = p_proposal_id;
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSAL_EXPIRED');
  END IF;

  SELECT user_id INTO v_target_user_id   FROM squads WHERE id = v_proposal.target_squad_id;
  SELECT user_id INTO v_proposer_user_id FROM squads WHERE id = v_proposal.proposer_squad_id;

  IF v_target_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NOT_TARGET_SQUAD_OWNER');
  END IF;

  SELECT get_transfer_window_status(v_proposal.league_id) INTO v_window_status;
  IF (v_window_status->>'window_type') = 'wishlist_running' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DRAFT_RUNNING');
  END IF;
  IF (v_window_status->>'status') <> 'open' AND (v_window_status->>'window_type') IS DISTINCT FROM 'wishlist' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'WINDOW_CLOSED');
  END IF;

  IF v_proposal.proposer_squad_id < v_proposal.target_squad_id THEN
    SELECT players, budget_remaining INTO v_prop_players, v_proposer_budget FROM squads WHERE id = v_proposal.proposer_squad_id FOR UPDATE;
    SELECT players, budget_remaining INTO v_tgt_players,  v_target_budget   FROM squads WHERE id = v_proposal.target_squad_id   FOR UPDATE;
  ELSE
    SELECT players, budget_remaining INTO v_tgt_players,  v_target_budget   FROM squads WHERE id = v_proposal.target_squad_id   FOR UPDATE;
    SELECT players, budget_remaining INTO v_prop_players, v_proposer_budget FROM squads WHERE id = v_proposal.proposer_squad_id FOR UPDATE;
  END IF;

  IF NOT (v_proposal.proposer_player_id = ANY(v_prop_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;
  IF NOT (v_proposal.target_player_id = ANY(v_tgt_players)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'TARGET_PLAYER_NO_LONGER_IN_SQUAD');
  END IF;

  SELECT position INTO v_proposer_position FROM players WHERE id = v_proposal.proposer_player_id;
  SELECT position INTO v_target_position   FROM players WHERE id = v_proposal.target_player_id;
  IF v_proposer_position IS DISTINCT FROM v_target_position THEN
    RETURN jsonb_build_object('ok', false, 'error', 'POSITION_MISMATCH');
  END IF;

  IF v_proposal.cash_sweetener > 0 AND v_proposer_budget < v_proposal.cash_sweetener THEN
    RETURN jsonb_build_object('ok', false, 'error', 'PROPOSER_INSUFFICIENT_BUDGET');
  END IF;

  UPDATE squads
    SET players          = array_remove(players, v_proposal.proposer_player_id) || ARRAY[v_proposal.target_player_id],
        budget_remaining = budget_remaining - v_proposal.cash_sweetener
    WHERE id = v_proposal.proposer_squad_id;

  UPDATE squads
    SET players          = array_remove(players, v_proposal.target_player_id) || ARRAY[v_proposal.proposer_player_id],
        budget_remaining = budget_remaining + v_proposal.cash_sweetener
    WHERE id = v_proposal.target_squad_id;

  IF v_proposal.points_sweetener > 0 THEN
    UPDATE league_members
      SET total_points = total_points - v_proposal.points_sweetener
      WHERE league_id = v_proposal.league_id AND user_id = v_proposer_user_id;
    UPDATE league_members
      SET total_points = total_points + v_proposal.points_sweetener
      WHERE league_id = v_proposal.league_id AND user_id = v_target_user_id;
  END IF;

  UPDATE trade_proposals SET status = 'accepted', resolved_at = NOW() WHERE id = p_proposal_id;
  UPDATE trade_proposals SET status = 'cancelled', resolved_at = NOW()
    WHERE id <> p_proposal_id AND status = 'pending'
      AND (proposer_player_id IN (v_proposal.proposer_player_id, v_proposal.target_player_id)
        OR target_player_id  IN (v_proposal.proposer_player_id, v_proposal.target_player_id))
      AND (proposer_squad_id IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id)
        OR target_squad_id   IN (v_proposal.proposer_squad_id, v_proposal.target_squad_id));

  INSERT INTO league_notifications (
    league_id, user_id, notification_type, triggered_by_user_id,
    title, description, related_entity_id, related_entity_type
  )
  SELECT v_proposal.league_id, s.user_id, 'trade_accepted', auth.uid(),
    'Trade Accepted',
    (SELECT name FROM players WHERE id = v_proposal.target_player_id) || ' is now in your squad',
    p_proposal_id, 'trade_proposal'
  FROM squads s WHERE s.id = v_proposal.proposer_squad_id;

  SELECT name INTO v_prop_player_name FROM players WHERE id = v_proposal.proposer_player_id;
  SELECT name INTO v_tgt_player_name  FROM players WHERE id = v_proposal.target_player_id;
  SELECT username INTO v_proposer_username FROM users WHERE id = v_proposer_user_id;
  SELECT username INTO v_target_username   FROM users WHERE id = v_target_user_id;

  INSERT INTO gazette_entries (league_id, entry_type, headline, bullets, published_at)
  VALUES (
    v_proposal.league_id,
    'trade_result',
    chr(129309) || ' ' || COALESCE(v_proposer_username, 'Manager')
      || ' ' || chr(8644) || ' ' || COALESCE(v_target_username, 'Manager')
      || ' ' || chr(8212) || ' deal done',
    jsonb_build_array(
      COALESCE(v_proposer_username, 'Manager') || ' sends ' || COALESCE(v_prop_player_name, '?')
        || ' to ' || COALESCE(v_target_username, 'Manager')
        || ' for ' || COALESCE(v_tgt_player_name, '?')
        || CASE WHEN v_proposal.cash_sweetener <> 0
                THEN ' + ' || chr(8364) || ABS(v_proposal.cash_sweetener) || 'M'
                ELSE '' END
        || CASE WHEN v_proposal.points_sweetener > 0
                THEN ' + ' || v_proposal.points_sweetener || 'pts'
                ELSE '' END
    ),
    NOW()
  );

  PERFORM _log_squad_event('trade_accept', v_proposal.league_id, v_proposer_user_id,
    v_proposal.proposer_squad_id, NULL,
    v_proposal.target_player_id, v_proposal.proposer_player_id,
    jsonb_build_object('proposal_id', p_proposal_id,
                       'cash_sweetener', v_proposal.cash_sweetener,
                       'points_sweetener', v_proposal.points_sweetener,
                       'counterparty_user_id', v_target_user_id));

  PERFORM _log_squad_event('trade_accept', v_proposal.league_id, v_target_user_id,
    v_proposal.target_squad_id, NULL,
    v_proposal.proposer_player_id, v_proposal.target_player_id,
    jsonb_build_object('proposal_id', p_proposal_id,
                       'cash_sweetener', -v_proposal.cash_sweetener,
                       'points_sweetener', -v_proposal.points_sweetener,
                       'counterparty_user_id', v_proposer_user_id));

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- ── 9. Cron: run-wishlist-draft every 15 minutes ─────────────────────────────
-- alter_job touches only the schedule — the command (and its bearer, see
-- migration 277) and the active flag are left exactly as they are.
SELECT cron.alter_job(
  job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'run-wishlist-draft'),
  schedule := '*/15 * * * *'
);
