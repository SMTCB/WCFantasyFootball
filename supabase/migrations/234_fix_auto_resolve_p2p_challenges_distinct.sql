-- Migration 234: fix auto_resolve_p2p_challenges() — invalid FOR UPDATE + DISTINCT
--
-- Postgres does not allow FOR UPDATE together with DISTINCT (or GROUP BY, HAVING,
-- window functions, set ops). The batch resolver (migration 205) has selected
-- `DISTINCT c.*` since it was written, so every run of the resolve-p2p-challenges
-- cron (every 5 min) has thrown "FOR UPDATE is not allowed with DISTINCT clause"
-- and rolled back before resolving a single challenge — confirmed live in prod
-- since 2026-06-24 (8,571 failed runs as of this fix), pre-dating the v2->main
-- cutover. No P2P challenge has ever auto-resolved.
--
-- The DISTINCT was never doing anything: the query selects from a single table
-- (p2p_challenges c) filtered by an EXISTS subquery, which cannot fan out rows —
-- every row is already unique by primary key. Removing DISTINCT is a pure syntax
-- fix with no behavior change.

CREATE OR REPLACE FUNCTION auto_resolve_p2p_challenges()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ch     p2p_challenges;
  v_count  int := 0;
  v_result jsonb;
BEGIN
  FOR v_ch IN
    SELECT c.*
    FROM p2p_challenges c
    WHERE c.status = 'accepted'
      AND EXISTS (
        -- Matchday settled for this league
        SELECT 1 FROM gazette_entries ge
        WHERE ge.league_id  = c.league_id
          AND ge.entry_type = 'activity'
          AND ge.full_data->>'matchday_id' = c.matchday_id
      )
    ORDER BY c.created_at
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      v_result := resolve_p2p_challenge(v_ch.id);
      v_count  := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'auto_resolve_p2p_challenges: failed for challenge %: %', v_ch.id, SQLERRM;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION auto_resolve_p2p_challenges() FROM public, authenticated, anon;
