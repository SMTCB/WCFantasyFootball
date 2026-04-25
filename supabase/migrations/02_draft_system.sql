-- Draft System (S1)
-- All tables are per-league scoped. No cross-league data.

-- 1. New enums
DO $$ BEGIN
  CREATE TYPE draft_status AS ENUM ('pending', 'processed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE transfer_window_type AS ENUM ('standard', 'unlimited', 'cup_group', 'cup_elimination');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE gazette_entry_type AS ENUM ('draft_report', 'breaking_news', 'activity', 'auction_result');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE cup_phase AS ENUM (
    'pre_cup', 'group_stage', 'pre_elimination',
    'round_of_16', 'quarter_final', 'semi_final', 'final'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Add cup_phase to leagues
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS cup_phase cup_phase DEFAULT 'pre_cup';
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS draft_deadline TIMESTAMPTZ;

-- 3. Draft submissions: manager's ranked preference list
CREATE TABLE IF NOT EXISTS draft_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  player_ids TEXT[] DEFAULT '{}',   -- ordered, index 0 = highest priority
  submitted_at TIMESTAMPTZ,
  status draft_status DEFAULT 'pending',
  UNIQUE(league_id, user_id)
);

-- 4. Draft allocations: final squad per manager after lottery
CREATE TABLE IF NOT EXISTS draft_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  allocated_players TEXT[] DEFAULT '{}',
  unresolved_slots INT DEFAULT 0,
  allocated_at TIMESTAMPTZ,
  UNIQUE(league_id, user_id)
);

-- 5. Transfer windows: controls when transfers are open
CREATE TABLE IF NOT EXISTS transfer_windows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  window_type transfer_window_type NOT NULL DEFAULT 'standard',
  transfers_remaining INT,          -- NULL = unlimited
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Transfers: log of every player in/out per manager per round
CREATE TABLE IF NOT EXISTS transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  round_number INT NOT NULL,
  player_out TEXT REFERENCES players(id),
  player_in TEXT REFERENCES players(id),
  transferred_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Cup active clubs: pool shrinks as teams are eliminated
CREATE TABLE IF NOT EXISTS cup_active_clubs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  club_id TEXT NOT NULL,
  eliminated_at TIMESTAMPTZ,        -- NULL = still active
  UNIQUE(league_id, club_id)
);

-- 8. League config: all tunable parameters, readable at runtime
CREATE TABLE IF NOT EXISTS league_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  config_key VARCHAR NOT NULL,
  config_value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, config_key)
);

-- 9. Gazette entries: draft reports, breaking news, auction results
CREATE TABLE IF NOT EXISTS gazette_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  entry_type gazette_entry_type NOT NULL DEFAULT 'activity',
  headline TEXT,
  bullets JSONB,                    -- array of story strings
  full_data JSONB,                  -- collapsible full allocation table
  published_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Disable RLS for alpha (consistent with existing schema policy)
ALTER TABLE draft_submissions DISABLE ROW LEVEL SECURITY;
ALTER TABLE draft_allocations DISABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_windows DISABLE ROW LEVEL SECURITY;
ALTER TABLE transfers DISABLE ROW LEVEL SECURITY;
ALTER TABLE cup_active_clubs DISABLE ROW LEVEL SECURITY;
ALTER TABLE league_config DISABLE ROW LEVEL SECURITY;
ALTER TABLE gazette_entries DISABLE ROW LEVEL SECURITY;

-- 11. Seed default league_config for existing leagues
-- (new leagues should call this insert block on creation)
INSERT INTO league_config (league_id, config_key, config_value)
SELECT l.id, cfg.config_key, cfg.config_value
FROM leagues l
CROSS JOIN (VALUES
  ('draft_list_size',           '30'::jsonb),
  ('draft_auto_complete_ratio', '{"GK":4,"DEF":10,"MID":10,"FWD":6}'::jsonb),
  ('transfer_limit_per_round',  '5'::jsonb),
  ('cup_transfer_limit',        '3'::jsonb),
  ('swap_window_hours',         '48'::jsonb),
  ('relaxation_base',           '0.6'::jsonb),
  ('relaxation_scale',          '40'::jsonb),
  ('relaxation_tier2_mult',     '1.4'::jsonb),
  ('relaxation_tier3_mult',     '1.8'::jsonb),
  ('relaxation_repeats',        '[0,1,3,null]'::jsonb)
) AS cfg(config_key, config_value)
ON CONFLICT (league_id, config_key) DO NOTHING;
