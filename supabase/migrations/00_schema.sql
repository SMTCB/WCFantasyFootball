-- 0. Enable extensions used by later migrations' cron/http calls.
-- On hosted Supabase these are pre-enabled by the platform outside migration
-- history, so no earlier migration ever created them explicitly — a fresh
-- local rebuild (db reset) has neither, and every cron.schedule()/net.http_post()
-- call from migration 03 onward fails with "schema does not exist" without this.
-- IF NOT EXISTS makes this a no-op anywhere they're already enabled (prod/main).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 1. Create Enums if missing
DO $$ BEGIN CREATE TYPE league_format AS ENUM ('classic', 'auction', 'noduplicate', 'hybrid'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE match_status AS ENUM ('scheduled', 'live', 'finished'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE event_type AS ENUM ('goal', 'yellow', 'red', 'sub', 'var'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE bid_status AS ENUM ('pending', 'won', 'lost'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE player_status_type AS ENUM ('fit', 'doubt', 'out', 'returning'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Create tables if missing
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  xp INTEGER DEFAULT 0,
  badges TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  format league_format NOT NULL DEFAULT 'classic',
  max_members INTEGER DEFAULT 10,
  tournament_id TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS league_members (
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  rank INTEGER DEFAULT 1,
  total_points INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (league_id, user_id)
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  nationality TEXT,
  club TEXT,
  price DECIMAL(4,1),
  photo_url TEXT
);

CREATE TABLE IF NOT EXISTS squads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  matchday_id TEXT NOT NULL,
  players TEXT[] DEFAULT '{}',
  captain_id TEXT REFERENCES players(id),
  joker_player_id TEXT REFERENCES players(id),
  is_wildcard BOOLEAN DEFAULT FALSE,
  is_triple_captain BOOLEAN DEFAULT FALSE,
  locked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, user_id, matchday_id)
);

CREATE TABLE IF NOT EXISTS fixtures (
  id TEXT PRIMARY KEY,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  kickoff_at TIMESTAMPTZ NOT NULL,
  competition TEXT NOT NULL,
  status match_status DEFAULT 'scheduled',
  minute TEXT
);

CREATE TABLE IF NOT EXISTS match_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id TEXT REFERENCES fixtures(id) ON DELETE CASCADE,
  type event_type NOT NULL,
  player_id TEXT REFERENCES players(id),
  minute TEXT NOT NULL,
  team TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fantasy_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id UUID REFERENCES squads(id) ON DELETE CASCADE,
  player_id TEXT REFERENCES players(id),
  points_breakdown JSONB DEFAULT '{}'::jsonb,
  total INTEGER DEFAULT 0,
  UNIQUE(squad_id, player_id)
);

-- Top Scorer Predictions (Feature 07)
CREATE TABLE IF NOT EXISTS top_scorer_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  matchday_id TEXT NOT NULL,
  predicted_player_id TEXT REFERENCES players(id),
  actual_top_scorer_id TEXT REFERENCES players(id),
  is_correct BOOLEAN DEFAULT NULL,
  points_awarded INTEGER DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, matchday_id)
);

-- Player Intelligence (Feature 01 - Danger Zone)
CREATE TABLE IF NOT EXISTS player_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
  status player_status_type DEFAULT 'fit',
  confidence INTEGER DEFAULT 100,
  reason TEXT,
  return_date DATE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(player_id)
);

-- Matchday Recap (Feature 02)
CREATE TABLE IF NOT EXISTS matchday_recaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  matchday_id TEXT NOT NULL,
  final_rank INTEGER,
  final_points INTEGER,
  rank_change INTEGER,
  best_player_id TEXT REFERENCES players(id),
  captain_id TEXT REFERENCES players(id),
  joker_player_id TEXT REFERENCES players(id),
  transfers_made INTEGER DEFAULT 0,
  image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, league_id, matchday_id)
);

-- Head-to-Head Records (Feature 05)
CREATE TABLE IF NOT EXISTS h2h_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  user_a_id UUID REFERENCES users(id) ON DELETE CASCADE,
  user_b_id UUID REFERENCES users(id) ON DELETE CASCADE,
  matchday_id TEXT NOT NULL,
  user_a_points INTEGER,
  user_b_points INTEGER,
  winner_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Projection Snapshots (Feature 03)
CREATE TABLE IF NOT EXISTS projection_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  league_id UUID REFERENCES leagues(id) ON DELETE CASCADE,
  matchday_id TEXT NOT NULL,
  projected_points INTEGER,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Turn off RLS globally for the Alpha
ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE fixtures DISABLE ROW LEVEL SECURITY;
ALTER TABLE match_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE league_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE squads DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE leagues DISABLE ROW LEVEL SECURITY;
ALTER TABLE fantasy_points DISABLE ROW LEVEL SECURITY;
ALTER TABLE top_scorer_predictions DISABLE ROW LEVEL SECURITY;
ALTER TABLE player_status DISABLE ROW LEVEL SECURITY;
ALTER TABLE matchday_recaps DISABLE ROW LEVEL SECURITY;
ALTER TABLE h2h_records DISABLE ROW LEVEL SECURITY;
ALTER TABLE projection_snapshots DISABLE ROW LEVEL SECURITY;


-- 4. Drop constraints for mock user insertion
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_id_fkey;
