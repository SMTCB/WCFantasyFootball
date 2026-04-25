-- Migration 13: Align player_match_stats and fantasy_points with calculate-scores expectations
-- The live tables have performance stats columns (from Forza API integration) but lack
-- the scoring columns that calculate-scores writes. This migration adds them.

-- ─── player_match_stats: add scoring columns ──────────────────────────────────
alter table player_match_stats
  add column if not exists goals           int     not null default 0,
  add column if not exists assists         int     not null default 0,
  add column if not exists own_goals       int     not null default 0,
  add column if not exists yellow_cards    int     not null default 0,
  add column if not exists red_cards       int     not null default 0,
  add column if not exists penalty_saved   int     not null default 0,
  add column if not exists penalty_missed  int     not null default 0,
  add column if not exists clean_sheet     boolean not null default false,
  add column if not exists bps_score       numeric(8,2) not null default 0,
  add column if not exists bonus_points    int     not null default 0,
  add column if not exists fantasy_points  numeric(8,2) not null default 0,
  add column if not exists breakdown       jsonb,
  add column if not exists updated_at      timestamptz not null default now();

-- Unique constraint required for upsert onConflict: 'fixture_id,player_id'
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'player_match_stats_fixture_player_key'
  ) then
    alter table player_match_stats
      add constraint player_match_stats_fixture_player_key unique (fixture_id, player_id);
  end if;
end $$;

-- ─── fantasy_points: add matchday_id column ───────────────────────────────────
alter table fantasy_points
  add column if not exists matchday_id text not null default 'current';

-- Unique constraint required for upsert onConflict: 'squad_id,matchday_id'
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'fantasy_points_squad_matchday_key'
  ) then
    alter table fantasy_points
      add constraint fantasy_points_squad_matchday_key unique (squad_id, matchday_id);
  end if;
end $$;
