-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 197 — Tennis Module: Core tables + Player's Box + 2026 calendar
-- Sprint T-0 (Phase 2, v2 branch only — not deployed to main until Week 12)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Player's Box ──────────────────────────────────────────────────────────
-- Tennis group concept (analogous to Paddock for F1, League for football)

CREATE TABLE player_boxes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  invite_code text UNIQUE NOT NULL DEFAULT upper(substring(gen_random_uuid()::text, 1, 8)),
  created_by  uuid NOT NULL REFERENCES auth.users,
  season_year int  NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE player_box_members (
  player_box_id uuid NOT NULL REFERENCES player_boxes ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES auth.users,
  joined_at     timestamptz DEFAULT now(),
  PRIMARY KEY (player_box_id, user_id)
);

-- Links Player's Boxes into the cross-sport Circle layer (migration 188)
CREATE TABLE circle_player_boxes (
  circle_id     uuid NOT NULL REFERENCES circles ON DELETE CASCADE,
  player_box_id uuid NOT NULL REFERENCES player_boxes ON DELETE CASCADE,
  PRIMARY KEY (circle_id, player_box_id)
);

-- ── 2. Tennis seasons ────────────────────────────────────────────────────────

CREATE TABLE tennis_seasons (
  year               int PRIMARY KEY,
  ace_cards_per_user int NOT NULL DEFAULT 4
);

INSERT INTO tennis_seasons (year, ace_cards_per_user) VALUES (2026, 4);

-- ── 3. Enums ─────────────────────────────────────────────────────────────────

CREATE TYPE tennis_tournament_type AS ENUM ('grand_slam', 'masters_1000', 'atp_finals');
CREATE TYPE tennis_surface         AS ENUM ('hard', 'clay', 'grass', 'hard_indoor');

-- ── 4. Tournaments ───────────────────────────────────────────────────────────
-- external_id: API season ID from tennis-api-atp-wta-itf (e.g. 20340 for French Open 2025 season)
-- Populated once when admin syncs a tournament — NULL until then.
-- Status progression: upcoming → roster_open → in_progress → qf_captain_open → completed

CREATE TABLE tennis_tournaments (
  id                  uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
  season_year         int                    NOT NULL REFERENCES tennis_seasons,
  name                text                   NOT NULL,
  tournament_type     tennis_tournament_type NOT NULL,
  surface             tennis_surface         NOT NULL,
  draw_size           int                    NOT NULL DEFAULT 128,
  start_date          date                   NOT NULL,
  end_date            date                   NOT NULL,
  roster_lock_at      timestamptz,
  qf_window_opens_at  timestamptz,
  qf_window_closes_at timestamptz,
  status              text                   NOT NULL DEFAULT 'upcoming'
                      CHECK (status IN ('upcoming','roster_open','in_progress','qf_captain_open','completed')),
  sort_order          int                    NOT NULL,
  external_id         int,                   -- API tournament season ID; NULL until first sync
  created_at          timestamptz            DEFAULT now()
);

-- Seed 2026 ATP calendar (14 events; dates approximate, admin can correct before season start)
INSERT INTO tennis_tournaments
  (season_year, name, tournament_type, surface, draw_size, start_date, end_date, sort_order)
VALUES
  (2026, 'Australian Open', 'grand_slam',  'hard',        128, '2026-01-13', '2026-01-26',  1),
  (2026, 'Indian Wells',    'masters_1000','hard',          96, '2026-03-05', '2026-03-16',  2),
  (2026, 'Miami Open',      'masters_1000','hard',          96, '2026-03-19', '2026-03-30',  3),
  (2026, 'Monte-Carlo',     'masters_1000','clay',          64, '2026-04-06', '2026-04-13',  4),
  (2026, 'Madrid Open',     'masters_1000','clay',          64, '2026-04-24', '2026-05-03',  5),
  (2026, 'Italian Open',    'masters_1000','clay',          96, '2026-05-07', '2026-05-17',  6),
  (2026, 'French Open',     'grand_slam',  'clay',         128, '2026-05-25', '2026-06-07',  7),
  (2026, 'Wimbledon',       'grand_slam',  'grass',        128, '2026-06-29', '2026-07-12',  8),
  (2026, 'Canadian Open',   'masters_1000','hard',          64, '2026-07-24', '2026-08-02',  9),
  (2026, 'Cincinnati',      'masters_1000','hard',          64, '2026-08-14', '2026-08-23', 10),
  (2026, 'US Open',         'grand_slam',  'hard',         128, '2026-08-31', '2026-09-13', 11),
  (2026, 'Shanghai',        'masters_1000','hard',          96, '2026-10-04', '2026-10-12', 12),
  (2026, 'Paris Masters',   'masters_1000','hard',          64, '2026-10-30', '2026-11-08', 13),
  (2026, 'ATP Finals',      'atp_finals',  'hard_indoor',    8, '2026-11-15', '2026-11-22', 14);

