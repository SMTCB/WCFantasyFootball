-- Chat mentions feature: @username tagging + notifications

-- Add mentioned_user_ids column to chat_messages to track who was @mentioned
ALTER TABLE chat_messages
ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_chat_messages_mentions ON chat_messages USING GIN (mentioned_user_ids);

-- RPC: Get all unread mentions for a user in a league
CREATE OR REPLACE FUNCTION get_unread_mentions(p_league_id uuid)
RETURNS TABLE(
  message_id uuid,
  sender_id uuid,
  sender_name text,
  message_text text,
  created_at timestamp with time zone,
  message_timestamp text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.user_id,
    u.user_metadata->>'display_name' as sender_name,
    m.message,
    m.created_at,
    to_char(m.created_at, 'HH24:MI') as message_timestamp
  FROM chat_messages m
  JOIN users u ON m.user_id = u.id
  WHERE
    m.league_id = p_league_id
    AND auth.uid() = ANY(m.mentioned_user_ids)
    AND m.created_at > COALESCE(
      (SELECT last_read_at FROM league_chat_read_status WHERE league_id = p_league_id AND user_id = auth.uid()),
      now() - interval '30 days'
    )
  ORDER BY m.created_at DESC
  LIMIT 50;
END;
$$;

-- RPC: Mark specific mention as read
CREATE OR REPLACE FUNCTION mark_mention_read(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update the message to remove current user from mentioned_user_ids
  UPDATE chat_messages
  SET mentioned_user_ids = array_remove(mentioned_user_ids, auth.uid())
  WHERE id = p_message_id;
END;
$$;
