-- Migration 248: make trophy_ledger sport-polymorphic (ARCH-1c unblock)
--
-- Background: League / Paddock (F1) / Player Box (tennis) are naming-convention
-- variants of the SAME concept — each is a real, circle-scoped competition
-- container with its own membership table and direct circle_id column
-- (leagues.circle_id, paddocks.circle_id, player_boxes.circle_id). Football,
-- F1, and tennis scoring tables are globally keyed by design (one row per
-- user per race/tournament) with the per-competition leaderboard computed as
-- a membership-filtered read at query time — see
-- get_paddock_leaderboard()/get_player_box_leaderboard() for the existing
-- pattern. This is documented in docs/architecture/COMPETITION_MODEL.md.
--
-- trophy_ledger (migration 189) was built with two hard FKs that only work
-- for football:
--   - tournament_id uuid REFERENCES tournaments(id)   -- football-only table
--   - league_id     uuid REFERENCES leagues(id)        -- football-only table
-- This blocks any event_win/season_win insert for F1 (paddocks/f1_seasons)
-- or tennis (player_boxes/tennis_tournaments), since those rows don't exist
-- in tournaments/leagues at all. The original architecture doc
-- (MULTI_SPORT_PLATFORM_ARCHITECTURE.md §4) intended a generic, sport-scoped
-- key here; migration 189 implemented a football-specific hard FK instead.
-- This migration corrects that: both columns stay uuid (no data migration
-- needed — existing football rows are unaffected) but are no longer FK-
-- enforced, since their meaning is now interpreted per sport_id:
--   sport_id=football -> tournament_id: tournaments.id,   league_id: leagues.id
--   sport_id=f1       -> tournament_id: f1_seasons.id,    league_id: paddocks.id
--   sport_id=tennis   -> tournament_id: tennis_tournaments.id, league_id: player_boxes.id
--
-- Confirmed zero read dependents on the raw league_id/tournament_id columns:
-- TrophyCabinetScreen.jsx only selects (id, tier, awarded_at, meta) and reads
-- league_name/sport_type off the denormalized meta jsonb (see migration 246);
-- get_circle_meta_standings() groups by (circle_id, user_id) only.
--
-- f1_seasons is new: F1 currently has no season-level uuid identity at all
-- (f1_year_results keys off a plain `season integer`). This gives F1 the same
-- season start/end anchor football (tournaments.starts_at/ends_at) and tennis
-- (tennis_tournaments.start_date/end_date) already have, needed for both
-- event_win (this migration) and the season_win cron (follow-up).
--
-- FULLY ADDITIVE / RELAXING: drops two FK constraints (columns + data
-- untouched) and adds one new table. Zero changes to any other table,
-- column, index, policy, or function.

BEGIN;

-- ─── 1. Relax trophy_ledger FKs to support F1/tennis ───────────────────────

ALTER TABLE trophy_ledger DROP CONSTRAINT trophy_ledger_tournament_id_fkey;
ALTER TABLE trophy_ledger DROP CONSTRAINT trophy_ledger_league_id_fkey;

COMMENT ON COLUMN trophy_ledger.tournament_id IS
  'Sport-scoped, not FK-enforced (relaxed in migration 248). Interpreted by sport_id: football -> tournaments.id, f1 -> f1_seasons.id, tennis -> tennis_tournaments.id.';

COMMENT ON COLUMN trophy_ledger.league_id IS
  'Sport-scoped, not FK-enforced (relaxed in migration 248). Interpreted by sport_id: football -> leagues.id, f1 -> paddocks.id, tennis -> player_boxes.id.';

-- ─── 2. f1_seasons — season-level anchor F1 currently lacks ────────────────

CREATE TABLE IF NOT EXISTS f1_seasons (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season     int         NOT NULL UNIQUE,
  starts_at  timestamptz NOT NULL,
  ends_at    timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO f1_seasons (season, starts_at, ends_at)
VALUES (2026, '2026-03-01T00:00:00Z', '2026-12-15T00:00:00Z')
ON CONFLICT (season) DO NOTHING;

COMMIT;
