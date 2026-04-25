-- Migration 09: Sprint 1 schema additions
-- Adds: daily_jokers, matchday_deadlines, player_match_stats tables
--       get_server_time() RPC, calculate_player_points() SQL function
--       Expands player seed data (30+ players)
--       Indexes for scoring engine performance

-- ─── daily_jokers ─────────────────────────────────────────────────────────────
-- One joker selection per user per league per day.
-- SquadScreen reads: eq('user_id', x).eq('joker_date', today)
create table if not exists daily_jokers (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  league_id  uuid        not null references leagues(id) on delete cascade,
  player_id  uuid        not null references players(id) on delete cascade,
  joker_date date        not null default current_date,
  points_earned numeric(6,2) default 0,
  created_at timestamptz default now(),
  unique(user_id, league_id, joker_date)
);
alter table daily_jokers disable row level security;

-- ─── matchday_deadlines ───────────────────────────────────────────────────────
-- Transfer window lock per matchday. Screens read latest deadline_at.
create table if not exists matchday_deadlines (
  id          uuid        primary key default gen_random_uuid(),
  matchday_id text        not null,
  label       text,                        -- e.g. 'Matchday 5'
  deadline_at timestamptz not null,
  created_at  timestamptz default now()
);
alter table matchday_deadlines disable row level security;

-- Seed current matchday deadline (matchday 5, transfers open)
insert into matchday_deadlines (matchday_id, label, deadline_at)
values ('5', 'Matchday 5', now() + interval '7 days')
on conflict do nothing;

-- ─── player_match_stats ───────────────────────────────────────────────────────
-- Aggregated per-player stats per fixture, fed by calculate-scores Edge Function.
create table if not exists player_match_stats (
  id               uuid    primary key default gen_random_uuid(),
  fixture_id       uuid    not null references fixtures(id) on delete cascade,
  player_id        uuid    not null references players(id) on delete cascade,
  minutes_played   int     not null default 0,
  goals            int     not null default 0,
  assists          int     not null default 0,
  own_goals        int     not null default 0,
  yellow_cards     int     not null default 0,
  red_cards        int     not null default 0,
  penalty_saved    int     not null default 0,
  penalty_missed   int     not null default 0,
  clean_sheet      boolean not null default false,
  tackles_won      int     not null default 0,
  interceptions    int     not null default 0,
  bps_score        numeric(8,2) default 0,
  bonus_points     int     not null default 0,
  fantasy_points   numeric(6,2) default 0,
  breakdown        jsonb,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  unique(fixture_id, player_id)
);
alter table player_match_stats disable row level security;

-- ─── get_server_time() RPC ────────────────────────────────────────────────────
-- MarketScreen uses this to sync client clock to server time.
create or replace function get_server_time()
returns timestamptz
language sql stable
as $$
  select now();
$$;

-- ─── calculate_player_points() ───────────────────────────────────────────────
-- Pure scoring function. Called by calculate-scores Edge Function and
-- the SQL-side upsert into player_match_stats.
create or replace function calculate_player_points(
  p_position     text,
  p_minutes      int     default 0,
  p_goals        int     default 0,
  p_assists      int     default 0,
  p_own_goals    int     default 0,
  p_yellow_cards int     default 0,
  p_red_cards    int     default 0,
  p_penalty_saved  int   default 0,
  p_penalty_missed int   default 0,
  p_clean_sheet  boolean default false,
  p_bonus_points int     default 0
) returns numeric(6,2) language plpgsql immutable as $$
declare
  v_pts numeric := 0;
begin
  -- Minutes played: 1 pt per 90
  v_pts := v_pts + round((p_minutes::numeric / 90), 2);

  -- Position-based goals & clean sheet
  case upper(p_position)
    when 'GK' then
      v_pts := v_pts + (p_goals * 5);
      v_pts := v_pts + (p_penalty_saved * 5);
      if p_clean_sheet and p_minutes >= 60 then v_pts := v_pts + 4; end if;
    when 'DEF' then
      v_pts := v_pts + (p_goals * 4);
      v_pts := v_pts + (p_assists * 1);
      if p_clean_sheet and p_minutes >= 60 then v_pts := v_pts + 4; end if;
    when 'MID' then
      v_pts := v_pts + (p_goals * 5);
      v_pts := v_pts + (p_assists * 1);
      if p_clean_sheet and p_minutes >= 60 then v_pts := v_pts + 1; end if;
    when 'FWD' then
      v_pts := v_pts + (p_goals * 3);
      v_pts := v_pts + (p_assists * 1);
      v_pts := v_pts + (p_penalty_missed * -1);
    else null;
  end case;

  -- Universal deductions
  v_pts := v_pts + (p_own_goals    * -2);
  v_pts := v_pts + (p_yellow_cards * -1);
  v_pts := v_pts + (p_red_cards    * -3);

  -- Bonus
  v_pts := v_pts + p_bonus_points;

  return round(v_pts, 2);
