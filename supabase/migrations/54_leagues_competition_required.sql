-- Migration 54: Competition-required leagues
--
-- Problem: leagues.tournament_id exists as a nullable TEXT column but is never
-- set during league creation (create_league RPC didn't accept the parameter).
-- This means every squad in those leagues has no competition scope — the market
-- shows all players from all tournaments and scoring is ambiguous.
--
-- Changes:
--   1. Backfill existing leagues (tournament_id IS NULL) → '426' (EPL default)
--   2. Set NOT NULL + default '426' on leagues.tournament_id
--   3. Rewrite create_league RPC to accept and persist p_tournament_id
--
-- Future-proof note: the 1-league : 1-tournament constraint lives only in this
-- RPC and the NOT NULL column. When multi-tournament leagues are needed, add a
-- league_tournaments junction table and relax this constraint without touching
-- the downstream filtering logic (which already joins through leagues.tournament_id).

-- ── 1. Backfill ────────────────────────────────────────────────────────────────
UPDATE leagues
SET    tournament_id = '426'
WHERE  tournament_id IS NULL;

-- ── 2. Column constraints ──────────────────────────────────────────────────────
ALTER TABLE leagues
  ALTER COLUMN tournament_id SET DEFAULT '426';

ALTER TABLE leagues
  ALTER COLUMN tournament_id SET NOT NULL;

-- Ensure FK to tournaments exists (safe if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE  constraint_name = 'leagues_tournament_id_fkey'
      AND  table_name      = 'leagues'
  ) THEN
    ALTER TABLE leagues
      ADD CONSTRAINT leagues_tournament_id_fkey
      FOREIGN KEY (tournament_id) REFERENCES tournaments(forza_id);
  END IF;
END $$;

-- ── 3. Updated create_league RPC ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_league(
  p_name          TEXT,
  p_format        TEXT,
  p_user_id       UUID,
  p_tournament_id TEXT DEFAULT '426'
) RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_league    leagues%ROWTYPE;
  v_join_code TEXT;
BEGIN
  -- Validate tournament exists
  IF NOT EXISTS (SELECT 1 FROM tournaments WHERE forza_id = p_tournament_id) THEN
    RAISE EXCEPTION 'TOURNAMENT_NOT_FOUND: tournament % does not exist', p_tournament_id;
  END IF;

  -- Generate a short join code
  v_join_code := upper(substring(md5(random()::text) for 6));

  INSERT INTO leagues (name, format, tournament_id, created_by, join_code)
  VALUES (
    p_name,
    p_format::league_format,
    p_tournament_id,
    p_user_id,
    v_join_code
  )
  RETURNING * INTO v_league;

  -- Insert creator as commissioner member
  INSERT INTO league_members (league_id, user_id, role)
  VALUES (v_league.id, p_user_id, 'commissioner')
  ON CONFLICT (league_id, user_id) DO NOTHING;

  RETURN row_to_json(v_league);
END;
$$;
