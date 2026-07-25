-- Extend p2p_challenges from single-league scope to Clubhouse (circle) scope.
--
-- Additive only: existing rows/behavior keep working unmodified. Adds circle_id (backfilled from
-- leagues.circle_id, the migration-215 source of truth), paddock_id/player_box_id for future
-- F1/tennis competitor bets, makes league_id nullable, and rewrites the SELECT RLS policy onto
-- circle_members via the existing is_circle_member() SECURITY DEFINER helper (migration 230
-- pattern) instead of league_members.
--
-- p2p_challenges was confirmed empty in prod before this migration was written, so the backfill
-- and NOT NULL steps below are no-ops today -- they exist so the column is correctly populated
-- and constrained once challenge creation starts working again (PR C).

ALTER TABLE p2p_challenges
  ADD COLUMN circle_id uuid REFERENCES circles(id) ON DELETE CASCADE,
  ADD COLUMN paddock_id uuid REFERENCES paddocks(id) ON DELETE CASCADE,
  ADD COLUMN player_box_id uuid REFERENCES player_boxes(id) ON DELETE CASCADE;

UPDATE p2p_challenges c
SET circle_id = l.circle_id
FROM leagues l
WHERE l.id = c.league_id
  AND c.circle_id IS NULL;

DO $$
DECLARE
  v_orphans int;
BEGIN
  SELECT count(*) INTO v_orphans FROM p2p_challenges WHERE circle_id IS NULL;
  IF v_orphans = 0 THEN
    ALTER TABLE p2p_challenges ALTER COLUMN circle_id SET NOT NULL;
  ELSE
    RAISE WARNING 'p2p_challenges: % row(s) left with NULL circle_id after backfill (league without a circle) -- NOT NULL constraint skipped', v_orphans;
  END IF;
END $$;

ALTER TABLE p2p_challenges
  ALTER COLUMN league_id DROP NOT NULL;

DROP POLICY IF EXISTS p2p_challenges_select ON p2p_challenges;

CREATE POLICY p2p_challenges_select ON p2p_challenges
  FOR SELECT
  USING (is_circle_member(circle_id));
