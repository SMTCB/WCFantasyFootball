-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 293 — Clubhouse housekeeping: finished-tournament visibility.
--
-- Two bugs/gaps in get_clubhouse_competitions' football branch, fixed together:
--
-- 1. `l.archived` was never added when migration 251 added it to the f1/tennis
--    branches (see 251's own comment: "Football branch unchanged — leagues.
--    archived isn't wired into this RPC either, so no behavior change there").
--    That means the existing `{item.archived && <ArchivedBadge />}` frontend
--    logic in ClubhouseScreen.jsx has never been able to fire for football
--    competitions, regardless of the underlying `leagues.archived` value.
--
-- 2. There was no way at all to tell the frontend "this tournament is over" —
--    prompted by the World Cup 2026 final having been played with no visual
--    change to its Clubhouse cards. Adds a `finished` boolean, true when the
--    league's tournament has `status = 'completed'` (joined via
--    leagues.tournament_id = tournaments.forza_id).
--
-- Deliberately football-only for now: f1 (paddocks) and tennis (player_boxes)
-- have no equivalent "tournament row status" concept wired up yet — f1 seasons
-- use ends_at on a separate f1_seasons table, tennis has no season table at
-- all. Extending `finished` to those sports is left for whenever that's asked
-- for.
--
-- NOTE: `tournaments.status` is a manually-set field (see BACKLOG.md — no
-- automation flips it). For recurring competitions (UCL, forza_id 1593), the
-- same tournament row is reused every season with no durable season-boundary
-- signal (see docs/deployment/ADDING_A_NEW_TOURNAMENT.md's warning banner),
-- so `status='completed'` must stay a deliberate one-off/manual designation —
-- never an auto-derived one — until that gap has a real fix.
--
-- Run from the Supabase-linked PC:
--   npx supabase db query --linked --file supabase/migrations/293_clubhouse_competitions_finished_flag.sql
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE OR REPLACE FUNCTION get_clubhouse_competitions(p_circle_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('error', 'NOT_MEMBER');
  END IF;

  RETURN json_build_object(
    'football', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',       l.id,
        'name',     l.name,
        'format',   l.format,
        'sport',    'football',
        'archived', l.archived,
        'finished', COALESCE(t.status = 'completed', false)
      ) ORDER BY l.name), '[]'::json)
      FROM circle_leagues cl
      JOIN leagues l ON l.id = cl.league_id
      LEFT JOIN tournaments t ON t.forza_id = l.tournament_id
      WHERE cl.circle_id = p_circle_id
    ),
    'f1', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',       p.id,
        'name',     p.name,
        'sport',    'f1',
        'archived', p.archived
      ) ORDER BY p.name), '[]'::json)
      FROM circle_paddocks cp
      JOIN paddocks p ON p.id = cp.paddock_id
      WHERE cp.circle_id = p_circle_id
    ),
    'tennis', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',       pb.id,
        'name',     pb.name,
        'sport',    'tennis',
        'archived', pb.archived
      ) ORDER BY pb.name), '[]'::json)
      FROM circle_player_boxes cpb
      JOIN player_boxes pb ON pb.id = cpb.player_box_id
      WHERE cpb.circle_id = p_circle_id
    )
  );
END;
$$;

COMMIT;
