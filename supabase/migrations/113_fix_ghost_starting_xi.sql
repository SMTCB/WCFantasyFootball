-- Migration 113: Fix squads where starting_xi contains IDs not in squad.players
--
-- Root cause: when a squad was rebuilt or transferred between leagues, some
-- starting_xi entries reference player IDs that are no longer in the squad's
-- players[] array ("ghost IDs").  These ghost IDs are silently skipped when
-- the client fetches players (using .in('id', squad.players)), so the
-- starting XI renders fewer than 11 players on the pitch.
--
-- Example: s.t.c.braganca WC_1 squad had 3 ghost IDs in starting_xi
-- (fp-2545-429, fp-214703-429, fp-499136-429) resulting in only 9 visible
-- players despite xi_length = 11 in the DB.
--
-- Fix: for any squad where starting_xi contains at least one ID absent from
-- squad.players[], rebuild starting_xi from squad.players sorted GK-first.

UPDATE squads s
SET starting_xi = (
  SELECT ARRAY_AGG(id)
  FROM (
    SELECT id FROM players
    WHERE id = ANY(s.players)
    ORDER BY (position = 'GK') DESC, array_position(s.players, id)
    LIMIT 11
  ) sub
)
WHERE
  array_length(s.players, 1) >= 11
  AND EXISTS (
    SELECT 1 FROM unnest(s.starting_xi) xi_id
    WHERE xi_id != ALL(s.players)
  );
