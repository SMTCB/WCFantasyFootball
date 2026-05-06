-- Migration 24: League Chat / In-League Messaging
-- Adds real-time chat infrastructure for league communication

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create index for league queries
CREATE INDEX IF NOT EXISTS idx_chat_messages_league_id ON chat_messages(league_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at DESC);

-- Enable RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policy: View all messages in leagues you're a member of
CREATE POLICY "View league chat messages" ON chat_messages
  FOR SELECT
  USING (
    league_id IN (
      SELECT league_id FROM league_members WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Insert only your own messages
CREATE POLICY "Insert own chat messages" ON chat_messages
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND league_id IN (
      SELECT league_id FROM league_members WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Delete only your own messages
CREATE POLICY "Delete own chat messages" ON chat_messages
  FOR DELETE
  USING (
    user_id = auth.uid()
  );

-- Grant permissions to authenticated users
GRANT SELECT, INSERT ON chat_messages TO authenticated;
GRANT DELETE ON chat_messages TO authenticated;

-- Note: Realtime enabled via Supabase dashboard for this table
-- (Database → Replication → Enable for chat_messages)
