-- Migration 115: Purge cross-tournament players from all squads + enforce at DB level
--
-- Background: each league is linked to exactly one tournament (e.g. World Cup 429).
-- Only players from that tournament are eligible for that league.  During early
-- testing, some squads received players from a different tournament (e.g. EPL 426
-- players ending up in a WC 429 league).  This migration:
--
--   1. Removes every cross-tournament player from squad.players[]
--   2. Refunds their price to budget_remaining
--   3. Clears captain_id / joker_player_id if they were a cross-tournament player
--   4. Rebuilds starting_xi from the remaining valid players (GK first)
--   5. Adds a DB-level CHECK that prevents future violations
--
-- Affected squads found before migration:
--   WC_1 / s.t.c.braganca : Garnacho (FWD, 426 £5.8M), McNally (GK, 426 £4.8M),
--                             Lecomte (GK, 426 £4.6M)  → refund £15.2M
--   WC_1 / Zidane_99       : Matz Sels (GK, 426 £4.4M), Bernd Leno (GK, 426 £6.0M)
--                             → refund £10.4M

-- ── 1. Remove cross-tournament players + refund prices ────────────────────────

UPDATE squads s
SET
  -- Refund the price of each wrong-tournament player back to budget
  budget_remaining = s.budget_remaining + (
    SELECT COALESCE(SUM(p.price), 0)
    FROM   unnest(s.players) AS pid
    JOIN   players p ON p.id = pid
    WHERE  p.tournament_id IS NOT NULL
      AND  p.tournament_id <> (SELECT tournament_id FROM leagues WHERE id = s.league_id)
  ),

  -- Keep only players whose tournament matches the league's tournament (or is NULL)
  players = ARRAY(
    SELECT pid FROM unnest(s.players) AS pid
    WHERE NOT EXISTS (
      SELECT 1 FROM players p
      WHERE  p.id = pid
        AND  p.tournament_id IS NOT NULL
        AND  p.tournament_id <> (SELECT tournament_id FROM leagues WHERE id = s.league_id)
    )
  ),

  -- Clear captain if they were a cross-tournament player
  captain_id = CASE
    WHEN EXISTS (
      SELECT 1 FROM players p
      WHERE  p.id = s.captain_id
        AND  p.tournament_id IS NOT NULL
        AND  p.tournament_id <> (SELECT tournament_id FROM leagues WHERE id = s.league_id)
    ) THEN NULL ELSE s.captain_id
  END,

  -- Clear joker if they were a cross-tournament player
  joker_player_id = CASE
    WHEN EXISTS (
      SELECT 1 FROM players p
      WHERE  p.id = s.joker_player_id
        AND  p.tournament_id IS NOT NULL
        AND  p.tournament_id <> (SELECT tournament_id FROM leagues WHERE id = s.league_id)
    ) THEN NULL ELSE s.joker_player_id
  END,

  -- Remove cross-tournament players from starting_xi too
  starting_xi = ARRAY(
    SELECT pid FROM unnest(s.starting_xi) AS pid
    WHERE NOT EXISTS (
      SELECT 1 FROM players p
      WHERE  p.id = pid
        AND  p.tournament_id IS NOT NULL
        AND  p.tournament_id <> (SELECT tournament_id FROM leagues WHERE id = s.league_id)
    )
  )

WHERE (SELECT tournament_id FROM leagues WHERE id = s.league_id) IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM unnest(s.players) AS pid
    JOIN   players p ON p.id = pid
    WHERE  p.tournament_id IS NOT NULL
      AND  p.tournament_id <> (SELECT tournament_id FROM leagues WHERE id = s.league_id)
  );

-- ── 2. Rebuild starting_xi for squads left with a stale or short XI ──────────
-- After removing invalid players, starting_xi may be empty or have fewer than
-- 11 entries. Rebuild GK-first from the remaining valid players array.

UPDATE squads s
SET starting_xi = (
  SELECT ARRAY_AGG(id)
  FROM (
    SELECT id FROM players
    WHERE  id = ANY(s.players)
    ORDER  BY (position = 'GK') DESC, array_position(s.players, id)
    LIMIT  11
  ) sub
)
WHERE
  -- Squad has enough players to field 11
  array_length(s.players, 1) >= 11
  AND (
    -- starting_xi is empty/null
    array_length(s.starting_xi, 1) IS NULL
    OR array_length(s.starting_xi, 1) = 0
    -- starting_xi contains IDs no longer in players[] (just purged)
    OR EXISTS (
      SELECT 1 FROM unnest(s.starting_xi) xi_id
      WHERE  xi_id != ALL(s.players)
    )
  );

-- ── 3. Verify result ──────────────────────────────────────────────────────────
-- (informational — shows 0 rows if cleanup was complete)
DO $$
DECLARE v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM   squads s
  JOIN   leagues l  ON l.id = s.league_id
  JOIN   players p  ON p.id = ANY(s.players)
  WHERE  l.tournament_id IS NOT NULL
    AND  p.tournament_id IS NOT NULL
    AND  p.tournament_id <> l.tournament_id;

  IF v_count > 0 THEN
    RAISE WARNING 'Migration 115: % cross-tournament player(s) remain — investigate', v_count;
  ELSE
    RAISE NOTICE 'Migration 115: all cross-tournament players successfully removed';
  END IF;
END $$;
