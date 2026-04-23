-- Trade listings: managers can publicly mark players as available for swaps.
-- Visible to all league members when building a trade proposal.

CREATE TABLE IF NOT EXISTS trade_listings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID REFERENCES leagues(id)  ON DELETE CASCADE,
  user_id    UUID REFERENCES users(id)    ON DELETE CASCADE,
  player_id  TEXT REFERENCES players(id)  ON DELETE CASCADE,
  listed_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, user_id, player_id)
);

ALTER TABLE trade_listings DISABLE ROW LEVEL SECURITY;