end;
$$;

-- ─── Performance indexes ──────────────────────────────────────────────────────
create index if not exists idx_match_events_fixture_player
  on match_events(fixture_id, player_id);

create index if not exists idx_player_match_stats_fixture
  on player_match_stats(fixture_id);

create index if not exists idx_fantasy_points_squad_matchday
  on fantasy_points(squad_id, matchday_id);

create index if not exists idx_daily_jokers_user_date
  on daily_jokers(user_id, joker_date);

create index if not exists idx_matchday_deadlines_deadline
  on matchday_deadlines(deadline_at desc);

-- ─── Expand player seed data ──────────────────────────────────────────────────
-- Add 25 more players across all positions and major WC2026 nations.
-- Existing 7 players (Vinicius, Mbappé, Bellingham, Pedri, De Bruyne, Neymar, Ederson)
-- are already seeded in 01_seed_alpha.sql.

insert into players (id, name, position, nationality, club, price, photo_url) values
  -- Goalkeepers
  ('a0000001-0000-0000-0000-000000000001', 'Alisson',         'GK',  'Brazil',      'Liverpool',     7.5, null),
  ('a0000001-0000-0000-0000-000000000002', 'Thibaut Courtois','GK',  'Belgium',     'Real Madrid',   7.0, null),
  ('a0000001-0000-0000-0000-000000000003', 'Manuel Neuer',    'GK',  'Germany',     'Bayern Munich', 6.5, null),
  ('a0000001-0000-0000-0000-000000000004', 'Jordan Pickford', 'GK',  'England',     'Everton',       5.5, null),

  -- Defenders
  ('a0000001-0000-0000-0000-000000000011', 'Virgil van Dijk',  'DEF', 'Netherlands', 'Liverpool',      8.5, null),
  ('a0000001-0000-0000-0000-000000000012', 'Achraf Hakimi',    'DEF', 'Morocco',     'PSG',            7.5, null),
  ('a0000001-0000-0000-0000-000000000013', 'Ruben Dias',       'DEF', 'Portugal',    'Man City',       7.0, null),
  ('a0000001-0000-0000-0000-000000000014', 'Theo Hernandez',   'DEF', 'France',      'AC Milan',       6.5, null),
  ('a0000001-0000-0000-0000-000000000015', 'Alphonso Davies',  'DEF', 'Canada',      'Bayern Munich',  7.0, null),
  ('a0000001-0000-0000-0000-000000000016', 'Trent Alexander-Arnold','DEF','England', 'Liverpool',      8.0, null),

  -- Midfielders
  ('a0000001-0000-0000-0000-000000000021', 'Luka Modric',      'MID', 'Croatia',    'Real Madrid',    7.5, null),
  ('a0000001-0000-0000-0000-000000000022', 'Declan Rice',      'MID', 'England',    'Arsenal',        7.0, null),
  ('a0000001-0000-0000-0000-000000000023', 'Gavi',             'MID', 'Spain',      'Barcelona',      7.0, null),
  ('a0000001-0000-0000-0000-000000000024', 'Enzo Fernandez',   'MID', 'Argentina',  'Chelsea',        7.5, null),
  ('a0000001-0000-0000-0000-000000000025', 'Phil Foden',       'MID', 'England',    'Man City',       9.0, null),
  ('a0000001-0000-0000-0000-000000000026', 'Rodrigo',          'MID', 'Spain',      'Man City',       7.0, null),
  ('a0000001-0000-0000-0000-000000000027', 'Jamal Musiala',    'MID', 'Germany',    'Bayern Munich',  8.5, null),
  ('a0000001-0000-0000-0000-000000000028', 'Bernardo Silva',   'MID', 'Portugal',   'Man City',       8.0, null),

  -- Forwards
  ('a0000001-0000-0000-0000-000000000031', 'Erling Haaland',   'FWD', 'Norway',     'Man City',       12.5, null),
  ('a0000001-0000-0000-0000-000000000032', 'Harry Kane',       'FWD', 'England',    'Bayern Munich',  11.5, null),
  ('a0000001-0000-0000-0000-000000000033', 'Cristiano Ronaldo','FWD', 'Portugal',   'Al Nassr',       10.0, null),
  ('a0000001-0000-0000-0000-000000000034', 'Lionel Messi',     'FWD', 'Argentina',  'Inter Miami',    10.0, null),
  ('a0000001-0000-0000-0000-000000000035', 'Lautaro Martinez', 'FWD', 'Argentina',  'Inter Milan',     9.0, null),
  ('a0000001-0000-0000-0000-000000000036', 'Bukayo Saka',      'FWD', 'England',    'Arsenal',         9.5, null),
  ('a0000001-0000-0000-0000-000000000037', 'Rafael Leao',      'FWD', 'Portugal',   'AC Milan',        8.5, null)

on conflict (id) do nothing;
