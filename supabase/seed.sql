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
