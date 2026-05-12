-- Chat read status tracking for unread badge feature

-- Table to track when users last viewed each league's chat
CREATE TABLE IF NOT EXISTS league_chat_read_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(league_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_league_chat_read_status_user_league ON league_chat_read_status(user_id, league_id);

-- Enable RLS
ALTER TABLE league_chat_read_status ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only view/update their own read status
CREATE POLICY "View own chat read status" ON league_chat_read_status
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Update own chat read status" ON league_chat_read_status
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Insert own chat read status" ON league_chat_read_status
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- RPC: Mark all messages in a league as read for current user
CREATE OR REPLACE FUNCTION mark_league_chat_read(p_league_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO league_chat_read_status (league_id, user_id, last_read_at)
  VALUES (p_league_id, auth.uid(), now())
  ON CONFLICT (league_id, user_id)
  DO UPDATE SET last_read_at = now();
END;
$$;

-- RPC: Get unread message count for a league
CREATE OR REPLACE FUNCTION get_unread_chat_count(p_league_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_unread_count integer;
  v_last_read_at timestamp with time zone;
BEGIN
  -- Get user's last read timestamp for this league
  SELECT last_read_at INTO v_last_read_at
  FROM league_chat_read_status
  WHERE league_id = p_league_id AND user_id = auth.uid();

  -- If no read status exists, all messages are unread
  IF v_last_read_at IS NULL THEN
    SELECT COUNT(*) INTO v_unread_count
    FROM chat_messages
    WHERE league_id = p_league_id;
  ELSE
    -- Count messages created after last read time
    SELECT COUNT(*) INTO v_unread_count
    FROM chat_messages
    WHERE league_id = p_league_id AND created_at > v_last_read_at;
  END IF;

  RETURN COALESCE(v_unread_count, 0);
END;
$$;
