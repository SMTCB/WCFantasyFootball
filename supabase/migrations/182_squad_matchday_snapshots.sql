-- Migration 182: squad_matchday_snapshots
--
-- Purpose: Immutable record of each manager's squad at the moment the first fixture
-- of a matchday kicks off. This snapshot is frozen — post-transfer changes to squads
-- cannot corrupt it. It serves as the authoritative source for:
--   1. Historical recap: what XI + bench did each manager actually field
--   2. Scoring integrity: calculate-scores uses this if the live_xi breakdown snapshot
--      is missing or suspect (defence-in-depth alongside the v30 live_xi freeze fix)
--
-- Triggered automatically: the `trg_snapshot_squads_on_kickoff` trigger fires when any
-- fixture transitions scheduled/pre_game → live, calling snapshot_squads_for_matchday().
-- ON CONFLICT DO NOTHING ensures the FIRST kickoff of each round wins — subsequent
-- fixtures in the same round do not overwrite the already-frozen snapshot.

-- ── Table ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS squad_matchday_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID        NOT NULL REFERENCES leagues(id)    ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  matchday_id     TEXT        NOT NULL,
  squad_id        UUID        NOT NULL REFERENCES squads(id)     ON DELETE CASCADE,
  -- The starting XI at the time of snapshot (11 player IDs)
  starting_xi     TEXT[]      NOT NULL DEFAULT '{}',
  -- All squad players (typically 15: XI + bench). bench = players EXCEPT starting_xi.
  players         TEXT[]      NOT NULL DEFAULT '{}',
  captain_id      TEXT,
  snapshotted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Which event created this snapshot
  snapshot_reason TEXT        NOT NULL DEFAULT 'fixture_live',
  -- Unique: one snapshot per manager per matchday per league. First write wins.
  UNIQUE (league_id, user_id, matchday_id)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE squad_matchday_snapshots ENABLE ROW LEVEL SECURITY;

-- Members can read snapshots for their own leagues
CREATE POLICY "Members read snapshots" ON squad_matchday_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = squad_matchday_snapshots.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- Writes go through SECURITY DEFINER functions only (service role / triggers)
-- No INSERT/UPDATE policy for authenticated users — the trigger handles writes.

-- ── Snapshot function ─────────────────────────────────────────────────────────
-- Called by the trigger (and can be called manually for repair / backfill).
-- Inserts one row per squad in any league whose tournament matches the matchday_id.
-- ON CONFLICT DO NOTHING: first kickoff of the round locks the snapshot.
CREATE OR REPLACE FUNCTION snapshot_squads_for_matchday(p_matchday_id text, p_reason text DEFAULT 'fixture_live')
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament_id text;
  v_inserted      int;
BEGIN
  -- Derive tournament_id from matchday_id format '{tournament_id}-r{N}'
  v_tournament_id := split_part(p_matchday_id, '-r', 1);
  IF v_tournament_id = p_matchday_id OR v_tournament_id = '' THEN
    -- matchday_id does not follow the expected format; skip silently
    RETURN 0;
  END IF;

  -- Insert one snapshot row per (league, user), preferring the most recently
  -- created squad row when multiple exist (edge case: multiple squad rows).
  -- ON CONFLICT DO NOTHING: the first fixture kickoff locks the snapshot;
  -- subsequent fixtures in the same round do not overwrite it.
  WITH ranked_squads AS (
    SELECT DISTINCT ON (s.league_id, s.user_id)
      s.league_id,
      s.user_id,
      s.id                                                               AS squad_id,
      COALESCE(NULLIF(s.starting_xi, ARRAY[]::text[]),
               (s.players)[1:11],
               ARRAY[]::text[])                                          AS starting_xi,
      COALESCE(s.players, ARRAY[]::text[])                               AS players,
      s.captain_id
    FROM squads     s
    JOIN leagues    l ON l.id = s.league_id
    WHERE l.tournament_id = v_tournament_id
    ORDER BY s.league_id, s.user_id, s.created_at DESC
  )
  INSERT INTO squad_matchday_snapshots
    (league_id, user_id, matchday_id, squad_id, starting_xi, players, captain_id, snapshot_reason)
  SELECT
    rs.league_id,
    rs.user_id,
    p_matchday_id,
    rs.squad_id,
    rs.starting_xi,
    rs.players,
    rs.captain_id,
    p_reason
  FROM ranked_squads rs
  ON CONFLICT (league_id, user_id, matchday_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

-- ── Trigger function ──────────────────────────────────────────────────────────
-- Fires AFTER a fixture transitions to 'live'. Calls snapshot_squads_for_matchday
-- so squads are captured at kickoff, before any mid-matchday transfer is possible.
CREATE OR REPLACE FUNCTION trg_fn_snapshot_squads_on_kickoff()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('scheduled', 'pre_game', 'tbd')
     AND NEW.status = 'live'
     AND NEW.matchday_id IS NOT NULL THEN
    PERFORM snapshot_squads_for_matchday(NEW.matchday_id, 'fixture_live');
  END IF;
  RETURN NEW;
END;
$$;

-- Drop if exists (idempotent re-run safety)
DROP TRIGGER IF EXISTS trg_snapshot_squads_on_kickoff ON fixtures;

CREATE TRIGGER trg_snapshot_squads_on_kickoff
  AFTER UPDATE ON fixtures
  FOR EACH ROW
  EXECUTE FUNCTION trg_fn_snapshot_squads_on_kickoff();

-- ── Bench helper view (informational) ─────────────────────────────────────────
-- bench_players = players EXCEPT starting_xi (order-preserved)
-- Exposed as a helper so consumers don't recompute.
CREATE OR REPLACE FUNCTION get_snapshot_bench(p_starting_xi text[], p_players text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY(
    SELECT pid FROM unnest(p_players) pid
    WHERE pid != ALL(p_starting_xi)
  );
$$;

-- ── Grant ─────────────────────────────────────────────────────────────────────
GRANT SELECT ON squad_matchday_snapshots TO authenticated, anon;
GRANT EXECUTE ON FUNCTION snapshot_squads_for_matchday(text, text) TO service_role;
GRANT EXECUTE ON FUNCTION get_snapshot_bench(text[], text[]) TO authenticated, anon;
