-- Migration 246: award_trophy() helper (ARCH-1a)
--
-- trophy_ledger + get_circle_meta_standings() have existed since migration 189
-- but nothing has ever called award_trophy — the cross-sport meta-standing has
-- been permanently empty. This adds the SECURITY DEFINER helper that sport
-- modules (calculate-scores, score-f1-race, score-tennis-tournament) will call
-- to emit round_win / event_win / season_win trophies (wired in follow-up
-- migrations/PRs, not this one).
--
-- Idempotency: partial unique indexes guard against duplicate awards on
-- rescoring/cron re-runs. Each trophy_type carries its own "which occurrence"
-- key inside meta so a league/user can win the same trophy_type repeatedly
-- across a season without colliding:
--   round_win  -> meta->>'round_key' (e.g. a matchday/round id)
--   event_win  -> meta->>'event_key' (e.g. a single F1 race id; tennis events
--                 are one per tournament, so callers can reuse tournament_id)
--   season_win -> tournament_id alone (a season IS a tournament row)
--
-- award_trophy is written non-fatally (EXCEPTION-wrapped, like the existing
-- _log_squad_event pattern in migration 183) since trophy emission must never
-- block or roll back the scoring transaction that calls it.
--
-- FULLY ADDITIVE: one new function + two new partial unique indexes.
-- Zero changes to any existing table, column, index, policy, or function.

BEGIN;

-- ─── 1. Idempotency indexes ─────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_trophy_ledger_round_win_unique
  ON trophy_ledger (league_id, user_id, tournament_id, (meta ->> 'round_key'))
  WHERE trophy_type = 'round_win';

CREATE UNIQUE INDEX IF NOT EXISTS idx_trophy_ledger_event_win_unique
  ON trophy_ledger (league_id, user_id, tournament_id, (meta ->> 'event_key'))
  WHERE trophy_type = 'event_win';

CREATE UNIQUE INDEX IF NOT EXISTS idx_trophy_ledger_season_win_unique
  ON trophy_ledger (league_id, user_id, tournament_id)
  WHERE trophy_type = 'season_win';

-- ─── 2. award_trophy(...) ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION award_trophy(
  p_circle_id     uuid,
  p_league_id     uuid,
  p_user_id       uuid,
  p_sport_id      uuid,
  p_tournament_id uuid,
  p_trophy_type   text,
  p_tier          text,
  p_meta          jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO trophy_ledger (circle_id, league_id, user_id, sport_id, tournament_id, trophy_type, tier, meta)
  VALUES (p_circle_id, p_league_id, p_user_id, p_sport_id, p_tournament_id, p_trophy_type, p_tier, p_meta)
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;  -- non-fatal: trophy emission failure must never block scoring
END;
$$;

-- Internal helper — called from other SECURITY DEFINER scoring RPCs / edge
-- functions running as service_role only, never exposed to clients directly.
GRANT EXECUTE ON FUNCTION award_trophy(uuid, uuid, uuid, uuid, uuid, text, text, jsonb) TO service_role;

COMMIT;
