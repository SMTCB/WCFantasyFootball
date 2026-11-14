-- C-19: a bet opens as its own conversation. Room messages can be tied to one bet.
-- Additive only: two nullable columns, one check, one index. Existing rows and
-- policies are unchanged; the Room stream simply skips rows that have a thread.
ALTER TABLE clubhouse_messages
  ADD COLUMN IF NOT EXISTS thread_kind text,
  ADD COLUMN IF NOT EXISTS thread_id uuid;

ALTER TABLE clubhouse_messages
  ADD CONSTRAINT clubhouse_messages_thread_check CHECK (
    (thread_kind IS NULL AND thread_id IS NULL)
    OR (thread_kind IN ('bet', 'challenge') AND thread_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS clubhouse_messages_thread_idx
  ON clubhouse_messages (thread_kind, thread_id, created_at)
  WHERE thread_id IS NOT NULL;
