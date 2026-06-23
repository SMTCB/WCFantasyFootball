-- Migration 193: Clubhouse social architecture — Phase 1E Sprint CH-0
-- Additive only: new tables, two new columns on circles, updated + new RPCs.
-- Zero changes to any existing football table, pilot data, or league_notifications.
-- Backup: backups/pre_ch0_circles_20260623.json + backups/pre_ch0_create_circle_fn_20260623.sql

BEGIN;

-- ─── 1. Extend circles table ─────────────────────────────────────────────────

ALTER TABLE circles
  ADD COLUMN IF NOT EXISTS p2p_betting_enabled bool NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_public           bool NOT NULL DEFAULT false;

-- ─── 2. clubhouse_channels ───────────────────────────────────────────────────
-- One per topic within a Clubhouse. "General" channel auto-created on circle creation.
-- Only Clubhouse owners can create channels; all members can read and post.

CREATE TABLE IF NOT EXISTS clubhouse_channels (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (length(trim(name)) > 0),
  is_default  bool        NOT NULL DEFAULT false,
  created_by  uuid        NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ch_channels_circle_idx ON clubhouse_channels (circle_id);

ALTER TABLE clubhouse_channels ENABLE ROW LEVEL SECURITY;

-- All Clubhouse members can read channels in their Clubhouse
CREATE POLICY "ch_channels_member_read" ON clubhouse_channels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM circle_members
      WHERE circle_id = clubhouse_channels.circle_id
        AND user_id = auth.uid()
    )
  );

-- Only Clubhouse owner can create channels
CREATE POLICY "ch_channels_owner_insert" ON clubhouse_channels
  FOR INSERT WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM circle_members
      WHERE circle_id = clubhouse_channels.circle_id
        AND user_id = auth.uid()
        AND role = 'owner'
    )
  );

-- ─── 3. clubhouse_messages ───────────────────────────────────────────────────
-- Messages within a channel. Any Clubhouse member can post; own messages deletable.

CREATE TABLE IF NOT EXISTS clubhouse_messages (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id  uuid        NOT NULL REFERENCES clubhouse_channels(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id),
  content     text        NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ch_messages_channel_idx ON clubhouse_messages (channel_id, created_at DESC);

ALTER TABLE clubhouse_messages ENABLE ROW LEVEL SECURITY;

-- Members of the channel's Clubhouse can read messages
CREATE POLICY "ch_messages_member_read" ON clubhouse_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM clubhouse_channels cc
      JOIN circle_members cm ON cm.circle_id = cc.circle_id
      WHERE cc.id = clubhouse_messages.channel_id
        AND cm.user_id = auth.uid()
    )
  );

-- Members can insert their own messages
CREATE POLICY "ch_messages_member_insert" ON clubhouse_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM clubhouse_channels cc
      JOIN circle_members cm ON cm.circle_id = cc.circle_id
      WHERE cc.id = clubhouse_messages.channel_id
        AND cm.user_id = auth.uid()
    )
  );

-- Authors can delete their own messages
CREATE POLICY "ch_messages_own_delete" ON clubhouse_messages
  FOR DELETE USING (auth.uid() = user_id);

-- ─── 4. direct_messages ──────────────────────────────────────────────────────
-- 1-to-1 messages between Clubhouse members. Scoped to a circle so the
-- relationship is always within a shared Clubhouse context.

CREATE TABLE IF NOT EXISTS direct_messages (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id    uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  from_user_id uuid        NOT NULL REFERENCES auth.users(id),
  to_user_id   uuid        NOT NULL REFERENCES auth.users(id),
  content      text        NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 2000),
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (from_user_id <> to_user_id)
);

-- Efficient lookup for a conversation thread between two users
CREATE INDEX IF NOT EXISTS dm_thread_idx ON direct_messages (circle_id, from_user_id, to_user_id, created_at DESC);
-- Efficient lookup for unread messages for a recipient
CREATE INDEX IF NOT EXISTS dm_unread_idx ON direct_messages (to_user_id, read_at) WHERE read_at IS NULL;

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Only participants can read their own DMs
CREATE POLICY "dm_participants_read" ON direct_messages
  FOR SELECT USING (
    auth.uid() = from_user_id OR auth.uid() = to_user_id
  );

-- Sender must be a Clubhouse member; recipient must also be a member
CREATE POLICY "dm_member_send" ON direct_messages
  FOR INSERT WITH CHECK (
    auth.uid() = from_user_id
    AND EXISTS (
      SELECT 1 FROM circle_members
      WHERE circle_id = direct_messages.circle_id AND user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM circle_members
      WHERE circle_id = direct_messages.circle_id AND user_id = direct_messages.to_user_id
    )
  );

-- Recipient can mark as read (UPDATE read_at only)
CREATE POLICY "dm_recipient_update" ON direct_messages
  FOR UPDATE USING (auth.uid() = to_user_id)
  WITH CHECK (auth.uid() = to_user_id);

-- ─── 5. clubhouse_notifications ──────────────────────────────────────────────
-- Replaces league_notifications for v2 users. league_notifications on main/pilot
-- is completely untouched. source_type + source_id allow deep-linking to the
-- correct sport/league on tap.

