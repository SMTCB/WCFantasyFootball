BEGIN;

-- Add is_admin flag to public.users (used by F1 admin panel)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

-- ── PADDOCKS (F1 equivalent of leagues) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS paddocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  season      integer NOT NULL DEFAULT 2026,
  invite_code text NOT NULL UNIQUE DEFAULT substring(gen_random_uuid()::text, 1, 8),
  created_by  uuid NOT NULL REFERENCES auth.users(id),
  sport_id    uuid NOT NULL REFERENCES sports(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE paddocks ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS paddock_members (
  paddock_id uuid NOT NULL REFERENCES paddocks(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id),
  role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','member')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (paddock_id, user_id)
);
ALTER TABLE paddock_members ENABLE ROW LEVEL SECURITY;

-- Junction: circles ↔ paddocks
CREATE TABLE IF NOT EXISTS circle_paddocks (
  circle_id  uuid NOT NULL REFERENCES circles(id) ON DELETE CASCADE,
  paddock_id uuid NOT NULL REFERENCES paddocks(id) ON DELETE CASCADE,
  added_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (circle_id, paddock_id)
);
ALTER TABLE circle_paddocks ENABLE ROW LEVEL SECURITY;

-- All tables created — RLS policies below (sibling-table references safe now)
CREATE POLICY "paddocks_member_read" ON paddocks FOR SELECT
  USING (EXISTS (SELECT 1 FROM paddock_members pm WHERE pm.paddock_id = id AND pm.user_id = auth.uid()));

CREATE POLICY "paddock_members_member_read" ON paddock_members FOR SELECT
  USING (EXISTS (SELECT 1 FROM paddock_members pm WHERE pm.paddock_id = paddock_members.paddock_id AND pm.user_id = auth.uid()));

CREATE POLICY "circle_paddocks_member_read" ON circle_paddocks FOR SELECT
  USING (EXISTS (SELECT 1 FROM circle_members cm WHERE cm.circle_id = circle_paddocks.circle_id AND cm.user_id = auth.uid()));

-- ── F1 RACES (season calendar + results store) ───────────────────────────────
CREATE TABLE IF NOT EXISTS f1_races (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season                     integer NOT NULL DEFAULT 2026,
  round_number               integer NOT NULL CHECK (round_number BETWEEN 1 AND 24),
  gp_name                    text NOT NULL,
  circuit                    text NOT NULL,
  race_date                  date NOT NULL,
  is_saturday                boolean NOT NULL DEFAULT false,
  qualifying_at              timestamptz,
  race_at                    timestamptz,
  status                     text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','qualifying','race','finished')),
  special_category_question  text,
  special_category_type      text CHECK (special_category_type IN ('driver','team','options')),
  special_category_options   text[],
  result_p1                  text,
  result_p2                  text,
  result_p3                  text,
  result_dnf_drivers         text[],
  result_team_most_points    text,
  special_category_answer    text,
  is_scored                  boolean NOT NULL DEFAULT false,
  is_manual_unlock           boolean NOT NULL DEFAULT false,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE(season, round_number)
);
ALTER TABLE f1_races ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f1_races_public_read"  ON f1_races FOR SELECT USING (true);
CREATE POLICY "f1_races_admin_write"  ON f1_races FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- ── F1 BETS — PER RACE (global per user; one set of picks per race) ──────────
CREATE TABLE IF NOT EXISTS f1_bets_race (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id),
  season                   integer NOT NULL DEFAULT 2026,
  round_number             integer NOT NULL,
  p1                       text NOT NULL,
  p2                       text NOT NULL,
  p3                       text NOT NULL,
  dnf_driver               text,
  team_most_points         text,
  special_category_answer  text,
  is_locked                boolean NOT NULL DEFAULT false,
  submitted_at             timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, season, round_number)
);
ALTER TABLE f1_bets_race ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f1_bets_race_public_read"  ON f1_bets_race FOR SELECT USING (true);
CREATE POLICY "f1_bets_race_own_insert"   ON f1_bets_race FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND NOT EXISTS (
    SELECT 1 FROM f1_races r
    WHERE r.season = f1_bets_race.season
      AND r.round_number = f1_bets_race.round_number
      AND r.is_manual_unlock = false
      AND r.race_at IS NOT NULL
      AND r.race_at - interval '5 minutes' <= now()
  )
);
CREATE POLICY "f1_bets_race_own_update"   ON f1_bets_race FOR UPDATE
  USING (auth.uid() = user_id AND NOT is_locked);

-- ── F1 BETS — SEASON (once per user per season) ──────────────────────────────
CREATE TABLE IF NOT EXISTS f1_bets_year (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id),
  season                   integer NOT NULL DEFAULT 2026,
  driver_champion          text,
  driver_p2                text,
  driver_p3                text,
  constructor_champion     text,
  last_constructor         text,
  fewest_finishers_race    text,
  most_dnfs_driver         text,
  first_driver_replaced    text,
  most_poles               text,
  most_podiums_no_win      text,
  is_locked                boolean NOT NULL DEFAULT false,
  submitted_at             timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, season)
);
ALTER TABLE f1_bets_year ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f1_bets_year_public_read"  ON f1_bets_year FOR SELECT USING (true);
CREATE POLICY "f1_bets_year_own_insert"   ON f1_bets_year FOR INSERT
  WITH CHECK (auth.uid() = user_id AND NOT is_locked);
CREATE POLICY "f1_bets_year_own_update"   ON f1_bets_year FOR UPDATE
  USING (auth.uid() = user_id AND NOT is_locked);

-- ── F1 SCORES (global per user; paddock leaderboard filters by membership) ────
CREATE TABLE IF NOT EXISTS f1_scores (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id),
  season          integer NOT NULL DEFAULT 2026,
  round_number    integer,
  score_type      text NOT NULL CHECK (score_type IN ('race','year')),
  breakdown       jsonb NOT NULL DEFAULT '{}',
  total_points    integer NOT NULL DEFAULT 0,
  is_override     boolean NOT NULL DEFAULT false,
  override_reason text,
  scored_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, season, round_number, score_type)
);
ALTER TABLE f1_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f1_scores_public_read"  ON f1_scores FOR SELECT USING (true);
CREATE POLICY "f1_scores_admin_write"  ON f1_scores FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- ── F1 YEAR RESULTS (admin-entered season-end standings) ─────────────────────
CREATE TABLE IF NOT EXISTS f1_year_results (
  id                    serial PRIMARY KEY,
  season                integer NOT NULL UNIQUE,
  driver_champion       text,
  driver_p2             text,
  driver_p3             text,
  constructor_champion  text,
  last_constructor      text,
  fewest_finishers_race text,
  most_dnfs_driver      text,
  first_driver_replaced text,
  most_poles            text,
  most_podiums_no_win   text,
  is_final              boolean NOT NULL DEFAULT false,
  is_bets_locked        boolean NOT NULL DEFAULT false,
  updated_at            timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE f1_year_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "f1_year_results_public_read"  ON f1_year_results FOR SELECT USING (true);
CREATE POLICY "f1_year_results_admin_write"  ON f1_year_results FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

INSERT INTO f1_year_results (season, is_bets_locked)
  VALUES (2026, false)
  ON CONFLICT (season) DO NOTHING;

COMMIT;
