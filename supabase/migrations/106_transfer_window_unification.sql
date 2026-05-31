-- Migration 106: Transfer window unification — Phase A
-- Session 62 — Gameplay Engine.
--
-- Changes:
--   1. squads: add round_transfers JSONB counter
--   2. enforce_transfer_window: early-exit for tournament leagues
--   3. league_config: seed transfers_per_round / transfer_reopen_hours /
--      transfer_wildcard_round for all existing leagues
--   4. get_transfer_window_status: read transfer_reopen_hours from config
--   5. get_club_cap: read tier thresholds from league_config (config-driven)
--   6. execute_transfer_atomic: add transfer-limit enforcement
--      (new params p_league_id, p_matchday_id — backward-compatible)
--   7. create_league: seed all config keys for new leagues at creation time

-- ── 1. squads: round_transfers counter ───────────────────────────────────────
-- Tracks how many transfers a manager has used in each round.
-- Shape: { "429-r2": 2, "429-r3": 0, ... }
-- Reset is implicit: a new matchday gets a new key (absent = 0 transfers used).

ALTER TABLE squads
  ADD COLUMN IF NOT EXISTS round_transfers JSONB NOT NULL DEFAULT '{}';

-- ── 2. enforce_transfer_window: skip tournament leagues ──────────────────────
-- Tournament leagues are deadline-controlled via matchday_deadlines, not the
-- transfer_windows table.  Without this guard every INSERT into transfers for
-- a tournament league raises 'transfer_window_closed' (no row in transfer_windows).

CREATE OR REPLACE FUNCTION enforce_transfer_window()
RETURNS TRIGGER AS $$
DECLARE
  win transfer_windows;
BEGIN
  -- Tournament leagues use matchday_deadlines, not transfer_windows — skip.
  IF EXISTS (
    SELECT 1 FROM leagues WHERE id = NEW.league_id AND tournament_id IS NOT NULL
  ) THEN
    RETURN NEW;
  END IF;

  -- Lock the window row to prevent concurrent decrement races (migration 45).
  SELECT * INTO win
  FROM   transfer_windows
  WHERE  league_id = NEW.league_id
    AND  opens_at  <= NOW()
    AND  closes_at  > NOW()
  ORDER  BY opens_at DESC
  LIMIT  1
  FOR UPDATE;

  IF win IS NULL THEN
    RAISE EXCEPTION 'transfer_window_closed'
      USING DETAIL = 'No transfer window is currently open for this league.';
  END IF;

  IF win.transfers_remaining IS NOT NULL THEN
    IF win.transfers_remaining <= 0 THEN
      RAISE EXCEPTION 'transfer_limit_reached'
        USING DETAIL = 'You have used all transfers for this window.';
    END IF;
    UPDATE transfer_windows
    SET    transfers_remaining = transfers_remaining - 1
    WHERE  id = win.id;
  END IF;

  IF NEW.round_number IS NULL THEN
    NEW.round_number := win.round_number;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. Seed new league_config keys for all existing leagues ──────────────────
-- ON CONFLICT DO NOTHING so re-runs are safe.

INSERT INTO league_config (league_id, config_key, config_value)
SELECT l.id, cfg.config_key, cfg.config_value
FROM leagues l
CROSS JOIN (
  VALUES
    ('transfers_per_round',     '3'::jsonb),
    ('transfer_reopen_hours',   '6'::jsonb),
    ('transfer_wildcard_round', 'null'::jsonb)
) AS cfg(config_key, config_value)
ON CONFLICT (league_id, config_key) DO NOTHING;

-- ── 4. get_transfer_window_status: config-driven reopen hours ────────────────
-- Replaces the hardcoded INTERVAL '6 hours' with the per-league config value.

CREATE OR REPLACE FUNCTION public.get_transfer_window_status(p_league_id uuid)
RETURNS json LANGUAGE plpgsql STABLE AS $$
DECLARE
  win              transfer_windows;
  v_tournament_id  text;
  v_prev_deadline  timestamptz;
  v_next_deadline  timestamptz;
  v_reopen_at      timestamptz;
  v_reopen_hours   int := 6;