CREATE TABLE IF NOT EXISTS clubhouse_notifications (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id   uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id),
  source_type text        NOT NULL CHECK (source_type IN ('league','paddock','box','clubhouse')),
  source_id   uuid,
  type        text        NOT NULL,
  payload     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ch_notif_user_unread_idx ON clubhouse_notifications (user_id, read_at, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE clubhouse_notifications ENABLE ROW LEVEL SECURITY;

-- Users read and update (mark read) only their own notifications
CREATE POLICY "ch_notif_own_read" ON clubhouse_notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "ch_notif_own_update" ON clubhouse_notifications
  FOR UPDATE USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role inserts (written by RPCs and edge functions, not directly by client)
-- No client INSERT policy — notifications are server-authored only.

-- ─── 6. Update create_circle() — auto-create General channel ─────────────────

CREATE OR REPLACE FUNCTION create_circle(p_name text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_circle_id uuid;
  v_code      text;
  v_channel_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF length(trim(p_name)) = 0 THEN
    RETURN json_build_object('error', 'NAME_REQUIRED');
  END IF;

  INSERT INTO circles (name, created_by)
  VALUES (trim(p_name), v_user_id)
  RETURNING id, invite_code INTO v_circle_id, v_code;

  INSERT INTO circle_members (circle_id, user_id, role)
  VALUES (v_circle_id, v_user_id, 'owner');

  -- Auto-create the General channel every new Clubhouse gets
  INSERT INTO clubhouse_channels (circle_id, name, is_default, created_by)
  VALUES (v_circle_id, 'General', true, v_user_id)
  RETURNING id INTO v_channel_id;

  RETURN json_build_object(
    'circle_id',      v_circle_id,
    'invite_code',    v_code,
    'general_channel_id', v_channel_id
  );
END;
$$;

-- ─── 7. get_clubhouse_competitions(p_circle_id) ───────────────────────────────
-- Returns all competitions linked to a Clubhouse, grouped by sport.
-- Tennis returns null until Sprint T-0 adds circle_player_boxes.

CREATE OR REPLACE FUNCTION get_clubhouse_competitions(p_circle_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = auth.uid()
  ) THEN
    RETURN json_build_object('error', 'NOT_MEMBER');
  END IF;

  RETURN json_build_object(
    'football', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',     l.id,
        'name',   l.name,
        'format', l.format,
        'sport',  'football'
      ) ORDER BY l.name), '[]'::json)
      FROM circle_leagues cl
      JOIN leagues l ON l.id = cl.league_id
      WHERE cl.circle_id = p_circle_id
    ),
    'f1', (
      SELECT COALESCE(json_agg(json_build_object(
        'id',    p.id,
        'name',  p.name,
        'sport', 'f1'
      ) ORDER BY p.name), '[]'::json)
      FROM circle_paddocks cp
      JOIN paddocks p ON p.id = cp.paddock_id
      WHERE cp.circle_id = p_circle_id
    ),
    'tennis', '[]'::json
  );
END;
$$;

-- ─── 8. search_clubhouses(p_query) ───────────────────────────────────────────
-- Finds public Clubhouses by name. Caller need not be a member.
-- Returns whether the caller is already a member (to show Join vs Enter button).

CREATE OR REPLACE FUNCTION search_clubhouses(p_query text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF length(trim(p_query)) < 2 THEN
    RETURN json_build_object('error', 'QUERY_TOO_SHORT');
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(json_build_object(
        'id',             c.id,
        'name',           c.name,
        'invite_code',    c.invite_code,
        'member_count',   (SELECT COUNT(*) FROM circle_members cm WHERE cm.circle_id = c.id),
        'already_member', EXISTS (
          SELECT 1 FROM circle_members cm2
          WHERE cm2.circle_id = c.id AND cm2.user_id = auth.uid()
        )
      ) ORDER BY c.name)
      FROM circles c
      WHERE c.is_public = true
        AND c.name ILIKE '%' || trim(p_query) || '%'
      LIMIT 20
    ),
    '[]'::json
  );
END;
$$;

-- ─── 9. link_competition_to_clubhouse(p_circle_id, p_type, p_competition_id) ──
-- Called by LeagueCreationWizard after create_league / create_paddock succeeds.
-- Avoids modifying the complex existing create_league / create_paddock RPCs.
-- Only the Clubhouse owner can link competitions.

CREATE OR REPLACE FUNCTION link_competition_to_clubhouse(
  p_circle_id      uuid,
  p_type           text,
  p_competition_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN json_build_object('error', 'UNAUTHENTICATED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id
      AND user_id = v_user_id
      AND role = 'owner'
  ) THEN
    RETURN json_build_object('error', 'NOT_OWNER');
  END IF;

  IF p_type = 'league' THEN
    INSERT INTO circle_leagues (circle_id, league_id)
    VALUES (p_circle_id, p_competition_id)
    ON CONFLICT DO NOTHING;

  ELSIF p_type = 'paddock' THEN
    INSERT INTO circle_paddocks (circle_id, paddock_id)
    VALUES (p_circle_id, p_competition_id)
    ON CONFLICT DO NOTHING;

  ELSE
    RETURN json_build_object('error', 'INVALID_TYPE');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

COMMIT;
