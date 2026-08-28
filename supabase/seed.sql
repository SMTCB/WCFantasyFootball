-- ═══════════════════════════════════════════════════════════════════════════
-- Tier 3 (Local Full-Stack E2E) synthetic seed — docs/testing/TESTING_STRATEGY.md
-- ═══════════════════════════════════════════════════════════════════════════
-- Runs automatically on `npx supabase start` / `npx supabase db reset` once
-- config.toml's [db.seed].enabled = true (see supabase/config.toml). Entirely
-- synthetic: no real Forza player IDs, no real fixtures, no real users.
--
-- Auth-account pattern (raw auth.users/auth.identities insert, bcrypt via
-- pgcrypto's crypt()) was empirically verified against this Supabase CLI's
-- local GoTrue with a standalone signInWithPassword check before this file
-- was built out further — see BACKLOG.md / PR description for that session.
--
-- Fixed-ID reference (Task 2 of the Tier 3 Foundation plan reads these):
--   USER_A            e0000000-0000-4000-a000-00000000000a  (e2e_a@fantasykit.test)
--   USER_B            e0000000-0000-4000-a000-00000000000b  (e2e_b@fantasykit.test)
--   CIRCLE            c1000000-0000-4000-a000-000000000001
--   CLASSIC_LEAGUE    11000000-0000-4000-a000-000000000001  (EPL, tournament_id='426', format=classic)
--   DRAFT_LEAGUE      11000000-0000-4000-a000-000000000002  (WC,  tournament_id='429', format=noduplicate)
--   SCENARIO_FIXTURE  seed-fixture-epl-r1                    (426-r1, finished, Seed FC A 2-0 Seed FC B)
--   Scenario players: seed-epl-a-fwd-1 (2 goals), seed-epl-a-gk-1 (clean sheet),
--                      seed-epl-b-def-1 (yellow card) — see step 6 below for full roster.
--   SCENARIO_SQUAD    a0000000-0000-4000-a000-000000000001  (user_a, CLASSIC_LEAGUE, matchday 426-r1,
--                                                            Club A's 11 players — see step 6b)
--   PADDOCK           f1000000-0000-4000-a000-000000000001  (invite_code F1SEED01, user_a owner,
--                                                            f1_races round 1 upcoming/2 unscored/3 scored)
--   BOX               b0000000-0000-4000-a000-000000000001  (invite_code TNSEED01, user_a owner)
--   TOURN_ROSTER_OPEN b0a00000-0000-4000-a000-000000000001  (status roster_open, 11 tier-tagged players)
--   TOURN_QF_OPEN     b0a00000-0000-4000-a000-000000000002  (status qf_captain_open, user_a roster
--                                                            already submitted, 7 fixed-ID players)
--   TOURN_COMPLETED   b0a00000-0000-4000-a000-000000000003  (status completed, both users scored)
--   TOURN_ATP_FINALS  b0a00000-0000-4000-a000-000000000004  (status roster_open, 8 players, 12 group matches)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Auth accounts ────────────────────────────────────────────────────────
DO $$
DECLARE
  user_a_id uuid := 'e0000000-0000-4000-a000-00000000000a';
  user_b_id uuid := 'e0000000-0000-4000-a000-00000000000b';
  user_a_email text := 'e2e_a@fantasykit.test';
  user_b_email text := 'e2e_b@fantasykit.test';
  user_password text := 'E2ePass!99';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  ) VALUES
    ('00000000-0000-0000-0000-000000000000', user_a_id, 'authenticated', 'authenticated', user_a_email,
     crypt(user_password, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
     now(), now(), '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000', user_b_id, 'authenticated', 'authenticated', user_b_email,
     crypt(user_password, gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}',
     now(), now(), '', '', '', '')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) VALUES
    (gen_random_uuid(), user_a_id, user_a_id::text,
     jsonb_build_object('sub', user_a_id::text, 'email', user_a_email), 'email', now(), now(), now()),
    (gen_random_uuid(), user_b_id, user_b_id::text,
     jsonb_build_object('sub', user_b_id::text, 'email', user_b_email), 'email', now(), now(), now())
  ON CONFLICT DO NOTHING;

  -- public.users is normally populated by the `on_auth_user_created` trigger
  -- (handle_new_user(), defined in public but attached to auth.users) — that
  -- trigger lives in the auth schema and isn't captured by a `--schema public`
  -- pg_dump, so schema.sql doesn't recreate it locally. Insert directly instead
  -- of depending on it; every FK below (circle_members, league_members, etc.)
  -- points at public.users, not auth.users.
  INSERT INTO public.users (id, username)
  VALUES (user_a_id, 'e2e_a'), (user_b_id, 'e2e_b')
  ON CONFLICT (id) DO NOTHING;

  RAISE NOTICE 'Seeded 2 auth accounts (e2e_a, e2e_b)';
END $$;

-- ── 2. Circle + membership ──────────────────────────────────────────────────
DO $$
DECLARE
  circle_id uuid := 'c1000000-0000-4000-a000-000000000001';
  user_a_id uuid := 'e0000000-0000-4000-a000-00000000000a';
  user_b_id uuid := 'e0000000-0000-4000-a000-00000000000b';
  -- The app's fixed DEMO_USER (src/context/AuthContext.jsx) — used for every
  -- unauthenticated/browser-driven page load when VITE_AUTH_ENABLED isn't
  -- 'true' (the default this script leaves it at, see e2e-local.mjs). Draft-
  -- allocation-e2e.spec.js's UI flows (e.g. the league creation wizard) run
  -- as this identity, not e2e_a/e2e_b, so it needs its own Clubhouse
  -- membership or the wizard's Clubhouse-picker step blocks with "you don't
  -- have a Clubhouse yet" (public.users has no auth.users FK, so this insert
  -- is safe despite no matching auth account existing for the demo user).
  demo_user_id uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  INSERT INTO circles (id, name, invite_code, created_by, is_public)
  VALUES (circle_id, 'E2E Test Circle', 'e2eseed1', user_a_id, false)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.users (id, username)
  VALUES (demo_user_id, 'demo')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO circle_members (circle_id, user_id, role) VALUES
    (circle_id, user_a_id, 'owner'),
    (circle_id, user_b_id, 'member'),
    (circle_id, demo_user_id, 'member')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seeded 1 circle + 3 members (e2e_a, e2e_b, demo)';
