-- Migration 23: Player Availability Flags
-- Allows managers to flag players as "open for proposals"
-- Broadcast to league members that they're willing to discuss trades/offers

-- New table: player_availability_flags
CREATE TABLE IF NOT EXISTS player_availability_flags (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  squad_id uuid NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  flagged_at timestamp DEFAULT now(),
  expires_at timestamp DEFAULT (now() + interval '14 days'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Unique constraint: one flag per player per squad at a time
  CONSTRAINT unique_player_flag_per_squad UNIQUE (squad_id, player_id),

  -- Index for queries
  CONSTRAINT valid_expiry CHECK (expires_at > flagged_at)
);

-- Indexes for common queries
CREATE INDEX idx_player_flags_league_id ON player_availability_flags(league_id);
CREATE INDEX idx_player_flags_squad_id ON player_availability_flags(squad_id);
CREATE INDEX idx_player_flags_player_id ON player_availability_flags(player_id);
CREATE INDEX idx_player_flags_active ON player_availability_flags(expires_at)
  WHERE expires_at > now();

-- Enable RLS
ALTER TABLE player_availability_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone in a league can see flags for that league (broadcast)
CREATE POLICY "view_league_flags" ON player_availability_flags
  FOR SELECT USING (
    league_id IN (
      SELECT DISTINCT lm.league_id
      FROM league_members lm
      WHERE lm.user_id = auth.uid()
    )
  );

-- Only squad owner can flag their own players
CREATE POLICY "flag_own_players" ON player_availability_flags
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND squad_id IN (
      SELECT id FROM squads
      WHERE user_id = auth.uid()
    )
  );

-- Only creator can remove their own flags
CREATE POLICY "remove_own_flags" ON player_availability_flags
  FOR DELETE USING (
    created_by = auth.uid()
  );

-- Automatically expire flags older than 14 days (can query with WHERE expires_at > now())
