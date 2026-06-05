-- Migration 143: Matchday Joker redesign
--
-- New rules:
--   1. The joker must always be a player OUTSIDE the manager's 15-man squad.
--      A DB-level trigger rejects any insert/update that would set a joker to
--      a player the manager already owns in that league.
--
--   2. Each player can only be used as the joker once per season per league
--      (prevents a manager from picking the same star player every matchday).
--      Enforced by a new UNIQUE index on (user_id, league_id, player_id).
--
--   3. "One joker per matchday" is already enforced by the existing
--      daily_jokers_user_league_matchday_uq index on (user_id, league_id, matchday_id)
--      WHERE matchday_id IS NOT NULL. This is matchday-scoped, not day-scoped,
--      so a 4-day WC matchday = one joker for the whole block. ✓ No change needed.
--
-- Scoring change (calculate-scores edge function, not this migration):
--   The joker scores their real fantasy points (×1), added as a bonus on top
--   of the manager's XI total. No multiplier. The ×2 multiplier introduced in
--   PR #375 is removed.

-- ── 1. UNIQUE index: once per player per season per league ────────────────────
-- drop if exists first (idempotent re-run)
DROP INDEX IF EXISTS daily_jokers_user_league_player_uq;

CREATE UNIQUE INDEX daily_jokers_user_league_player_uq
  ON daily_jokers (user_id, league_id, player_id);

-- ── 2. Trigger: joker must be outside the manager's squad ─────────────────────
CREATE OR REPLACE FUNCTION guard_daily_joker_external_player()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Check if the chosen joker player is already in the manager's squad
  -- for this league (any squad row — covers multiple-round squads).
  IF EXISTS (
    SELECT 1 FROM squads s
    WHERE s.user_id   = NEW.user_id
      AND s.league_id = NEW.league_id
      AND s.players   @> ARRAY[NEW.player_id]::text[]
  ) THEN
    RAISE EXCEPTION 'JOKER_OWN_SQUAD'
      USING DETAIL = 'The Matchday Joker must be a player outside your 15-man squad.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_daily_joker_external_player ON daily_jokers;
CREATE TRIGGER trg_guard_daily_joker_external_player
  BEFORE INSERT OR UPDATE ON daily_jokers
  FOR EACH ROW EXECUTE FUNCTION guard_daily_joker_external_player();