END $$;

-- ── 2b. Tournaments ─────────────────────────────────────────────────────────
-- players.tournament_id and leagues.tournament_id both FK to
-- tournaments.forza_id — must exist before either is seeded.
INSERT INTO tournaments (forza_id, name, slug, environment, sync_enabled, status, available_for_league_creation)
VALUES
  ('426', 'Seed EPL', 'seed-epl', 'dry_run', false, 'live', true),
  ('429', 'Seed World Cup', 'seed-wc', 'dry_run', false, 'live', true)
ON CONFLICT (forza_id) DO NOTHING;

-- ── 3. EPL player pool (tournament_id = '426') ──────────────────────────────
-- 22 "scenario" players (fixed IDs, clubs Seed FC A / Seed FC B) used by the
-- scoring scenario in step 6, plus 98 bulk players (clubs Seed FC C..J) that
-- exist purely for pool-size / position-cap / budget / transfer-market
-- coverage and are not part of any seeded fixture.
DO $$
DECLARE
  n int;
  pos text;
  club text;
  price numeric(4,1);
BEGIN
  -- Scenario roster: club A (home, wins 2-0) and club B (away).
  INSERT INTO players (id, name, position, club, tournament_id, price, is_active) VALUES
    ('seed-epl-a-gk-1',  'Seed A Keeper',    'GK',  'Seed FC A', '426', 5.0, true),
    ('seed-epl-a-def-1', 'Seed A Defender 1','DEF', 'Seed FC A', '426', 5.5, true),
    ('seed-epl-a-def-2', 'Seed A Defender 2','DEF', 'Seed FC A', '426', 5.0, true),
    ('seed-epl-a-def-3', 'Seed A Defender 3','DEF', 'Seed FC A', '426', 4.5, true),
    ('seed-epl-a-def-4', 'Seed A Defender 4','DEF', 'Seed FC A', '426', 4.5, true),
    ('seed-epl-a-mid-1', 'Seed A Mid 1',     'MID', 'Seed FC A', '426', 7.0, true),
    ('seed-epl-a-mid-2', 'Seed A Mid 2',     'MID', 'Seed FC A', '426', 6.5, true),
    ('seed-epl-a-mid-3', 'Seed A Mid 3',     'MID', 'Seed FC A', '426', 6.0, true),
    ('seed-epl-a-mid-4', 'Seed A Mid 4',     'MID', 'Seed FC A', '426', 5.5, true),
    ('seed-epl-a-fwd-1', 'Seed A Striker 1', 'FWD', 'Seed FC A', '426', 9.5, true),
    ('seed-epl-a-fwd-2', 'Seed A Striker 2', 'FWD', 'Seed FC A', '426', 7.5, true),
    ('seed-epl-b-gk-1',  'Seed B Keeper',    'GK',  'Seed FC B', '426', 4.5, true),
    ('seed-epl-b-def-1', 'Seed B Defender 1','DEF', 'Seed FC B', '426', 4.5, true),
    ('seed-epl-b-def-2', 'Seed B Defender 2','DEF', 'Seed FC B', '426', 4.5, true),
    ('seed-epl-b-def-3', 'Seed B Defender 3','DEF', 'Seed FC B', '426', 4.0, true),
    ('seed-epl-b-def-4', 'Seed B Defender 4','DEF', 'Seed FC B', '426', 4.0, true),
    ('seed-epl-b-mid-1', 'Seed B Mid 1',     'MID', 'Seed FC B', '426', 6.0, true),
    ('seed-epl-b-mid-2', 'Seed B Mid 2',     'MID', 'Seed FC B', '426', 5.5, true),
    ('seed-epl-b-mid-3', 'Seed B Mid 3',     'MID', 'Seed FC B', '426', 5.0, true),
    ('seed-epl-b-mid-4', 'Seed B Mid 4',     'MID', 'Seed FC B', '426', 5.0, true),
    ('seed-epl-b-fwd-1', 'Seed B Striker 1', 'FWD', 'Seed FC B', '426', 7.0, true),
    ('seed-epl-b-fwd-2', 'Seed B Striker 2', 'FWD', 'Seed FC B', '426', 6.0, true)
  ON CONFLICT (id) DO NOTHING;

  -- Bulk pool: 98 more players, clubs Seed FC C..J, not part of any fixture.
  FOR n IN 1..98 LOOP
    pos := CASE
      WHEN n % 10 = 0 THEN 'GK'
      WHEN n % 10 IN (1, 2, 3) THEN 'DEF'
      WHEN n % 10 IN (4, 5, 6) THEN 'MID'
      ELSE 'FWD'
    END;
    club := 'Seed FC ' || chr(67 + (n % 8)); -- C..J
    price := round((4.0 + (n % 9) * 0.7)::numeric, 1);
    INSERT INTO players (id, name, position, club, tournament_id, price, is_active)
    VALUES ('seed-epl-p-' || n, 'Seed EPL Player ' || n, pos, club, '426', price, true)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Seeded 120 EPL players (tournament_id=426)';
