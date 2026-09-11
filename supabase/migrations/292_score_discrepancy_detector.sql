-- Migration 292: get_score_discrepancies() RPC
--
-- Closes the "ingestion reconciliation gap" found during the 2026-09-11
-- Champions League audit: once a round is frozen (rollupSquads() writes
-- points_breakdown->effective_xi, effective_captain_id, joker_player_id,
-- transfer_penalty_deduction once per squad+matchday — the "written in
-- stone" guard in calculate-scores/index.js), fantasy_points.total is
-- NEVER recomputed again for that round, no matter what happens to
-- player_match_stats afterwards. Two independent ways that gap bit us the
-- same day:
--   1. CODE-RACE-1 (migration 291): a freeze pass could read
--      player_match_stats before every fixture in the round had finished
--      writing, permanently undercounting `total` for 18 squads across
--      3 UCL leagues.
--   2. A late correction to player_match_stats (e.g. the Suárez/Tresoldi/
--      Guirassy goal/penalty double-subtract, PR #1009) never reaches
--      fantasy_points.total for any round that had already frozen before
--      the correction was applied — the fix only helps future rounds.
-- Both cases were only caught because a user happened to notice their
-- score looked wrong. This RPC makes that check automatic and repeatable
-- instead of relying on a bug report.
--
-- For every squad+matchday whose round has frozen (effective_xi present),
-- it reconstructs `total` from the frozen effective_xi/captain/joker/
-- penalty metadata joined against the CURRENT player_match_stats for that
-- matchday's fixtures (fixtures.matchday_id = fantasy_points.matchday_id),
-- replicating rollupSquads()'s exact formula:
--   SUM(ROUND(raw_pts) * captain_mult) + ROUND(joker_raw_pts) - penalty_ded
-- and returns only the rows where that disagrees with the stored `total`.
-- This is a read-only detector — it does not touch fantasy_points or
-- league_members. Any real discrepancy still goes through the normal
-- Pilot Safeguards flow: SELECT, show the user, get explicit approval,
-- then a manual correction (see BACKLOG.md for the 2026-09-11 precedent).
--
-- Query directly:
--   SELECT * FROM get_score_discrepancies();                  -- all frozen rounds
--   SELECT * FROM get_score_discrepancies('1593-r2');          -- one matchday only

CREATE OR REPLACE FUNCTION get_score_discrepancies(p_matchday_id text DEFAULT NULL)
RETURNS TABLE (
  squad_id          uuid,
  league_id         uuid,
  matchday_id       text,
  stored_total      numeric,
  recomputed_total  numeric,
  diff              numeric
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
  WITH frozen AS (
    SELECT
      fp.squad_id,
      s.league_id,
      fp.matchday_id,
      fp.total AS stored_total,
      fp.points_breakdown->>'effective_captain_id' AS captain_id,
      COALESCE((fp.points_breakdown->>'is_triple_captain')::boolean, false) AS is_tc,
      fp.points_breakdown->>'joker_player_id' AS joker_id,
      COALESCE((fp.points_breakdown->>'transfer_penalty_deduction')::numeric, 0) AS penalty_ded,
      fp.points_breakdown->'effective_xi' AS xi_json
    FROM fantasy_points fp
    JOIN squads s ON s.id = fp.squad_id
    WHERE fp.points_breakdown->'effective_xi' IS NOT NULL
      AND (p_matchday_id IS NULL OR fp.matchday_id = p_matchday_id)
  ),
  round_fixtures AS (
    SELECT DISTINCT matchday_id, id AS fixture_id
    FROM fixtures
    WHERE p_matchday_id IS NULL OR matchday_id = p_matchday_id
  ),
  xi_expanded AS (
    SELECT squad_id, matchday_id, jsonb_array_elements_text(xi_json) AS player_id
    FROM frozen
  ),
  xi_scored AS (
    SELECT
      x.squad_id,
      x.matchday_id,
      x.player_id,
      COALESCE(pms.fantasy_points, 0) AS raw_pts
    FROM xi_expanded x
    LEFT JOIN round_fixtures rf ON rf.matchday_id = x.matchday_id
    LEFT JOIN player_match_stats pms
      ON pms.player_id = x.player_id AND pms.fixture_id = rf.fixture_id
  ),
  xi_totals AS (
    SELECT
      xs.squad_id,
      xs.matchday_id,
      SUM(
        ROUND(xs.raw_pts) *
        CASE
          WHEN xs.player_id = f.captain_id THEN (CASE WHEN f.is_tc THEN 3 ELSE 2 END)
          ELSE 1
        END
      ) AS xi_total
    FROM xi_scored xs
    JOIN frozen f ON f.squad_id = xs.squad_id AND f.matchday_id = xs.matchday_id
    GROUP BY xs.squad_id, xs.matchday_id
  ),
  joker_pts AS (
    SELECT
      f.squad_id,
      f.matchday_id,
      COALESCE(ROUND(SUM(pms.fantasy_points)), 0) AS joker_total
    FROM frozen f
    LEFT JOIN round_fixtures rf ON rf.matchday_id = f.matchday_id
    LEFT JOIN player_match_stats pms
      ON pms.player_id = f.joker_id AND pms.fixture_id = rf.fixture_id
    WHERE f.joker_id IS NOT NULL
    GROUP BY f.squad_id, f.matchday_id
  )
  SELECT
    f.squad_id,
    f.league_id,
    f.matchday_id,
    f.stored_total,
    (xt.xi_total + COALESCE(jp.joker_total, 0) - f.penalty_ded) AS recomputed_total,
    (f.stored_total - (xt.xi_total + COALESCE(jp.joker_total, 0) - f.penalty_ded)) AS diff
  FROM frozen f
  JOIN xi_totals xt ON xt.squad_id = f.squad_id AND xt.matchday_id = f.matchday_id
  LEFT JOIN joker_pts jp ON jp.squad_id = f.squad_id AND jp.matchday_id = f.matchday_id
  WHERE f.stored_total <> (xt.xi_total + COALESCE(jp.joker_total, 0) - f.penalty_ded)
  ORDER BY f.matchday_id, ABS(f.stored_total - (xt.xi_total + COALESCE(jp.joker_total, 0) - f.penalty_ded)) DESC;
$$;

-- Service role only — consumed by the reconcile-scores Edge Function, not the client.
