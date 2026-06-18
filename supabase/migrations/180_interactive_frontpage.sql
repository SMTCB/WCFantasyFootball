-- Migration 180: Interactive Frontpage
--
-- Three new tables for the Forza Times daily edition system:
--   frontpage_editions  — AI-generated content cached per league per day
--   frontpage_reactions — emoji reactions per member per section
--   frontpage_comments  — 140-char letters to the editor per section
--
-- Also adds 'classified' to gazette_entry_type enum for commissioner classifieds.

-- ── 1. gazette_entry_type: add 'classified' ────────────────────────────────────
ALTER TYPE gazette_entry_type ADD VALUE IF NOT EXISTS 'classified';

-- ── 2. frontpage_editions ─────────────────────────────────────────────────────
-- One row per league per calendar day. Upserted by the Edge Function on
-- the 05:00 UTC daily cron and on commissioner manual triggers.
-- is_manual = true + generated_at < 12h ago → cron skips this league that day.

CREATE TABLE IF NOT EXISTS public.frontpage_editions (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id        uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  edition_date     date        NOT NULL DEFAULT CURRENT_DATE,
  edition_number   int         NOT NULL DEFAULT 1,
  headline         text,
  deck             text,
  hot_take         text,
  wooden_spoon     text,
  transfer_rumour  text,
  raw_input        jsonb,
  is_manual        boolean     NOT NULL DEFAULT false,
  generated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, edition_date)
);

CREATE INDEX IF NOT EXISTS frontpage_editions_league_date
  ON public.frontpage_editions (league_id, edition_date DESC);

ALTER TABLE public.frontpage_editions ENABLE ROW LEVEL SECURITY;

-- League members can read their league's editions; service role writes (Edge Function bypasses RLS).
CREATE POLICY "frontpage_editions_member_select" ON public.frontpage_editions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = frontpage_editions.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- ── 3. frontpage_reactions ────────────────────────────────────────────────────
-- One row per (league, edition_date, section, user, emoji).
-- Toggle: insert to add, delete to remove.

CREATE TABLE IF NOT EXISTS public.frontpage_reactions (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  edition_date date        NOT NULL DEFAULT CURRENT_DATE,
  section_key  text        NOT NULL CHECK (section_key IN (
                             'lead', 'hot_take', 'transfers', 'scores', 'commissioner'
                           )),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji        text        NOT NULL CHECK (emoji IN ('🔥', '💀', '😂', '👑', '😤')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, edition_date, section_key, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS frontpage_reactions_lookup
  ON public.frontpage_reactions (league_id, edition_date, section_key);

ALTER TABLE public.frontpage_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frontpage_reactions_select" ON public.frontpage_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = frontpage_reactions.league_id
        AND lm.user_id   = auth.uid()
    )
  );

CREATE POLICY "frontpage_reactions_insert" ON public.frontpage_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = frontpage_reactions.league_id
        AND lm.user_id   = auth.uid()
    )
  );

CREATE POLICY "frontpage_reactions_delete" ON public.frontpage_reactions
  FOR DELETE USING (auth.uid() = user_id);

-- ── 4. frontpage_comments ─────────────────────────────────────────────────────
-- 140-char "Letters to the Editor" per section.
-- Members write their own; commissioner can delete any.

CREATE TABLE IF NOT EXISTS public.frontpage_comments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id    uuid        NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  edition_date date        NOT NULL DEFAULT CURRENT_DATE,
  section_key  text        NOT NULL CHECK (section_key IN (
                             'lead', 'hot_take', 'transfers', 'scores', 'commissioner'
                           )),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text         text        NOT NULL CHECK (char_length(text) BETWEEN 1 AND 140),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS frontpage_comments_lookup
  ON public.frontpage_comments (league_id, edition_date, section_key, created_at);

ALTER TABLE public.frontpage_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "frontpage_comments_select" ON public.frontpage_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = frontpage_comments.league_id
        AND lm.user_id   = auth.uid()
    )
  );

CREATE POLICY "frontpage_comments_insert" ON public.frontpage_comments
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = frontpage_comments.league_id
        AND lm.user_id   = auth.uid()
    )
  );

-- Owner or commissioner can delete
CREATE POLICY "frontpage_comments_delete" ON public.frontpage_comments
  FOR DELETE USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = frontpage_comments.league_id
        AND lm.user_id   = auth.uid()
        AND lm.role      = 'commissioner'
    )
  );
