-- Migration 50: Add tournament_id to transfers + fix cross-tournament validation
--
-- The transfers table currently joins players by ID only. Once squads have a
-- tournament_id (migration 49), we need transfers to carry the same context so
-- the enforce_position_limit() trigger can verify that the player being bought
-- actually belongs to the squad's competition — preventing cross-tournament
-- player swaps.
--
-- Steps:
--   1. Add nullable tournament_id column
--   2. Backfill from squads (same league_id + user_id)
--   3. Default any gaps to '426'
--   4. Rewrite enforce_position_limit() to filter players by tournament_id

ALTER TABLE transfers ADD COLUMN IF NOT EXISTS tournament_id TEXT REFERENCES tournaments(forza_id);

-- Backfill from the squad that matches this transfer's user + league
UPDATE transfers t
SET    tournament_id = s.tournament_id
FROM   squads s
WHERE  s.league_id      = t.league_id
  AND  s.user_id        = t.user_id
  AND  s.tournament_id  IS NOT NULL
  AND  t.tournament_id  IS NULL;

-- Fallback for any transfers that couldn't be matched to a squad
UPDATE transfers
SET    tournament_id = '426'
WHERE  tournament_id IS NULL;

-- Rewrite enforce_position_limit() to scope player lookup by tournament_id.
-- This prevents a player from a different competition being counted toward
-- the position cap of another tournament's squad.
CREATE OR REPLACE FUNCTION enforce_position_limit()
RETURNS TRIGGER AS $$
DECLARE
  pos_caps  JSONB := '{"GK":2,"DEF":5,"MID":5,"FWD":3}'::jsonb;
  in_pos    TEXT;
  out_pos   TEXT;
  cur_squad TEXT[];
  pos_count INT;
  cap       INT;
BEGIN
  -- Get player_in position, scoped to this transfer's tournament
  SELECT UPPER(TRIM(position)) INTO in_pos
  FROM   players
  WHERE  id            = NEW.player_in
    AND  tournament_id = NEW.tournament_id;

  -- Normalise FW → FWD
  IF in_pos = 'FW' THEN in_pos := 'FWD'; END IF;

  -- Get current squad for this user in this league
  SELECT allocated_players INTO cur_squad
  FROM   draft_allocations
  WHERE  league_id = NEW.league_id AND user_id = NEW.user_id;

  IF cur_squad IS NULL THEN RETURN NEW; END IF;

  -- Count existing players of the same position, excluding the player going out,
  -- filtered by tournament_id to avoid cross-competition conflicts
  SELECT COUNT(*) INTO pos_count
  FROM   unnest(cur_squad) pid
  JOIN   players p ON p.id = pid AND p.tournament_id = NEW.tournament_id
  WHERE  UPPER(TRIM(p.position)) IN (in_pos, REPLACE(in_pos,'FWD','FW'))
    AND  pid <> NEW.player_out;

  cap := (pos_caps ->> in_pos)::int;

  IF cap IS NOT NULL AND pos_count >= cap THEN
    RAISE EXCEPTION 'position_limit_reached'
      USING DETAIL = format('Position %s is already at maximum (%s).', in_pos, cap);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
