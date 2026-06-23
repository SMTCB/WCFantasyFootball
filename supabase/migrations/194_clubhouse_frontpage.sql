-- Migration 194: Clubhouse Frontpage
--
-- Extends frontpage_editions/reactions/comments to support Clubhouse-level editions.
-- league_id becomes nullable so a circle edition can exist without a league.
-- circle_id added to all three tables.
-- New partial unique indexes + RLS policies for circle membership.

-- 1. Make league_id nullable on all three tables
ALTER TABLE frontpage_editions  ALTER COLUMN league_id DROP NOT NULL;
ALTER TABLE frontpage_reactions ALTER COLUMN league_id DROP NOT NULL;
ALTER TABLE frontpage_comments  ALTER COLUMN league_id DROP NOT NULL;

-- 2. Add circle_id (nullable) to all three tables
ALTER TABLE frontpage_editions
  ADD COLUMN IF NOT EXISTS circle_id uuid REFERENCES circles(id) ON DELETE CASCADE;
ALTER TABLE frontpage_reactions
  ADD COLUMN IF NOT EXISTS circle_id uuid REFERENCES circles(id) ON DELETE CASCADE;
ALTER TABLE frontpage_comments
  ADD COLUMN IF NOT EXISTS circle_id uuid REFERENCES circles(id) ON DELETE CASCADE;

-- 3. Scope check: at least one of league_id or circle_id must be set
ALTER TABLE frontpage_editions
  ADD CONSTRAINT editions_scope_check CHECK (league_id IS NOT NULL OR circle_id IS NOT NULL);
ALTER TABLE frontpage_reactions
  ADD CONSTRAINT reactions_scope_check CHECK (league_id IS NOT NULL OR circle_id IS NOT NULL);
ALTER TABLE frontpage_comments
  ADD CONSTRAINT comments_scope_check CHECK (league_id IS NOT NULL OR circle_id IS NOT NULL);

-- 4. Unique index for circle editions (mirrors UNIQUE(league_id, edition_date))
CREATE UNIQUE INDEX IF NOT EXISTS frontpage_editions_circle_date
  ON frontpage_editions(circle_id, edition_date)
  WHERE circle_id IS NOT NULL;

-- 5. Replace frontpage_reactions UNIQUE constraint with two partial indexes.
--    PostgreSQL treats NULLs as distinct in UNIQUE constraints so the old
--    single constraint would allow duplicates once league_id is nullable.
ALTER TABLE frontpage_reactions
  DROP CONSTRAINT IF EXISTS frontpage_reactions_league_id_edition_date_section_key_user_id_emoji_key;
CREATE UNIQUE INDEX IF NOT EXISTS frontpage_reactions_league_unique
  ON frontpage_reactions(league_id, edition_date, section_key, user_id, emoji)
  WHERE league_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS frontpage_reactions_circle_unique
  ON frontpage_reactions(circle_id, edition_date, section_key, user_id, emoji)
  WHERE circle_id IS NOT NULL;

-- 6. Lookup index for circle reactions/comments
CREATE INDEX IF NOT EXISTS frontpage_reactions_circle_lookup
  ON frontpage_reactions(circle_id, edition_date, section_key)
  WHERE circle_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS frontpage_comments_circle_lookup
  ON frontpage_comments(circle_id, edition_date, section_key, created_at)
  WHERE circle_id IS NOT NULL;

-- 7. RLS policies for circle editions
--    Existing league policies remain; these handle the circle_id IS NOT NULL case.

CREATE POLICY "frontpage_editions_circle_select" ON frontpage_editions
  FOR SELECT USING (
    circle_id IS NULL
    OR EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = frontpage_editions.circle_id
        AND cm.user_id   = auth.uid()
    )
  );

CREATE POLICY "frontpage_reactions_circle_select" ON frontpage_reactions
  FOR SELECT USING (
    circle_id IS NULL
    OR EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = frontpage_reactions.circle_id
        AND cm.user_id   = auth.uid()
    )
  );

CREATE POLICY "frontpage_reactions_circle_insert" ON frontpage_reactions
  FOR INSERT WITH CHECK (
    circle_id IS NULL
    OR (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM circle_members cm
        WHERE cm.circle_id = frontpage_reactions.circle_id
          AND cm.user_id   = auth.uid()
      )
    )
  );

CREATE POLICY "frontpage_comments_circle_select" ON frontpage_comments
  FOR SELECT USING (
    circle_id IS NULL
    OR EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = frontpage_comments.circle_id
        AND cm.user_id   = auth.uid()
    )
  );

CREATE POLICY "frontpage_comments_circle_insert" ON frontpage_comments
  FOR INSERT WITH CHECK (
    circle_id IS NULL
    OR (
      auth.uid() = user_id
      AND EXISTS (
        SELECT 1 FROM circle_members cm
        WHERE cm.circle_id = frontpage_comments.circle_id
          AND cm.user_id   = auth.uid()
      )
    )
  );

-- Owner can delete any comment in their circle
CREATE POLICY "frontpage_comments_circle_delete" ON frontpage_comments
  FOR DELETE USING (
    circle_id IS NULL
    OR auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM circle_members cm
      WHERE cm.circle_id = frontpage_comments.circle_id
        AND cm.user_id   = auth.uid()
        AND cm.role      = 'owner'
    )
  );
