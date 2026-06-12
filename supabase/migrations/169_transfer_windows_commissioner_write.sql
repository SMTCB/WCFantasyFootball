-- Migration 169: commissioner write access on transfer_windows
--
-- Migration 66 (security hardening) enabled RLS on transfer_windows but only
-- added a SELECT policy for league members. No INSERT/UPDATE policy was ever
-- added, so every commissioner-initiated "open/close transfer window" action
-- (openTransferWindow, closeTransferWindow, openFreeWindow, closeFreeWindow
-- in CommissionerPanel.jsx / useCommissioner.js) has been silently rejected
-- by RLS since then — the table has zero rows in production.
--
-- This adds an INSERT and UPDATE policy for the league's commissioner,
-- following the same league_members role check used in migration 103
-- (gazette_entries commissioner insert policy).

DROP POLICY IF EXISTS "commissioners can insert transfer_windows" ON public.transfer_windows;
CREATE POLICY "commissioners can insert transfer_windows"
  ON public.transfer_windows
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_members.league_id = transfer_windows.league_id
        AND league_members.user_id   = auth.uid()
        AND league_members.role      = 'commissioner'
    )
  );

DROP POLICY IF EXISTS "commissioners can update transfer_windows" ON public.transfer_windows;
CREATE POLICY "commissioners can update transfer_windows"
  ON public.transfer_windows
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_members.league_id = transfer_windows.league_id
        AND league_members.user_id   = auth.uid()
        AND league_members.role      = 'commissioner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_members.league_id = transfer_windows.league_id
        AND league_members.user_id   = auth.uid()
        AND league_members.role      = 'commissioner'
    )
  );
