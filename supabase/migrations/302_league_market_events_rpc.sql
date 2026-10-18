-- Migration 302: league-wide transfer feed for the Market report tab.
--
-- Since migration 183, buys/sells are logged to squad_events
-- (transfer_buy / transfer_sell), not the legacy transfers table, which is no
-- longer written. MarketReportView therefore read an empty table. squad_events
-- RLS only exposes own rows (plus all rows to commissioners), and a blanket
-- member policy would also leak lineups/captains/bids, so expose only the
-- transfer events through a membership-checked SECURITY DEFINER function.
--
-- Note: the "league members read league transfers" policy from migration 301
-- targets the legacy table and is not needed by this feature; it is harmless.

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
   WHERE e.league_id = p_league_id
     AND e.event_type IN ('transfer_buy', 'transfer_sell')
   ORDER BY e.event_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_league_market_events(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_league_market_events(uuid) TO authenticated;
