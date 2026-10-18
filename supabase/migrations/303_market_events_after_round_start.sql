-- Migration 303: Market report only reveals a round's transfers once that
-- round has started, so rivals can't scout each other's moves mid-window.
--
-- Replaces get_league_market_events (migration 302; same signature/return
-- type). A transfer event belongs to the round in its matchday_id ('623-r3').
-- Round start = matchday_deadlines.deadline_at for that matchday; leagues
-- without one fall back to the league's transfer_windows.closes_at for the same
-- round number. With neither, the event stays hidden. This applies to every
-- caller, including the manager who made the transfer (their own moves are
-- visible on their Squad screen).

CREATE OR REPLACE FUNCTION public.get_league_market_events(p_league_id uuid)
RETURNS TABLE (
  id          uuid,
  user_id     uuid,
  event_type  text,
  matchday_id text,
  player_in   text,
  player_out  text,
  price       numeric,
  event_at    timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_league_member(p_league_id) THEN
    RAISE EXCEPTION 'not a member of this league';
  END IF;

  RETURN QUERY
  SELECT e.id, e.user_id, e.event_type, e.matchday_id, e.player_in, e.player_out,
         NULLIF(e.meta ->> 'price', '')::numeric, e.event_at
    FROM public.squad_events e
    LEFT JOIN LATERAL (
      SELECT d.deadline_at
        FROM public.matchday_deadlines d
       WHERE d.matchday_id = e.matchday_id
       ORDER BY d.deadline_at
       LIMIT 1
    ) md ON true
    LEFT JOIN LATERAL (
      SELECT w.closes_at
        FROM public.transfer_windows w
       WHERE w.league_id = e.league_id
         AND w.round_number = NULLIF(substring(e.matchday_id from '-r(\d+)$'), '')::int
       ORDER BY w.closes_at
       LIMIT 1
    ) tw ON true
   WHERE e.league_id = p_league_id
     AND e.event_type IN ('transfer_buy', 'transfer_sell')
     AND COALESCE(md.deadline_at, tw.closes_at) <= now()
   ORDER BY e.event_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_league_market_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_league_market_events(uuid) TO authenticated;
