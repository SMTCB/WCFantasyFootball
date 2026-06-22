-- 190_round_backups.sql
-- Automated per-round backup of squad state, fantasy_points totals, and leaderboard.
-- Written by calculate-scores the first time roundComplete fires for a round.
-- Provides a point-in-time recovery snapshot in case of scoring pipeline bugs
-- (e.g. a repeat of the v29 live_xi contamination incident, 2026-06-19).
--
-- One row per matchday_id — covers ALL leagues/squads for that tournament round.
-- RLS enabled with no policies: only service role (bypasses RLS) can access.

CREATE TABLE IF NOT EXISTS public.round_backups (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  matchday_id             text        NOT NULL UNIQUE,
  backed_up_at            timestamptz NOT NULL DEFAULT now(),

  -- Full squad state at roundComplete for every manager in every league.
  -- Per entry: squad_id, user_id, username, league_id, matchday_id,
  --   players[], starting_xi[], captain_id, budget_remaining,
  --   round_transfers {}, penalty_transfers {}, initial_build_complete
  squads_snapshot         jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- fantasy_points running totals as written in the roundComplete pass.
  -- Per entry: squad_id, matchday_id, total, points_breakdown
  --   (points_breakdown includes effective_xi, bench_players,
  --    effective_captain_id, base_xi, auto_subs, captain_reassigned)
  fantasy_points_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- League leaderboard state at roundComplete.
  -- Per entry: league_id, user_id, total_points, rank
  league_members_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.round_backups ENABLE ROW LEVEL SECURITY;
-- Intentionally no RLS policies — service role only.
-- Direct manager/commissioner access is blocked (backup data is internal).