END $$;

-- ── 4. WC player pool (tournament_id = '429') ───────────────────────────────
DO $$
DECLARE
  n int;
  pos text;
  club text;
  price numeric(4,1);
BEGIN
  FOR n IN 1..40 LOOP
    pos := CASE
      WHEN n % 10 = 0 THEN 'GK'
      WHEN n % 10 IN (1, 2, 3) THEN 'DEF'
      WHEN n % 10 IN (4, 5, 6) THEN 'MID'
      ELSE 'FWD'
    END;
    club := 'Seed Nation ' || chr(65 + (n % 10)); -- A..J
    price := round((4.0 + (n % 9) * 0.6)::numeric, 1);
    INSERT INTO players (id, name, position, club, tournament_id, price, is_active)
    VALUES ('seed-wc-p-' || n, 'Seed WC Player ' || n, pos, club, '429', price, true)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Seeded 40 WC players (tournament_id=429)';
END $$;

-- ── 5. Leagues + membership ──────────────────────────────────────────────────
-- league_mode is auto-derived from format by the trg_sync_league_mode trigger
-- (noduplicate -> draft, everything else -> classic) — not set explicitly here.
DO $$
DECLARE
  circle_id uuid := 'c1000000-0000-4000-a000-000000000001';
  classic_league_id uuid := '11000000-0000-4000-a000-000000000001';
  draft_league_id uuid := '11000000-0000-4000-a000-000000000002';
  user_a_id uuid := 'e0000000-0000-4000-a000-00000000000a';
  user_b_id uuid := 'e0000000-0000-4000-a000-00000000000b';