BEGIN
  -- Read per-league reopen hours (falls back to 6 if not set)
  SELECT (config_value #>> '{}')::int
    INTO v_reopen_hours
    FROM league_config
   WHERE league_id = p_league_id
     AND config_key = 'transfer_reopen_hours';
  IF v_reopen_hours IS NULL THEN v_reopen_hours := 6; END IF;

  -- 1. Active transfer_windows row (EPL / manual-window leagues)
  win := get_active_transfer_window(p_league_id);
  IF win IS NOT NULL THEN
    RETURN json_build_object(
      'status',              'open',
      'closes_at',           win.closes_at,
      'transfers_remaining', win.transfers_remaining,
      'window_type',         win.window_type
    );
  END IF;

  -- 2. Future transfer_windows row
  SELECT * INTO win
  FROM   transfer_windows
  WHERE  league_id = p_league_id AND opens_at > NOW()
  ORDER  BY opens_at ASC LIMIT 1;

  IF win IS NOT NULL THEN
    RETURN json_build_object(
      'status',      'upcoming',
      'opens_at',    win.opens_at,
      'window_type', win.window_type
    );
  END IF;

  -- 3. Matchday-deadline path (WC / tournament leagues)
  SELECT l.tournament_id INTO v_tournament_id
  FROM   leagues l WHERE l.id = p_league_id;

  IF v_tournament_id IS NOT NULL THEN
    SELECT deadline_at INTO v_prev_deadline
    FROM   matchday_deadlines
    WHERE  tournament_id = v_tournament_id AND deadline_at <= NOW()
    ORDER  BY deadline_at DESC LIMIT 1;

    SELECT deadline_at INTO v_next_deadline
    FROM   matchday_deadlines
    WHERE  tournament_id = v_tournament_id AND deadline_at > NOW()
    ORDER  BY deadline_at ASC LIMIT 1;

    -- Within N hours after a deadline: window is closed (recovery window)
    IF v_prev_deadline IS NOT NULL
       AND NOW() < v_prev_deadline + (v_reopen_hours || ' hours')::interval
       AND v_next_deadline IS NOT NULL
    THEN
      v_reopen_at := v_prev_deadline + (v_reopen_hours || ' hours')::interval;
      RETURN json_build_object(
        'status',      'upcoming',
        'opens_at',    v_reopen_at,
        'window_type', 'matchday'
      );
    END IF;

    IF v_next_deadline IS NOT NULL THEN
      RETURN json_build_object(
        'status',              'open',
        'closes_at',           v_next_deadline,
        'transfers_remaining', NULL,
        'window_type',         'matchday'
      );
    END IF;
  END IF;

  RETURN json_build_object('status', 'no_window');
END;
$$;

-- ── 5. get_club_cap: config-driven tier thresholds ───────────────────────────
-- Migration 104 hardcoded the tier thresholds.  This version reads them from
-- league_config so commissioners can adjust per-league without a code change.

CREATE OR REPLACE FUNCTION get_club_cap(p_league_id UUID)
RETURNS INT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_active_count   INT;
  v_default_cap    INT := 3;
  v_t1_threshold   INT := 8;
  v_t1_value       INT := 4;
  v_t2_threshold   INT := 4;
  v_t2_value       INT := 5;
  v_t3_threshold   INT := 2;
BEGIN
  -- Read config overrides; fall back to hardcoded defaults if keys are absent
  SELECT (config_value #>> '{}')::int INTO v_default_cap    FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_default';
  SELECT (config_value #>> '{}')::int INTO v_t1_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier1_threshold';
  SELECT (config_value #>> '{}')::int INTO v_t1_value       FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier1_value';
  SELECT (config_value #>> '{}')::int INTO v_t2_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier2_threshold';
  SELECT (config_value #>> '{}')::int INTO v_t2_value       FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier2_value';
  SELECT (config_value #>> '{}')::int INTO v_t3_threshold   FROM league_config WHERE league_id = p_league_id AND config_key = 'club_cap_tier3_threshold';

  IF v_default_cap  IS NULL THEN v_default_cap  := 3; END IF;
  IF v_t1_threshold IS NULL THEN v_t1_threshold := 8; END IF;
  IF v_t1_value     IS NULL THEN v_t1_value     := 4; END IF;
  IF v_t2_threshold IS NULL THEN v_t2_threshold := 4; END IF;
  IF v_t2_value     IS NULL THEN v_t2_value     := 5; END IF;
  IF v_t3_threshold IS NULL THEN v_t3_threshold := 2; END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM cup_active_clubs
   WHERE league_id = p_league_id
     AND eliminated_at IS NULL;

  IF v_active_count = 0 THEN
    RETURN v_default_cap;                          -- no cup data: safe default
  ELSIF v_active_count > v_t1_threshold THEN
    RETURN v_default_cap;                          -- early rounds
  ELSIF v_active_count > v_t2_threshold THEN
    RETURN v_t1_value;                             -- quarter-final stage
  ELSIF v_active_count > v_t3_threshold THEN
    RETURN v_t2_value;                             -- semi-final stage
  ELSE
    RETURN NULL;                                   -- final: no cap
  END IF;
END;
$$;

-- ── 6. execute_transfer_atomic: transfer-limit enforcement ───────────────────
-- Two new optional params (p_league_id, p_matchday_id) enable per-round limit
-- checking.  Existing callers that omit them are unaffected (both DEFAULT NULL).
--
-- Enforcement flow:
--   a. Read transfers_per_round and transfer_wildcard_round from league_config
--   b. If current round == wildcard_round → unlimited, skip limit
--   c. Read round_transfers[p_matchday_id] from the locked squad row
--   d. If used >= limit → reject with TRANSFER_LIMIT_REACHED
--   e. On success → increment counter atomically

CREATE OR REPLACE FUNCTION execute_transfer_atomic(
  p_squad_id    uuid,
  p_action      text,
  p_player_id   uuid,
  p_price       numeric,
  p_pos_limit   int  DEFAULT 99,
  p_squad_max   int  DEFAULT 15,
  p_club_max    int  DEFAULT 99,
  p_league_id   uuid DEFAULT NULL,
  p_matchday_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_squad               squads;
  v_new_players         uuid[];
  v_new_budget          numeric;
  v_new_round_transfers jsonb;
  v_player_pos          text;
  v_player_team         text;
  v_pos_count           int;
  v_club_count          int;
  v_transfers_per_round int  := 3;
  v_wildcard_round      int  := NULL;
  v_used_transfers      int  := 0;
  v_matchday_round      int;
  v_enforce_limit       bool := false;
BEGIN
  SELECT * INTO v_squad FROM squads WHERE id = p_squad_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Squad not found');
  END IF;

  -- ── Transfer limit enforcement ───────────────────────────────────────────
  IF p_league_id IS NOT NULL AND p_matchday_id IS NOT NULL THEN
    SELECT (config_value #>> '{}')::int INTO v_transfers_per_round
      FROM league_config
     WHERE league_id = p_league_id AND config_key = 'transfers_per_round';
    IF v_transfers_per_round IS NULL THEN v_transfers_per_round := 3; END IF;

    SELECT (config_value #>> '{}')::int INTO v_wildcard_round
      FROM league_config
     WHERE league_id = p_league_id AND config_key = 'transfer_wildcard_round';
    -- v_wildcard_round remains NULL when config value is JSON null

    -- Extract round number from matchday_id e.g. '429-r2' → 2
    v_matchday_round := (regexp_match(p_matchday_id, '-r(\d+)$'))[1]::int;

    -- Enforce unless this is the wildcard round
    IF v_wildcard_round IS NULL OR v_matchday_round IS DISTINCT FROM v_wildcard_round THEN
      v_enforce_limit  := true;
      v_used_transfers := COALESCE(
        (v_squad.round_transfers ->> p_matchday_id)::int, 0
      );
      IF v_used_transfers >= v_transfers_per_round THEN
        RETURN jsonb_build_object(
          'ok',    false,
          'code',  'TRANSFER_LIMIT_REACHED',
          'error', 'Transfer limit reached — ' || v_transfers_per_round ||
                   ' transfers allowed per round'
        );
      END IF;
    END IF;
  END IF;

  -- ── Buy ──────────────────────────────────────────────────────────────────
  IF p_action = 'buy' THEN
    IF v_squad.players @> ARRAY[p_player_id] THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OWNED',
                                'error', 'You already own this player');
    END IF;

    IF array_length(v_squad.players, 1) >= p_squad_max THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SQUAD_FULL',
                                'error', 'Squad is full — sell a player first');
    END IF;

    IF v_squad.budget_remaining < p_price THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BUDGET',
                                'error', 'Insufficient budget');
    END IF;

    IF p_pos_limit < 99 THEN
      SELECT p.position INTO v_player_pos FROM players p WHERE p.id = p_player_id;
      SELECT COUNT(*) INTO v_pos_count
        FROM players p
        WHERE p.id = ANY(v_squad.players) AND p.position = v_player_pos;
      IF v_pos_count >= p_pos_limit THEN
        RETURN jsonb_build_object('ok', false, 'code', 'POSITION_LIMIT',
          'error', 'Maximum ' || v_player_pos || ' players reached (' || p_pos_limit || ')');
      END IF;
    END IF;

    IF p_club_max < 99 THEN
      SELECT p.forza_team_id INTO v_player_team FROM players p WHERE p.id = p_player_id;
      IF v_player_team IS NOT NULL THEN
        SELECT COUNT(*) INTO v_club_count
          FROM players p
          WHERE p.id = ANY(v_squad.players)
            AND p.forza_team_id = v_player_team;
        IF v_club_count >= p_club_max THEN
          RETURN jsonb_build_object('ok', false, 'code', 'CLUB_LIMIT',
            'error', 'Maximum ' || p_club_max || ' players from the same club');
        END IF;
      END IF;
    END IF;

    v_new_players := array_append(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining - p_price)::numeric, 1);

  -- ── Sell ─────────────────────────────────────────────────────────────────
  ELSIF p_action = 'sell' THEN
    IF NOT (v_squad.players @> ARRAY[p_player_id]) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Player not in your squad');
    END IF;
    v_new_players := array_remove(v_squad.players, p_player_id);
    v_new_budget  := round((v_squad.budget_remaining + p_price)::numeric, 1);

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown action');
  END IF;

  -- ── Increment round_transfers counter ────────────────────────────────────
  IF v_enforce_limit THEN
    v_new_round_transfers := jsonb_set(
      COALESCE(v_squad.round_transfers, '{}'::jsonb),
      ARRAY[p_matchday_id],
      to_jsonb(v_used_transfers + 1)
    );
  ELSE
    v_new_round_transfers := COALESCE(v_squad.round_transfers, '{}'::jsonb);
  END IF;

  UPDATE squads
    SET players          = v_new_players,
        budget_remaining = v_new_budget,
        round_transfers  = v_new_round_transfers
  WHERE id = p_squad_id;

  RETURN jsonb_build_object(
    'ok',               true,
    'players',          to_jsonb(v_new_players),
    'budget_remaining', v_new_budget
  );
END;
$$;

GRANT EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, uuid, numeric, int, int, int, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION execute_transfer_atomic(uuid, text, uuid, numeric, int, int, int, uuid, text) TO authenticated;

-- ── 7. create_league: seed config keys for new leagues ───────────────────────
-- Seeds all league_config defaults at creation time so no league ever starts
-- with missing config keys.  wildcard_round is null for all current league
-- types (WC / tournament); commissioners can override via league_config UPDATE.

CREATE OR REPLACE FUNCTION create_league(
  p_name          TEXT,
  p_format        TEXT,
  p_user_id       UUID,
  p_tournament_id TEXT DEFAULT '426'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_league    leagues%ROWTYPE;
  v_join_code TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tournaments WHERE forza_id = p_tournament_id) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND: tournament % does not exist', p_tournament_id;
  END IF;

  v_join_code := upper(substring(md5(random()::text) for 6));

  INSERT INTO leagues (name, format, tournament_id, created_by, join_code)
  VALUES (
    p_name,
    p_format::league_format,
    p_tournament_id,
    p_user_id,
    v_join_code
  )
  RETURNING * INTO v_league;

  INSERT INTO league_members (league_id, user_id, role)
  VALUES (v_league.id, p_user_id, 'commissioner')
  ON CONFLICT (league_id, user_id) DO NOTHING;

  -- Seed all league_config defaults for this new league
  INSERT INTO league_config (league_id, config_key, config_value)
  VALUES
    (v_league.id, 'transfers_per_round',     '3'::jsonb),
    (v_league.id, 'transfer_reopen_hours',   '6'::jsonb),
    (v_league.id, 'transfer_wildcard_round', 'null'::jsonb),
    (v_league.id, 'club_cap_default',        '3'::jsonb),
    (v_league.id, 'club_cap_tier1_threshold', '8'::jsonb),
    (v_league.id, 'club_cap_tier1_value',     '4'::jsonb),
    (v_league.id, 'club_cap_tier2_threshold', '4'::jsonb),
    (v_league.id, 'club_cap_tier2_value',     '5'::jsonb),
    (v_league.id, 'club_cap_tier3_threshold', '2'::jsonb),
    (v_league.id, 'club_cap_tier3_value',     'null'::jsonb)
  ON CONFLICT (league_id, config_key) DO NOTHING;

  RETURN row_to_json(v_league);
END;
$$;
