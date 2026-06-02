-- Migration 117: Allow users to update their own draft_allocations row
-- Needed for DraftRecoveryScreen, which writes FCFS picks back to draft_allocations
-- from the client. Service role writes the initial allocation; users extend it during recovery.
-- Scoped to own row only (user_id = auth.uid()).

CREATE POLICY "Users can update their own draft allocation"
  ON draft_allocations
  FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
