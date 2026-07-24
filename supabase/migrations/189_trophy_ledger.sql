-- Migration 189: Trophy ledger stub
-- Phase 0 of the v2 sale-ready build.
-- Append-only ledger of trophies awarded to users across all sports and leagues
-- within a circle. Emitted by sport modules via SECURITY DEFINER helpers —
-- no direct client writes ever.
-- FULLY ADDITIVE: one new table + one new RPC stub.
-- Zero changes to any existing table, column, index, policy, or function.

BEGIN;

-- ─── 1. trophy_ledger ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trophy_ledger (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  circle_id     uuid        NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  league_id     uuid        NOT NULL REFERENCES leagues(id),
  user_id       uuid        NOT NULL REFERENCES auth.users(id),
  sport_id      uuid        NOT NULL REFERENCES sports(id),
  tournament_id uuid        NOT NULL REFERENCES tournaments(id),
  trophy_type   text        NOT NULL
                            CHECK (trophy_type IN ('round_win', 'event_win', 'season_win')),
  tier          text                     -- nullable: 'bronze' | 'silver' | 'gold'
                            CHECK (tier IS NULL OR tier IN ('bronze', 'silver', 'gold')),
  awarded_at    timestamptz NOT NULL DEFAULT now(),
  meta          jsonb       NOT NULL DEFAULT '{}'
);

-- Index — meta-standings query groups by circle + user
CREATE INDEX IF NOT EXISTS idx_trophy_ledger_circle_user
  ON trophy_ledger (circle_id, user_id);

-- RLS: circle members can read trophies in their circle.
-- No direct INSERT — sport modules write via SECURITY DEFINER helpers only.
ALTER TABLE trophy_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trophy_ledger_member_read" ON trophy_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM circle_members
      WHERE circle_members.circle_id = trophy_ledger.circle_id
        AND circle_members.user_id   = auth.uid()
    )
  );

-- ─── 2. get_circle_meta_standings(p_circle_id) RPC stub ──────────────────────
-- v1 formula: total trophy count per user, ranked descending.
-- The formula inside this function is the designed swap point — replace the
-- SELECT body to change how trophies are weighted without any schema change.

CREATE OR REPLACE FUNCTION get_circle_meta_standings(p_circle_id uuid)
RETURNS TABLE (
  user_id       uuid,
  username      text,
  trophy_count  bigint,
  gold_count    bigint,
  silver_count  bigint,
  bronze_count  bigint,
  rank          bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caller must be a member of this circle
  IF NOT EXISTS (
    SELECT 1 FROM circle_members
    WHERE circle_id = p_circle_id AND user_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  -- v1 formula: count trophies per user, break ties by gold → silver → bronze
  RETURN QUERY
  SELECT
    cm.user_id,
    u.username,
    COUNT(tl.id)                                              AS trophy_count,
    COUNT(tl.id) FILTER (WHERE tl.tier = 'gold')             AS gold_count,
    COUNT(tl.id) FILTER (WHERE tl.tier = 'silver')           AS silver_count,
    COUNT(tl.id) FILTER (WHERE tl.tier = 'bronze')           AS bronze_count,
    RANK() OVER (
      ORDER BY
        COUNT(tl.id)                                          DESC,
        COUNT(tl.id) FILTER (WHERE tl.tier = 'gold')         DESC,
        COUNT(tl.id) FILTER (WHERE tl.tier = 'silver')       DESC,
        COUNT(tl.id) FILTER (WHERE tl.tier = 'bronze')       DESC
    )                                                         AS rank
  FROM circle_members cm
  JOIN users u ON u.id = cm.user_id
  LEFT JOIN trophy_ledger tl
    ON  tl.circle_id = p_circle_id
    AND tl.user_id   = cm.user_id
  WHERE cm.circle_id = p_circle_id
  GROUP BY cm.user_id, u.username
  ORDER BY rank, u.username;
END;
$$;

COMMIT;
