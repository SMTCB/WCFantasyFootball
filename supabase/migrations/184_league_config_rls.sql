-- Migration 184: RLS policies for league_config
-- league_config had RLS enabled (migration 66) but no policies, making it
-- completely inaccessible to all client operations. PIN QUOTE and other
-- league_config writes from CommissionerPanel were silently failing.

-- Members can read their own league's config
CREATE POLICY league_config_member_read ON league_config
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = league_config.league_id
        AND lm.user_id = auth.uid()
    )
  );

-- Commissioners can write (insert/update) their own league's config
CREATE POLICY league_config_commissioner_write ON league_config
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = league_config.league_id
        AND lm.user_id = auth.uid()
        AND lm.role = 'commissioner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM league_members lm
      WHERE lm.league_id = league_config.league_id
        AND lm.user_id = auth.uid()
        AND lm.role = 'commissioner'
    )
  );