-- ── 5. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE player_boxes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_box_members   ENABLE ROW LEVEL SECURITY;
ALTER TABLE circle_player_boxes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_seasons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_tournaments   ENABLE ROW LEVEL SECURITY;

-- player_boxes: any authenticated user can read; creator can update
CREATE POLICY "player_boxes_select" ON player_boxes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "player_boxes_insert" ON player_boxes
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "player_boxes_update" ON player_boxes
  FOR UPDATE TO authenticated USING (created_by = auth.uid());

-- player_box_members: box members can read their own box memberships; inserts via RPC only
CREATE POLICY "player_box_members_select" ON player_box_members
  FOR SELECT TO authenticated
  USING (
    player_box_id IN (
      SELECT player_box_id FROM player_box_members WHERE user_id = auth.uid()
    )
  );

-- circle_player_boxes: circle members can read
CREATE POLICY "circle_player_boxes_select" ON circle_player_boxes
  FOR SELECT TO authenticated
  USING (
    circle_id IN (
      SELECT circle_id FROM circle_members WHERE user_id = auth.uid()
    )
  );

-- tennis_seasons: all authenticated users can read
CREATE POLICY "tennis_seasons_select" ON tennis_seasons
  FOR SELECT TO authenticated USING (true);

-- tennis_tournaments: all authenticated users can read
CREATE POLICY "tennis_tournaments_select" ON tennis_tournaments
  FOR SELECT TO authenticated USING (true);

-- Admin (service role) can update tournaments (status transitions, external_id, dates)
CREATE POLICY "tennis_tournaments_service_update" ON tennis_tournaments
  FOR UPDATE TO service_role USING (true);

-- ── 6. RPCs ──────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_player_box(
  p_name        text,
  p_season_year int,
  p_circle_id   uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_box_id uuid;
  v_invite text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  INSERT INTO player_boxes (name, season_year, created_by)
  VALUES (p_name, p_season_year, auth.uid())
  RETURNING id, invite_code INTO v_box_id, v_invite;

  -- Creator is automatically a member
  INSERT INTO player_box_members (player_box_id, user_id)
  VALUES (v_box_id, auth.uid());

  -- Optionally link to a Circle
  IF p_circle_id IS NOT NULL THEN
    INSERT INTO circle_player_boxes (circle_id, player_box_id)
    VALUES (p_circle_id, v_box_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('player_box_id', v_box_id, 'invite_code', v_invite);
END;
$$;

CREATE OR REPLACE FUNCTION join_player_box_by_code(p_invite_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_box player_boxes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  SELECT * INTO v_box
  FROM player_boxes
  WHERE invite_code = upper(trim(p_invite_code));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_CODE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM player_box_members
    WHERE player_box_id = v_box.id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'ALREADY_MEMBER';
  END IF;

  INSERT INTO player_box_members (player_box_id, user_id)
  VALUES (v_box.id, auth.uid());

  RETURN jsonb_build_object('player_box_id', v_box.id, 'name', v_box.name);
END;
$$;

CREATE OR REPLACE FUNCTION get_my_player_boxes(p_season_year int DEFAULT NULL)
RETURNS TABLE (
  player_box_id uuid,
  name          text,
  invite_code   text,
  member_count  bigint,
  season_year   int,
  is_owner      boolean
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    pb.id,
    pb.name,
    pb.invite_code,
    COUNT(pbm2.user_id),
    pb.season_year,
    (pb.created_by = auth.uid())
  FROM player_boxes pb
  JOIN player_box_members pbm  ON pbm.player_box_id = pb.id AND pbm.user_id = auth.uid()
  LEFT JOIN player_box_members pbm2 ON pbm2.player_box_id = pb.id
  WHERE (p_season_year IS NULL OR pb.season_year = p_season_year)
  GROUP BY pb.id
  ORDER BY pb.created_at DESC;
END;
$$;
