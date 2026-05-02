-- Migration 16: Forza API Integration — Tournament-Agnostic Schema
-- Adds the tournament registry, teams table, and Forza ID columns to existing
-- tables. All new columns are nullable so existing mock data is unaffected.
-- sync_enabled = false on all seeded rows — nothing runs until deliberately activated.

-- ─── tournaments ──────────────────────────────────────────────────────────────
-- Central registry. One row per competition. THE PLUG is sync_enabled.
-- To activate EPL dry run:  UPDATE tournaments SET sync_enabled = true WHERE forza_id = '426';
-- To activate World Cup:    INSERT + UPDATE when forza_id is confirmed with provider.

create table if not exists tournaments (
  id              uuid        primary key default gen_random_uuid(),
  forza_id        text        unique not null,         -- Forza tournament ID ('426', TBD for WC)
  name            text        not null,                -- 'Premier League 2025-26'
  slug            text        unique not null,         -- 'epl-2526', 'wc2026'
  environment     text        not null default 'dry_run',  -- 'dry_run' | 'production'
  sync_enabled    boolean     not null default false,  -- THE PLUG — must be true for any sync to run
  status          text        not null default 'upcoming', -- 'upcoming' | 'active' | 'completed'
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz default now()
);
alter table tournaments disable row level security;

-- EPL 2025-26 — dry run environment, plug OFF until ready
insert into tournaments (forza_id, name, slug, environment, sync_enabled, status, starts_at, ends_at)
values ('426', 'Premier League 2025-26', 'epl-2526', 'dry_run', false, 'active',
        '2025-08-17T00:00:00Z', '2026-05-24T23:59:59Z')
on conflict (forza_id) do nothing;

-- World Cup 2026 — production row, forza_id TBD (confirm with provider)
-- Uncomment and update forza_id when provider confirms it:
-- insert into tournaments (forza_id, name, slug, environment, sync_enabled, status, starts_at, ends_at)
-- values ('TBD', 'FIFA World Cup 2026', 'wc2026', 'production', false, 'upcoming',
--         '2026-06-08T00:00:00Z', '2026-07-15T23:59:59Z')
-- on conflict (forza_id) do nothing;


-- ─── teams ────────────────────────────────────────────────────────────────────
-- Maps Forza team IDs to display data. Populated by sync-players.

create table if not exists teams (
  id              uuid  primary key default gen_random_uuid(),
  forza_team_id   text  unique not null,
  tournament_id   text  references tournaments(forza_id) on delete cascade,
  name            text  not null,
  abbreviation    text,
  region          text,
  main_color      jsonb,           -- [R, G, B] from Forza v3 lineups
  created_at      timestamptz default now()
);
alter table teams disable row level security;
create index if not exists idx_teams_tournament on teams(tournament_id);


-- ─── fixtures — add Forza context ─────────────────────────────────────────────
alter table fixtures
  add column if not exists forza_match_id       text,
  add column if not exists tournament_id        text references tournaments(forza_id),
  add column if not exists round_number         integer,       -- Forza 'round' field
  add column if not exists home_team_forza_id   text,
  add column if not exists away_team_forza_id   text,
  add column if not exists scores               jsonb,         -- {home: N, away: N} at full time
  add column if not exists status_detail        text;          -- e.g. 'first_half', 'halftime_pause'

create unique index if not exists fixtures_forza_match_id_idx
  on fixtures(forza_match_id) where forza_match_id is not null;

create index if not exists idx_fixtures_tournament_round
  on fixtures(tournament_id, round_number);


-- ─── players — add Forza context ──────────────────────────────────────────────
alter table players
  add column if not exists forza_player_id  text,
  add column if not exists forza_team_id    text references teams(forza_team_id),
  add column if not exists tournament_id    text references tournaments(forza_id),
  add column if not exists birthdate        date,
  add column if not exists height           integer;   -- cm

create unique index if not exists players_forza_player_id_idx
  on players(forza_player_id) where forza_player_id is not null;

create index if not exists idx_players_tournament on players(tournament_id);
create index if not exists idx_players_forza_team on players(forza_team_id);


-- ─── player_match_stats — add Forza-sourced stat columns ─────────────────────
-- BPS inputs and extended stats from /v2/matches/:id/player_statistics
-- 'forza_match_id' lets ingest-match-events tag rows it wrote (used by calculate-scores
-- to detect Forza data is available and skip the manual event aggregation path).

alter table player_match_stats
  add column if not exists forza_match_id    text,
  add column if not exists shots_on_target   int  not null default 0,
  add column if not exists saves             int  not null default 0,
  add column if not exists xg                numeric(6,4) not null default 0,
  add column if not exists xa                numeric(6,4) not null default 0,
  add column if not exists goals_conceded    int  not null default 0;

create index if not exists idx_player_match_stats_forza_match
  on player_match_stats(forza_match_id) where forza_match_id is not null;


-- ─── matchday_deadlines — add tournament scope ────────────────────────────────
alter table matchday_deadlines
  add column if not exists tournament_id text references tournaments(forza_id);

create index if not exists idx_matchday_deadlines_tournament
  on matchday_deadlines(tournament_id);


-- ─── leagues — ensure tournament_id column exists ────────────────────────────
-- Leagues were already designed with tournament_id (TEXT). This is a safety add.
alter table leagues
  add column if not exists is_dry_run boolean not null default false;
