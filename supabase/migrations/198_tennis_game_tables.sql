-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 198 — Tennis Module: Game tables (players, rosters, cards, scores, ATP Finals)
-- Sprint T-0 (Phase 2, v2 branch only — not deployed to main until Week 12)
--
-- API integration notes (tennis-api-atp-wta-itf, free plan: 50 req/day):
--   external_player_id → API player ID (e.g. 68074 for Alcaraz)
--   Populated by sync-tennis-players Edge Function (admin-triggered, 1 call per tournament)
--   Never auto-synced via cron — every call is precious on the free plan.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Tournament players ────────────────────────────────────────────────────
-- One row per player per tournament. Admin seeds manually or via sync-tennis-players.
-- round_reached tracks the furthest round (updated as admin enters eliminations).
-- external_player_id: partial unique index allows multiple NULLs (manual entries)
-- but enforces uniqueness when an API ID is present.

CREATE TABLE tennis_tournament_players (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id      uuid    NOT NULL REFERENCES tennis_tournaments ON DELETE CASCADE,
  player_name        text    NOT NULL,
  nationality        text,
  seed               int,
  tier               int     NOT NULL CHECK (tier IN (1,2,3,4)),
  round_reached      text    CHECK (round_reached IN
                       ('r128','r64','r32','r16','qf','sf','runner_up','champion')),
  rounds_won         int     NOT NULL DEFAULT 0,
  eliminated         boolean NOT NULL DEFAULT false,
  external_player_id int,    -- API player ID; NULL for manually entered players
  UNIQUE (tournament_id, player_name)
);

-- Partial unique index: API sync cannot create duplicates, but manual NULLs are fine
CREATE UNIQUE INDEX tennis_ttp_external_id_idx
  ON tennis_tournament_players(tournament_id, external_player_id)
  WHERE external_player_id IS NOT NULL;

-- ── 2. User rosters ──────────────────────────────────────────────────────────
-- One row per user per tournament (global — not per Player's Box).
-- The same roster contributes to all Player's Boxes the user belongs to.

CREATE TABLE tennis_rosters (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users,
  tournament_id    uuid NOT NULL REFERENCES tennis_tournaments,
  tier1_player_id  uuid REFERENCES tennis_tournament_players,
  tier2a_player_id uuid REFERENCES tennis_tournament_players,
  tier2b_player_id uuid REFERENCES tennis_tournament_players,
  tier3a_player_id uuid REFERENCES tennis_tournament_players,
  tier3b_player_id uuid REFERENCES tennis_tournament_players,
  tier4a_player_id uuid REFERENCES tennis_tournament_players,  -- Dark Horse 1
  tier4b_player_id uuid REFERENCES tennis_tournament_players,  -- Dark Horse 2
  ace_card_type    text CHECK (ace_card_type IN
                     ('underdog_boost','safety_net','surface_specialist','dark_horse_insurance')),
  locked_at        timestamptz,
  UNIQUE (user_id, tournament_id)
);

-- ── 3. QF Captains ───────────────────────────────────────────────────────────
-- Set during the 48h qf_captain_open window. Must be a surviving roster player.

CREATE TABLE tennis_qf_captains (
  user_id           uuid NOT NULL REFERENCES auth.users,
  tournament_id     uuid NOT NULL REFERENCES tennis_tournaments,
  captain_player_id uuid NOT NULL REFERENCES tennis_tournament_players,
  set_at            timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, tournament_id)
);

-- ── 4. Ace Cards ─────────────────────────────────────────────────────────────
-- 4 cards issued per user per season (one of each type).
-- used_tournament_id: NULL until played; set by submit_tennis_roster RPC.
-- No card at ATP Finals — system enforces via submit_tennis_roster guard.

CREATE TABLE tennis_ace_cards (
  user_id            uuid NOT NULL REFERENCES auth.users,
  season_year        int  NOT NULL REFERENCES tennis_seasons,
  card_type          text NOT NULL CHECK (card_type IN
                       ('underdog_boost','safety_net','surface_specialist','dark_horse_insurance')),
  used_tournament_id uuid REFERENCES tennis_tournaments,
  used_at            timestamptz,
  PRIMARY KEY (user_id, season_year, card_type)
);