BEGIN
  INSERT INTO leagues (id, name, format, tournament_id, created_by, circle_id, max_members)
  VALUES (classic_league_id, 'E2E Classic League', 'classic', '426', user_a_id, circle_id, 10)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO leagues (
    id, name, format, tournament_id, created_by, circle_id, max_members,
    squad_size, draft_list_size
  )
  VALUES (
    draft_league_id, 'E2E WC Draft League', 'noduplicate', '429', user_a_id, circle_id, 10,
    15, 30
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO circle_leagues (circle_id, league_id) VALUES
    (circle_id, classic_league_id),
    (circle_id, draft_league_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO league_members (league_id, user_id, role, total_points, rank) VALUES
    (classic_league_id, user_a_id, 'commissioner', 45.50, 1),
    (classic_league_id, user_b_id, 'member',       32.00, 2),
    (draft_league_id,   user_a_id, 'commissioner', 0,     1),
    (draft_league_id,   user_b_id, 'member',       0,     2)
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seeded 2 leagues + circle_leagues + league_members';
END $$;

-- ── 6. Scoring scenario: one finished fixture, deterministic stats ─────────
-- Seed FC A (home) beats Seed FC B (away) 2-0.
--   seed-epl-a-fwd-1  scores both goals (minute 23, minute 67), 90 mins.
--   seed-epl-a-gk-1   clean sheet, 90 mins, 0 goals conceded, 3 saves.
--   seed-epl-a-def-*  (4 players) also credited clean_sheet=true, 90 mins.
--   seed-epl-b-def-1  booked (yellow card, minute 55), 90 mins.
--   All 11 Club A players: goals_conceded=0. All 11 Club B players: goals_conceded=2.
--   Every one of the 22 scenario players gets a player_match_stats row (90
--   mins each) — this is a full, self-consistent single-match dataset that
--   Task 2's rewritten scoring-pipeline.spec.js asserts against directly.
DO $$
DECLARE
  fixture_id text := 'seed-fixture-epl-r1';
  matchday text := '426-r1';
  kickoff timestamptz := now() - interval '1 day';
  pid text;
  club_a_ids text[] := ARRAY[
    'seed-epl-a-gk-1', 'seed-epl-a-def-1', 'seed-epl-a-def-2', 'seed-epl-a-def-3', 'seed-epl-a-def-4',
    'seed-epl-a-mid-1', 'seed-epl-a-mid-2', 'seed-epl-a-mid-3', 'seed-epl-a-mid-4',
    'seed-epl-a-fwd-1', 'seed-epl-a-fwd-2'
  ];
  club_b_ids text[] := ARRAY[
    'seed-epl-b-gk-1', 'seed-epl-b-def-1', 'seed-epl-b-def-2', 'seed-epl-b-def-3', 'seed-epl-b-def-4',
    'seed-epl-b-mid-1', 'seed-epl-b-mid-2', 'seed-epl-b-mid-3', 'seed-epl-b-mid-4',
    'seed-epl-b-fwd-1', 'seed-epl-b-fwd-2'
  ];
BEGIN
  INSERT INTO fixtures (
    id, home_team, away_team, kickoff_at, competition, status,
    home_score, away_score, matchday_id, tournament_id, round_number
  ) VALUES (
    fixture_id, 'Seed FC A', 'Seed FC B', kickoff, 'Seed EPL', 'finished',
    2, 0, matchday, '426', 1
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO matchday_deadlines (matchday_id, deadline_at, unlocks_at, tournament_id)
  VALUES (matchday, kickoff - interval '2 hours', kickoff, '426')
  ON CONFLICT DO NOTHING;

  INSERT INTO match_events (fixture_id, type, player_id, minute, team) VALUES
    (fixture_id, 'goal',   'seed-epl-a-fwd-1', '23', 'Seed FC A'),
    (fixture_id, 'goal',   'seed-epl-a-fwd-1', '67', 'Seed FC A'),
    (fixture_id, 'yellow', 'seed-epl-b-def-1', '55', 'Seed FC B')
  ON CONFLICT DO NOTHING;

  FOREACH pid IN ARRAY club_a_ids LOOP
    INSERT INTO player_match_stats (
      fixture_id, player_id, minutes_played, goals, assists, yellow_cards,
      clean_sheet, goals_conceded, saves, fantasy_points
    ) VALUES (
      fixture_id, pid, 90,
      CASE WHEN pid = 'seed-epl-a-fwd-1' THEN 2 ELSE 0 END,
      0, 0,
      (pid = ANY (ARRAY['seed-epl-a-gk-1', 'seed-epl-a-def-1', 'seed-epl-a-def-2', 'seed-epl-a-def-3', 'seed-epl-a-def-4'])),
      0,
      CASE WHEN pid = 'seed-epl-a-gk-1' THEN 3 ELSE 0 END,
      CASE WHEN pid = 'seed-epl-a-fwd-1' THEN 14.0 WHEN pid = 'seed-epl-a-gk-1' THEN 8.0 ELSE 2.0 END
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  FOREACH pid IN ARRAY club_b_ids LOOP
    INSERT INTO player_match_stats (
      fixture_id, player_id, minutes_played, goals, assists, yellow_cards,
      clean_sheet, goals_conceded, saves, fantasy_points
    ) VALUES (
      fixture_id, pid, 90, 0, 0,
      CASE WHEN pid = 'seed-epl-b-def-1' THEN 1 ELSE 0 END,
      false, 2,
      CASE WHEN pid = 'seed-epl-b-gk-1' THEN 4 ELSE 0 END,
      CASE WHEN pid = 'seed-epl-b-def-1' THEN 0.0 WHEN pid = 'seed-epl-b-gk-1' THEN 1.0 ELSE 1.0 END
    ) ON CONFLICT DO NOTHING;
  END LOOP;

  RAISE NOTICE 'Seeded 1 finished fixture (seed-fixture-epl-r1) + 3 match_events + 22 player_match_stats';
END $$;

-- ── 6b. Season-total scoring: one squad + one fantasy_points row ───────────
-- user_a's CLASSIC_LEAGUE squad for matchday 426-r1, holding Club A's 11
-- scenario players from step 6 above. fantasy_points is one row PER SQUAD
-- PER MATCHDAY (UNIQUE(squad_id, matchday_id) — confirmed against
-- calculate-scores/index.js's `upsert(..., { onConflict: 'squad_id,matchday_id' })`),
-- not one row per player. `total` is the squad's summed points for the
-- matchday (14.0 + 8.0 + 9*2.0 = 40.0, mirroring player_match_stats.fantasy_points
-- exactly); `points_breakdown.per_player` carries the per-player split for
-- tests/UI that want it. This is what scoring-pipeline.spec.js's
-- round-based-matchday_id test reads.
DO $$
DECLARE
  v_squad_id uuid := 'a0000000-0000-4000-a000-000000000001';
  v_classic_league_id uuid := '11000000-0000-4000-a000-000000000001';
  v_user_a_id uuid := 'e0000000-0000-4000-a000-00000000000a';
  v_matchday text := '426-r1';
  v_club_a_ids text[] := ARRAY[
    'seed-epl-a-gk-1', 'seed-epl-a-def-1', 'seed-epl-a-def-2', 'seed-epl-a-def-3', 'seed-epl-a-def-4',
    'seed-epl-a-mid-1', 'seed-epl-a-mid-2', 'seed-epl-a-mid-3', 'seed-epl-a-mid-4',
    'seed-epl-a-fwd-1', 'seed-epl-a-fwd-2'
  ];
  v_pid text;
  v_pts numeric;
  v_per_player jsonb := '{}'::jsonb;
  v_squad_total numeric := 0;
BEGIN
  INSERT INTO squads (id, league_id, user_id, matchday_id, players, starting_xi, initial_build_complete)
  VALUES (v_squad_id, v_classic_league_id, v_user_a_id, v_matchday, v_club_a_ids, v_club_a_ids, true)
  ON CONFLICT (id) DO NOTHING;

  FOREACH v_pid IN ARRAY v_club_a_ids LOOP
    v_pts := CASE WHEN v_pid = 'seed-epl-a-fwd-1' THEN 14.0 WHEN v_pid = 'seed-epl-a-gk-1' THEN 8.0 ELSE 2.0 END;
    v_per_player := v_per_player || jsonb_build_object(v_pid, v_pts);
    v_squad_total := v_squad_total + v_pts;
  END LOOP;

  INSERT INTO fantasy_points (squad_id, matchday_id, total, points_breakdown)
  VALUES (
    v_squad_id, v_matchday, v_squad_total,
    jsonb_build_object('effective_xi', to_jsonb(v_club_a_ids), 'per_player', v_per_player)
  )
  ON CONFLICT (squad_id, matchday_id) DO UPDATE
    SET total = EXCLUDED.total, points_breakdown = EXCLUDED.points_breakdown;

  RAISE NOTICE 'Seeded 1 squad (11 players) + 1 fantasy_points row (total=%) for matchday 426-r1', v_squad_total;
END $$;

-- ── 7. Sports catalogue ─────────────────────────────────────────────────────
-- score-f1-race and score-tennis-tournament look these up by exact `name`
-- ('Formula 1', 'Tennis') to scope event_win trophies per paddock/player_box;
-- create_paddock/create_player_box also 404 without a matching row. Not
-- baked into schema.sql (DDL-only pg_dump) — must be seeded explicitly.
INSERT INTO sports (id, slug, name, game_model, provider, active) VALUES
  ('50000000-0000-4000-a000-000000000001', 'football', 'Football',   'fantasy_squad', 'forza',       true),
  ('50000000-0000-4000-a000-000000000002', 'f1',       'Formula 1',  'prediction',    'openf1',      true),
  ('50000000-0000-4000-a000-000000000003', 'tennis',   'Tennis',     'bracket',       'thesportsdb', true)
ON CONFLICT (id) DO NOTHING;

-- ── 8. F1: paddock, season, 3 races, bets, scores, year results ────────────
-- Round 1 (upcoming, unlocked): race-pick submission spec — no pre-seeded
--   bet, upserted fresh by the spec via F1RacePickForm.
-- Round 2 (finished, unscored): admin scoring spec — one pre-seeded bet for
--   user_a only (so score-f1-race has something to score and the resulting
--   event_win trophy has a clear, non-tied winner regardless of whether the
--   paddock-join spec has run yet in another worker).
-- Round 3 (finished, scored): standings/report/leaderboard smoke — bets +
--   scores for both users, season=2026 (get_paddock_leaderboard hardcodes
--   `s.season = 2026`, confirmed via migration 192_f1_rpcs_and_seed.sql).
DO $$
DECLARE
  paddock_id uuid := 'f1000000-0000-4000-a000-000000000001';
  circle_id uuid := 'c1000000-0000-4000-a000-000000000001';
  sport_f1_id uuid := '50000000-0000-4000-a000-000000000002';
  user_a_id uuid := 'e0000000-0000-4000-a000-00000000000a';
  user_b_id uuid := 'e0000000-0000-4000-a000-00000000000b';
BEGIN
  INSERT INTO paddocks (id, name, season, invite_code, created_by, sport_id, circle_id)
  VALUES (paddock_id, 'E2E Test Paddock', 2026, 'F1SEED01', user_a_id, sport_f1_id, circle_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO paddock_members (paddock_id, user_id, role) VALUES
    (paddock_id, user_a_id, 'owner')
  ON CONFLICT DO NOTHING;

  INSERT INTO circle_paddocks (circle_id, paddock_id)
  VALUES (circle_id, paddock_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO f1_seasons (season, starts_at, ends_at)
  VALUES (2026, '2026-03-01T00:00:00Z', '2026-12-15T00:00:00Z')
  ON CONFLICT (season) DO NOTHING;

  INSERT INTO f1_races (season, round_number, gp_name, circuit, race_date, qualifying_at, race_at, status) VALUES
    (2026, 1, 'Seed Grand Prix 1', 'Seed Circuit A', CURRENT_DATE + 7, now() + interval '6 days', now() + interval '7 days', 'scheduled')
  ON CONFLICT (season, round_number) DO NOTHING;

  INSERT INTO f1_races (season, round_number, gp_name, circuit, race_date, qualifying_at, race_at, status) VALUES
    (2026, 2, 'Seed Grand Prix 2', 'Seed Circuit B', CURRENT_DATE - 3, now() - interval '4 days', now() - interval '3 days', 'finished')
  ON CONFLICT (season, round_number) DO NOTHING;

  INSERT INTO f1_races (
    season, round_number, gp_name, circuit, race_date, qualifying_at, race_at, status,
    result_p1, result_p2, result_p3, result_team_most_points, is_scored
  ) VALUES (
    2026, 3, 'Seed Grand Prix 3', 'Seed Circuit C', CURRENT_DATE - 14, now() - interval '15 days', now() - interval '14 days', 'finished',
    'Lando Norris', 'Oscar Piastri', 'Charles Leclerc', 'McLaren', true
  )
  ON CONFLICT (season, round_number) DO NOTHING;

  -- Round 2's bet uses real DRIVERS/TEAMS values (src/lib/f1/f1-data.js) —
  -- score-f1-race does exact string comparison against f1_races.result_p1/etc,
  -- and F1AdminScreen's result-entry <select> only offers those same values.
  -- The Tier 3 admin-scoring spec enters this exact p1/p2/p3/team combo as the
  -- race result, so this bet scores a guaranteed non-zero total (used to
  -- assert both f1_scores and the resulting event_win trophy).
  INSERT INTO f1_bets_race (user_id, season, round_number, p1, p2, p3, team_most_points, is_locked) VALUES
    (user_a_id, 2026, 2, 'Max Verstappen', 'Charles Leclerc', 'Lewis Hamilton', 'Red Bull', true)
  ON CONFLICT (user_id, season, round_number) DO NOTHING;

  INSERT INTO f1_bets_race (user_id, season, round_number, p1, p2, p3, is_locked) VALUES
    (user_a_id, 2026, 3, 'Lando Norris', 'Oscar Piastri', 'Charles Leclerc', true),
    (user_b_id, 2026, 3, 'Oscar Piastri', 'Lando Norris', 'Charles Leclerc', true)
  ON CONFLICT (user_id, season, round_number) DO NOTHING;

  INSERT INTO f1_scores (user_id, season, round_number, score_type, total_points) VALUES
    (user_a_id, 2026, 3, 'race', 25),
    (user_b_id, 2026, 3, 'race', 14)
  ON CONFLICT (user_id, season, round_number, score_type) DO NOTHING;

  INSERT INTO f1_year_results (season, is_bets_locked)
  VALUES (2026, false)
  ON CONFLICT (season) DO NOTHING;

  RAISE NOTICE 'Seeded 1 paddock + f1_seasons + 3 f1_races (upcoming/unscored/scored) + bets/scores + year_results';
END $$;

-- ── 9. Tennis: player_box, season, 4 tournaments, players, rosters, scores ─
-- roster_open: 11 tier-tagged players (margin over the 7 slots) for the
--   roster-submission spec, submitted live via submit_tennis_roster.
-- qf_captain_open: exactly 7 fixed-ID players (one per roster slot) plus a
--   pre-seeded tennis_rosters row for user_a (raw insert — "already
--   submitted" fixture) — eliminated left at its default false so
--   get_tennis_tournament_for_user's `surviving_players` is non-empty
--   (confirmed via migration 199_tennis_t1_rpcs.sql).
-- completed: no players needed — tennis_tournament_scores has no player FK,
--   so both users' final scores are hand-worked directly for leaderboard/
--   profile smoke.
-- atp_finals (roster_open): 8 players (tier 1, elite-only) + 12 group-stage
--   tennis_atp_finals_matches rows (round robin, 2 groups of 4) — smoke only,
--   per the plan's explicit scope decision (no knockout phase this pass).
DO $$
DECLARE
  box_id uuid := 'b0000000-0000-4000-a000-000000000001';
  circle_id uuid := 'c1000000-0000-4000-a000-000000000001';
  user_a_id uuid := 'e0000000-0000-4000-a000-00000000000a';
  user_b_id uuid := 'e0000000-0000-4000-a000-00000000000b';
  tourn_roster_open uuid := 'b0a00000-0000-4000-a000-000000000001';
  tourn_qf_open uuid := 'b0a00000-0000-4000-a000-000000000002';
  tourn_completed uuid := 'b0a00000-0000-4000-a000-000000000003';
  tourn_atp_finals uuid := 'b0a00000-0000-4000-a000-000000000004';
  qf_t1 uuid := 'b0a10000-0000-4000-a000-000000000001';
  qf_t2a uuid := 'b0a10000-0000-4000-a000-000000000002';
  qf_t2b uuid := 'b0a10000-0000-4000-a000-000000000003';
  qf_t3a uuid := 'b0a10000-0000-4000-a000-000000000004';
  qf_t3b uuid := 'b0a10000-0000-4000-a000-000000000005';
  qf_t4a uuid := 'b0a10000-0000-4000-a000-000000000006';
  qf_t4b uuid := 'b0a10000-0000-4000-a000-000000000007';
  atp_p1 uuid := 'b0a20000-0000-4000-a000-000000000001';
  atp_p2 uuid := 'b0a20000-0000-4000-a000-000000000002';
  atp_p3 uuid := 'b0a20000-0000-4000-a000-000000000003';
  atp_p4 uuid := 'b0a20000-0000-4000-a000-000000000004';
  atp_p5 uuid := 'b0a20000-0000-4000-a000-000000000005';
  atp_p6 uuid := 'b0a20000-0000-4000-a000-000000000006';
  atp_p7 uuid := 'b0a20000-0000-4000-a000-000000000007';
  atp_p8 uuid := 'b0a20000-0000-4000-a000-000000000008';
BEGIN
  INSERT INTO player_boxes (id, name, invite_code, created_by, season_year, circle_id)
  VALUES (box_id, 'E2E Test Player Box', 'TNSEED01', user_a_id, 2026, circle_id)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO player_box_members (player_box_id, user_id) VALUES
    (box_id, user_a_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO circle_player_boxes (circle_id, player_box_id)
  VALUES (circle_id, box_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO tennis_seasons (year, ace_cards_per_user)
  VALUES (2026, 4)
  ON CONFLICT (year) DO NOTHING;

  INSERT INTO tennis_ace_cards (user_id, season_year, card_type) VALUES
    (user_a_id, 2026, 'underdog_boost'),
    (user_a_id, 2026, 'safety_net'),
    (user_a_id, 2026, 'surface_specialist'),
    (user_a_id, 2026, 'dark_horse_insurance'),
    (user_b_id, 2026, 'underdog_boost'),
    (user_b_id, 2026, 'safety_net'),
    (user_b_id, 2026, 'surface_specialist'),
    (user_b_id, 2026, 'dark_horse_insurance')
  ON CONFLICT (user_id, season_year, card_type) DO NOTHING;

  -- roster_open
  INSERT INTO tennis_tournaments (id, season_year, name, tournament_type, surface, start_date, end_date, status, sort_order)
  VALUES (tourn_roster_open, 2026, 'Seed Open (Roster Open)', 'masters_1000', 'hard', CURRENT_DATE + 10, CURRENT_DATE + 24, 'roster_open', 1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tennis_tournament_players (tournament_id, player_name, tier) VALUES
    (tourn_roster_open, 'Roster T1 Alpha', 1), (tourn_roster_open, 'Roster T1 Beta', 1),
    (tourn_roster_open, 'Roster T2 Alpha', 2), (tourn_roster_open, 'Roster T2 Beta', 2), (tourn_roster_open, 'Roster T2 Gamma', 2),
    (tourn_roster_open, 'Roster T3 Alpha', 3), (tourn_roster_open, 'Roster T3 Beta', 3), (tourn_roster_open, 'Roster T3 Gamma', 3),
    (tourn_roster_open, 'Roster T4 Alpha', 4), (tourn_roster_open, 'Roster T4 Beta', 4), (tourn_roster_open, 'Roster T4 Gamma', 4)
  ON CONFLICT (tournament_id, player_name) DO NOTHING;

  -- qf_captain_open
  INSERT INTO tennis_tournaments (id, season_year, name, tournament_type, surface, start_date, end_date, status, sort_order)
  VALUES (tourn_qf_open, 2026, 'Seed Slam (QF Captain Open)', 'grand_slam', 'clay', CURRENT_DATE - 10, CURRENT_DATE + 4, 'qf_captain_open', 2)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tennis_tournament_players (id, tournament_id, player_name, tier, round_reached, rounds_won) VALUES
    (qf_t1,  tourn_qf_open, 'QF T1 Player',  1, 'qf', 4),
    (qf_t2a, tourn_qf_open, 'QF T2a Player', 2, 'qf', 4),
    (qf_t2b, tourn_qf_open, 'QF T2b Player', 2, 'r16', 3),
    (qf_t3a, tourn_qf_open, 'QF T3a Player', 3, 'qf', 4),
    (qf_t3b, tourn_qf_open, 'QF T3b Player', 3, 'r32', 2),
    (qf_t4a, tourn_qf_open, 'QF T4a Player', 4, 'r16', 3),
    (qf_t4b, tourn_qf_open, 'QF T4b Player', 4, 'r64', 1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tennis_rosters (
    user_id, tournament_id, tier1_player_id, tier2a_player_id, tier2b_player_id,
    tier3a_player_id, tier3b_player_id, tier4a_player_id, tier4b_player_id, locked_at
  ) VALUES (
    user_a_id, tourn_qf_open, qf_t1, qf_t2a, qf_t2b, qf_t3a, qf_t3b, qf_t4a, qf_t4b, now() - interval '2 days'
  )
  ON CONFLICT (user_id, tournament_id) DO NOTHING;

  -- completed
  INSERT INTO tennis_tournaments (id, season_year, name, tournament_type, surface, start_date, end_date, status, sort_order)
  VALUES (tourn_completed, 2026, 'Seed Masters (Completed)', 'masters_1000', 'grass', CURRENT_DATE - 30, CURRENT_DATE - 16, 'completed', 0)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tennis_tournament_scores (user_id, tournament_id, base_points, total_points, scored_at) VALUES
    (user_a_id, tourn_completed, 42, 42, now() - interval '15 days'),
    (user_b_id, tourn_completed, 35, 35, now() - interval '15 days')
  ON CONFLICT (user_id, tournament_id) DO NOTHING;

  -- atp_finals (group stage only, smoke)
  INSERT INTO tennis_tournaments (id, season_year, name, tournament_type, surface, start_date, end_date, status, sort_order)
  VALUES (tourn_atp_finals, 2026, 'Seed ATP Finals', 'atp_finals', 'hard', CURRENT_DATE + 60, CURRENT_DATE + 67, 'roster_open', 3)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tennis_tournament_players (id, tournament_id, player_name, tier) VALUES
    (atp_p1, tourn_atp_finals, 'ATP Finalist 1', 1), (atp_p2, tourn_atp_finals, 'ATP Finalist 2', 1),
    (atp_p3, tourn_atp_finals, 'ATP Finalist 3', 1), (atp_p4, tourn_atp_finals, 'ATP Finalist 4', 1),
    (atp_p5, tourn_atp_finals, 'ATP Finalist 5', 1), (atp_p6, tourn_atp_finals, 'ATP Finalist 6', 1),
    (atp_p7, tourn_atp_finals, 'ATP Finalist 7', 1), (atp_p8, tourn_atp_finals, 'ATP Finalist 8', 1)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO tennis_atp_finals_matches (season_year, match_number, match_type, player_a_id, player_b_id) VALUES
    (2026, 1,  'group', atp_p1, atp_p2), (2026, 2,  'group', atp_p1, atp_p3), (2026, 3,  'group', atp_p1, atp_p4),
    (2026, 4,  'group', atp_p2, atp_p3), (2026, 5,  'group', atp_p2, atp_p4), (2026, 6,  'group', atp_p3, atp_p4),
    (2026, 7,  'group', atp_p5, atp_p6), (2026, 8,  'group', atp_p5, atp_p7), (2026, 9,  'group', atp_p5, atp_p8),
    (2026, 10, 'group', atp_p6, atp_p7), (2026, 11, 'group', atp_p6, atp_p8), (2026, 12, 'group', atp_p7, atp_p8)
  ON CONFLICT (season_year, match_number) DO NOTHING;

  RAISE NOTICE 'Seeded 1 player_box + tennis_seasons + ace_cards + 4 tournaments (roster_open/qf_captain_open/completed/atp_finals)';
END $$;

-- ── 10. Admin gating ────────────────────────────────────────────────────────
-- TennisAdminScreen checks users.is_admin directly. F1AdminScreen instead
-- uses is_competition_admin('paddock', paddock_id) — user_a already passes
-- that via paddocks.created_by (migration 243_competition_admin_model.sql),
-- no extra seed needed for F1.
UPDATE public.users SET is_admin = true WHERE id = 'e0000000-0000-4000-a000-00000000000a';
