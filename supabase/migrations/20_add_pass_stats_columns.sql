-- Migration 20: Add pass completion stats columns to player_match_stats
-- Required for BPS calculation: accurate_passes and total_passes
-- These are fetched from Forza API in ingest-match-events and used in calcBPS()

alter table player_match_stats
  add column if not exists accurate_passes int not null default 0,
  add column if not exists total_passes    int not null default 0;

-- Update the comment on player_match_stats to document the new columns
comment on column player_match_stats.accurate_passes is 'Number of successful passes (from Forza E11 API)';
comment on column player_match_stats.total_passes is 'Total number of pass attempts (from Forza E11 API)';
