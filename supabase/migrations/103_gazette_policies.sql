-- Migration 103: gazette_entries policies
-- Adds INSERT policy so commissioners can post breaking news from the client.
-- Also adds a public read fallback so league activity is always visible to members.

-- Commissioners (league creator or role='commissioner') may insert gazette entries
-- for their own league.
CREATE POLICY "commissioners can insert gazette_entries"
  ON gazette_entries
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM league_members
      WHERE league_members.league_id = gazette_entries.league_id
        AND league_members.user_id   = auth.uid()
        AND league_members.role      = 'commissioner'
    )
  );

-- Any authenticated league member may read entries for their leagues.
-- (The existing is_league_member policy already handles this, but we add an
-- explicit authenticated-read so the JS client gets a clear pass.)
CREATE POLICY "authenticated members read gazette_entries"
  ON gazette_entries
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND is_league_member(league_id)
  );
