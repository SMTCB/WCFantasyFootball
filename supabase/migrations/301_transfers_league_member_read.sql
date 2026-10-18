-- Migration 301: let league members read every transfer in their league.
--
-- The Market report tab (MarketReportView) shows league-wide transfer
-- activity, but the only SELECT policy on transfers was "users read own
-- transfers" (migration 66), so each manager saw only their own rows and the
-- report looked empty. RLS policies are OR-ed, so the own-rows policy stays.
-- Writes are unchanged (server-side RPCs only).

DROP POLICY IF EXISTS "league members read league transfers" ON public.transfers;
CREATE POLICY "league members read league transfers"
  ON public.transfers
  FOR SELECT
  TO authenticated
  USING (public.is_league_member(league_id));
