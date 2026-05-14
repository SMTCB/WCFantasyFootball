-- Migration 35: Bet Notifications System
-- Notifies league members when commissioners create new bets
-- Realtime badge updates via league_notifications table

-- ─── 1. Notifications Table ────────────────────────────────────────────────
CREATE TABLE league_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- 'bet_created'
  triggered_by_user_id UUID REFERENCES users(id), -- commissioner who created bet
  title TEXT NOT NULL, -- e.g., "New Bet: Who scores first?"
  description TEXT, -- e.g., "Deadline: 14:30 UTC"
  related_entity_id UUID, -- bet_instance_id
  related_entity_type TEXT, -- 'bet_instance'
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Indexes ───────────────────────────────────────────────────────────
CREATE INDEX idx_league_notifications_user_league
  ON league_notifications(user_id, league_id);

CREATE INDEX idx_league_notifications_league_created
  ON league_notifications(league_id, created_at DESC);

CREATE INDEX idx_league_notifications_read
  ON league_notifications(user_id, is_read);

-- ─── 3. Row-Level Security (RLS) ───────────────────────────────────────────
ALTER TABLE league_notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications"
  ON league_notifications
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only update their own is_read status
CREATE POLICY "Users can update own notification read status"
  ON league_notifications
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── 4. RPC: Get Unread Notification Count ─────────────────────────────────
CREATE FUNCTION get_unread_notification_count(p_league_id UUID)
RETURNS INT AS $$
SELECT COUNT(*)::INT
FROM league_notifications
WHERE user_id = auth.uid()
  AND league_id = p_league_id
  AND is_read = false;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ─── 5. RPC: Mark Notification as Read ─────────────────────────────────────
CREATE FUNCTION mark_notification_read(p_notification_id UUID)
RETURNS void AS $$
UPDATE league_notifications
SET is_read = true, updated_at = NOW()
WHERE id = p_notification_id
  AND user_id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER;

-- ─── 6. RPC: Clear All Unread Notifications for League ──────────────────────
CREATE FUNCTION mark_all_notifications_read(p_league_id UUID)
RETURNS void AS $$
UPDATE league_notifications
SET is_read = true, updated_at = NOW()
WHERE user_id = auth.uid()
  AND league_id = p_league_id
  AND is_read = false;
$$ LANGUAGE SQL SECURITY DEFINER;

-- ─── 7. Trigger Function: Create Notifications on Bet Creation ───────────────
CREATE FUNCTION notify_league_on_bet_creation()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notification for each league member (excluding commissioner)
  INSERT INTO league_notifications (
    league_id,
    user_id,
    notification_type,
    triggered_by_user_id,
    title,
    description,
    related_entity_id,
    related_entity_type
  )
  SELECT
    NEW.league_id,
    lm.user_id,
    'bet_created',
    auth.uid(), -- Current user (commissioner)
    NEW.title,
    CONCAT('Deadline: ', to_char(NEW.deadline_at, 'HH24:MI UTC')),
    NEW.id,
    'bet_instance'
  FROM league_members lm
  WHERE lm.league_id = NEW.league_id
    AND lm.user_id != auth.uid(); -- Exclude commissioner from own notification

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 8. Trigger: Auto-Notify on Bet Creation ──────────────────────────────
CREATE TRIGGER trigger_bet_creation_notification
AFTER INSERT ON bet_instances
FOR EACH ROW
WHEN (NEW.status = 'open')
EXECUTE FUNCTION notify_league_on_bet_creation();

-- ─── 9. Realtime Setup ─────────────────────────────────────────────────────
-- Enable Realtime replication for league_notifications table
ALTER TABLE league_notifications REPLICA IDENTITY FULL;
