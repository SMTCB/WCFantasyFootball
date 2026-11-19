-- Migration 312: S15 — people in the Room feed (C-09), reactions (C-10), friend notices (C-12).
-- Additive: widens one CHECK, adds one table, five trigger functions. Nothing is dropped or rewritten.
-- Every trigger swallows its own errors so a join, bet or edition is never blocked by the Room.

BEGIN;

-- ── A. Room messages: a "member_activity" kind (joins, new edition) ──────────
ALTER TABLE clubhouse_messages DROP CONSTRAINT IF EXISTS clubhouse_messages_kind_check;
ALTER TABLE clubhouse_messages
  ADD CONSTRAINT clubhouse_messages_kind_check CHECK (kind IN ('text', 'bet_activity', 'member_activity'));

CREATE OR REPLACE FUNCTION post_member_activity_message(
  p_circle_id uuid, p_user_id uuid, p_content text, p_ref jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_channel_id uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_channel_id FROM clubhouse_channels
  WHERE circle_id = p_circle_id AND is_default = true LIMIT 1;
  IF v_channel_id IS NULL OR p_user_id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO clubhouse_messages (channel_id, user_id, content, kind, bet_ref)
  VALUES (v_channel_id, p_user_id, p_content, 'member_activity', p_ref)
  RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION post_member_activity_message(uuid, uuid, text, jsonb) FROM public, authenticated, anon;

-- A1. Someone joins a Clubhouse (the owner row made at creation is skipped).
CREATE OR REPLACE FUNCTION trg_room_member_joined()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_msg uuid;
BEGIN
  IF NEW.role = 'owner' THEN RETURN NEW; END IF;
  v_msg := post_member_activity_message(NEW.circle_id, NEW.user_id, 'joined the Clubhouse',
    jsonb_build_object('event', 'joined'));

  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  SELECT NEW.circle_id, cm.user_id, 'clubhouse', NEW.circle_id, 'friend_joined',
         jsonb_build_object('actor_id', NEW.user_id, 'message_id', v_msg)
  FROM circle_members cm
  WHERE cm.circle_id = NEW.circle_id AND cm.user_id <> NEW.user_id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_room_member_joined ON circle_members;
CREATE TRIGGER trg_room_member_joined AFTER INSERT ON circle_members
  FOR EACH ROW EXECUTE FUNCTION trg_room_member_joined();

-- A2. Someone takes a bet (the creator's own row is skipped); the creator gets a notice.
CREATE OR REPLACE FUNCTION trg_room_bet_taken()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_bet record;
  v_channel uuid;
  v_msg uuid;
BEGIN
  SELECT id, circle_id, creator_id, question, stake_coins INTO v_bet FROM p2p_bets WHERE id = NEW.bet_id;
  IF v_bet.id IS NULL OR v_bet.circle_id IS NULL OR NEW.user_id = v_bet.creator_id THEN RETURN NEW; END IF;

  SELECT id INTO v_channel FROM clubhouse_channels WHERE circle_id = v_bet.circle_id AND is_default = true LIMIT 1;
  IF v_channel IS NULL THEN RETURN NEW; END IF;

  INSERT INTO clubhouse_messages (channel_id, user_id, content, kind, bet_ref)
  VALUES (v_channel, NEW.user_id, 'took the bet: ' || left(v_bet.question, 200), 'bet_activity',
    jsonb_build_object('ref_kind', 'bet', 'ref_id', v_bet.id, 'event', 'taken',
                       'question', v_bet.question, 'stake_coins', v_bet.stake_coins))
  RETURNING id INTO v_msg;

  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  VALUES (v_bet.circle_id, v_bet.creator_id, 'clubhouse', v_bet.circle_id, 'friend_took_bet',
          jsonb_build_object('actor_id', NEW.user_id, 'message_id', v_msg, 'question', v_bet.question));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_room_bet_taken ON p2p_bet_participants;
CREATE TRIGGER trg_room_bet_taken AFTER INSERT ON p2p_bet_participants
  FOR EACH ROW EXECUTE FUNCTION trg_room_bet_taken();

-- A3. A new newspaper edition lands in the Room (the notice already exists from migration 196).
CREATE OR REPLACE FUNCTION trg_room_edition_posted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF NEW.circle_id IS NULL THEN RETURN NEW; END IF;
  SELECT user_id INTO v_owner FROM circle_members WHERE circle_id = NEW.circle_id AND role = 'owner' LIMIT 1;
  PERFORM post_member_activity_message(NEW.circle_id, v_owner,
    'New edition: ' || COALESCE(NULLIF(trim(NEW.headline), ''), 'the paper is out'),
    jsonb_build_object('event', 'edition', 'edition_date', NEW.edition_date));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_room_edition_posted ON frontpage_editions;
CREATE TRIGGER trg_room_edition_posted AFTER INSERT ON frontpage_editions
  FOR EACH ROW EXECUTE FUNCTION trg_room_edition_posted();

-- ── B. Reactions on Room messages ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clubhouse_reactions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid        NOT NULL REFERENCES clubhouse_messages(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES auth.users(id),
  emoji      text        NOT NULL CHECK (length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS ch_reactions_message_idx ON clubhouse_reactions (message_id);

ALTER TABLE clubhouse_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ch_reactions_member_read" ON clubhouse_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clubhouse_messages m
      JOIN clubhouse_channels cc ON cc.id = m.channel_id
      JOIN circle_members cm ON cm.circle_id = cc.circle_id
      WHERE m.id = clubhouse_reactions.message_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "ch_reactions_member_insert" ON clubhouse_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM clubhouse_messages m
      JOIN clubhouse_channels cc ON cc.id = m.channel_id
      JOIN circle_members cm ON cm.circle_id = cc.circle_id
      WHERE m.id = clubhouse_reactions.message_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "ch_reactions_own_delete" ON clubhouse_reactions
  FOR DELETE USING (auth.uid() = user_id);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE clubhouse_reactions;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ── C. Notice: someone reacted to your message ───────────────────────────────
CREATE OR REPLACE FUNCTION trg_room_reaction_notice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_author uuid;
  v_circle uuid;
BEGIN
  SELECT m.user_id, cc.circle_id INTO v_author, v_circle
  FROM clubhouse_messages m JOIN clubhouse_channels cc ON cc.id = m.channel_id
  WHERE m.id = NEW.message_id;
  IF v_author IS NULL OR v_author = NEW.user_id THEN RETURN NEW; END IF;

  INSERT INTO clubhouse_notifications (circle_id, user_id, source_type, source_id, type, payload)
  VALUES (v_circle, v_author, 'clubhouse', v_circle, 'friend_reacted',
          jsonb_build_object('actor_id', NEW.user_id, 'message_id', NEW.message_id, 'emoji', NEW.emoji));
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_room_reaction_notice ON clubhouse_reactions;
CREATE TRIGGER trg_room_reaction_notice AFTER INSERT ON clubhouse_reactions
  FOR EACH ROW EXECUTE FUNCTION trg_room_reaction_notice();

COMMIT;
