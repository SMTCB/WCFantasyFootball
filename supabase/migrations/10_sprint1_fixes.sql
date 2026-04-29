-- Migration 10: Sprint 1 bug fixes
-- 1. Fix daily_jokers + player_match_stats player_id type (TEXT, not UUID)
-- 2. Add budget_remaining to squads
-- 3. Fix fantasy_points — add matchday_id, replace (squad_id,player_id) constraint
-- 4. Add season_avg to players
-- 5. Cron for calculate-scores (every 2 min)

-- ─── 1. Recreate daily_jokers with correct TEXT player_id ─────────────────────
DROP TABLE IF EXISTS daily_jokers;

CREATE TABLE daily_jokers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  league_id     UUID        NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  player_id     TEXT        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  joker_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  points_earned NUMERIC(6,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, league_id, joker_date)
);
ALTER TABLE daily_jokers DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_daily_jokers_user_date
  ON daily_jokers(user_id, joker_date);

-- ─── 2. Recreate player_match_stats with correct TEXT player_id ───────────────
DROP TABLE IF EXISTS player_match_stats;

CREATE TABLE player_match_stats (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id     TEXT         NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  player_id      TEXT         NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  minutes_played INT          NOT NULL DEFAULT 0,
  goals          INT          NOT NULL DEFAULT 0,
  assists        INT          NOT NULL DEFAULT 0,
  own_goals      INT          NOT NULL DEFAULT 0,
  yellow_cards   INT          NOT NULL DEFAULT 0,
  red_cards      INT          NOT NULL DEFAULT 0,
  penalty_saved  INT          NOT NULL DEFAULT 0,
  penalty_missed INT          NOT NULL DEFAULT 0,
  clean_sheet    BOOLEAN      NOT NULL DEFAULT FALSE,
  tackles_won    INT          NOT NULL DEFAULT 0,
  interceptions  INT          NOT NULL DEFAULT 0,
  bps_score      NUMERIC(8,2) DEFAULT 0,
  bonus_points   INT          NOT NULL DEFAULT 0,
  fantasy_points NUMERIC(6,2) DEFAULT 0,
  breakdown      JSONB,
  created_at     TIMESTAMPTZ  DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE(fixture_id, player_id)
);
ALTER TABLE player_match_stats DISABLE ROW LEVEL SECURITY;

CREATE INDEX idx_player_match_stats_fixture
  ON player_match_stats(fixture_id);

-- ─── 3. Add budget_remaining to squads ───────────────────────────────────────
ALTER TABLE squads
  ADD COLUMN IF NOT EXISTS budget_remaining DECIMAL(6,1) DEFAULT 100;

-- ─── 4. Fix fantasy_points ───────────────────────────────────────────────────
-- Add matchday_id column (calculate-scores groups points by matchday, not player)
ALTER TABLE fantasy_points
  ADD COLUMN IF NOT EXISTS matchday_id TEXT;

-- Drop per-player uniqueness; scoring engine aggregates at squad+matchday level
ALTER TABLE fantasy_points
  DROP CONSTRAINT IF EXISTS fantasy_points_squad_id_player_id_key;

-- Add correct constraint (idempotent — skip if already exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fantasy_points_squad_matchday_key'
  ) THEN
    ALTER TABLE fantasy_points
      ADD CONSTRAINT fantasy_points_squad_matchday_key
      UNIQUE (squad_id, matchday_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fantasy_points_squad_matchday
  ON fantasy_points(squad_id, matchday_id);

-- ─── 5. Add season_avg to players ─────────────────────────────────────────────
-- Used by LiveScreen projection engine (projections.js) for personalised estimates.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS season_avg DECIMAL(5,2);

-- ─── 6. Cron: trigger calculate-scores every 2 minutes ───────────────────────
-- Only fires when at least one fixture is currently live, avoiding needless calls.
-- Passes each live fixture_id individually so the function can process them all.
SELECT cron.schedule(
  'calculate-scores-live',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.supabase_url') || '/functions/v1/calculate-scores',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body    := json_build_object('fixture_id', f.id)::text
  )
  FROM fixtures f
  WHERE f.status = 'live';
  $$
);