-- ── 5. Tournament scores ─────────────────────────────────────────────────────
-- Written by score-tennis-tournament Edge Function after tournament completes.
-- One row per user per tournament (covers both standard and ATP Finals via same table).
-- breakdown JSONB stores per-player detail for UI expansion.

CREATE TABLE tennis_tournament_scores (
  user_id        uuid NOT NULL REFERENCES auth.users,
  tournament_id  uuid NOT NULL REFERENCES tennis_tournaments,
  base_points    int  NOT NULL DEFAULT 0,
  ace_card_bonus int  NOT NULL DEFAULT 0,
  captain_bonus  int  NOT NULL DEFAULT 0,
  total_points   int  NOT NULL DEFAULT 0,
  breakdown      jsonb,
  scored_at      timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, tournament_id)
);

-- ── 6. ATP Finals ────────────────────────────────────────────────────────────
-- Different mechanic: 15-match prediction slate (12 group + 2 SF + 1 Final).
-- Admin seeds match pairings; users pick winners; scoring counts correct picks.

CREATE TABLE tennis_atp_finals_matches (
  season_year       int  NOT NULL REFERENCES tennis_seasons,
  match_number      int  NOT NULL CHECK (match_number BETWEEN 1 AND 15),
  match_type        text NOT NULL CHECK (match_type IN ('group','sf','final')),
  player_a_id       uuid REFERENCES tennis_tournament_players,
  player_b_id       uuid REFERENCES tennis_tournament_players,
  winner_player_id  uuid REFERENCES tennis_tournament_players,
  result_entered_at timestamptz,
  PRIMARY KEY (season_year, match_number)
);

CREATE TABLE tennis_atp_finals_picks (
  user_id          uuid NOT NULL REFERENCES auth.users,
  season_year      int  NOT NULL REFERENCES tennis_seasons,
  match_number     int  NOT NULL CHECK (match_number BETWEEN 1 AND 15),
  picked_player_id uuid NOT NULL REFERENCES tennis_tournament_players,
  locked_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, season_year, match_number)
);

-- ── 7. gazette_entry_type extension ─────────────────────────────────────────
-- Required before score-tennis-tournament Edge Function is deployed.

ALTER TYPE gazette_entry_type ADD VALUE IF NOT EXISTS 'tennis_result';

-- ── 8. RLS ───────────────────────────────────────────────────────────────────

ALTER TABLE tennis_tournament_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_rosters            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_qf_captains        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_ace_cards          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_tournament_scores  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_atp_finals_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tennis_atp_finals_picks   ENABLE ROW LEVEL SECURITY;

-- tennis_tournament_players: all authenticated can read; service role writes via RPCs
CREATE POLICY "ttp_select" ON tennis_tournament_players
  FOR SELECT TO authenticated USING (true);

-- tennis_rosters: users read own rows; writes via submit_tennis_roster RPC
CREATE POLICY "tennis_rosters_select" ON tennis_rosters
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- tennis_qf_captains: users read own rows; writes via set_tennis_qf_captain RPC
CREATE POLICY "tennis_qf_captains_select" ON tennis_qf_captains
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- tennis_ace_cards: users read own rows; service role issues cards
CREATE POLICY "tennis_ace_cards_select" ON tennis_ace_cards
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- tennis_tournament_scores: own rows always visible; also visible to co-Player's-Box members
-- (needed for leaderboard — members see each other's season scores)
CREATE POLICY "tennis_tournament_scores_select" ON tennis_tournament_scores
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM player_box_members pbm
      WHERE pbm.user_id = auth.uid()
        AND pbm.player_box_id IN (
          SELECT player_box_id FROM player_box_members
          WHERE user_id = tennis_tournament_scores.user_id
        )
    )
  );

-- tennis_atp_finals_matches: all authenticated can read; service role writes
CREATE POLICY "tennis_atp_finals_matches_select" ON tennis_atp_finals_matches
  FOR SELECT TO authenticated USING (true);

-- tennis_atp_finals_picks: users read own rows; writes via submission RPCs
CREATE POLICY "tennis_atp_finals_picks_select" ON tennis_atp_finals_picks
  FOR SELECT TO authenticated USING (user_id = auth.uid());
