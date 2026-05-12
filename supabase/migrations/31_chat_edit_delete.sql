-- Chat message edit/delete functionality

-- Add edit/delete tracking to chat_messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at timestamp with time zone;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- RPC: Edit a chat message (owner only)
CREATE OR REPLACE FUNCTION edit_chat_message(p_message_id uuid, p_new_text text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE chat_messages
  SET message = p_new_text, edited_at = now(), edited_by = auth.uid()
  WHERE id = p_message_id AND user_id = auth.uid() AND NOT is_deleted;

  RETURN FOUND;
END;
$$;

-- RPC: Delete a chat message (owner only, soft delete)
CREATE OR REPLACE FUNCTION delete_chat_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE chat_messages
  SET is_deleted = true, edited_at = now()
  WHERE id = p_message_id AND user_id = auth.uid();

  RETURN FOUND;
END;
$$;

-- Update RLS policies for edit/delete
CREATE POLICY "Edit own messages" ON chat_messages
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add index for deleted messages query optimization
CREATE INDEX IF NOT EXISTS idx_chat_messages_deleted ON chat_messages(is_deleted, league_id);
