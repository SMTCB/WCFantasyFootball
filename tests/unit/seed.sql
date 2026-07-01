-- ── Test harness seed — B2 / TEST-1 ──────────────────────────────────────────
--
-- Deterministic seed for the unit/integration test harness.
-- Loaded into an ephemeral local Postgres before each test run.
-- ALL IDs are fixed UUIDs so tests can reference them directly.
-- Does NOT call any Supabase-specific extensions (pgcron, pg_net, auth schema).
--
-- IMPORTANT: this file must be idempotent (INSERT … ON CONFLICT DO NOTHING)
-- so it can be re-run safely.

-- ── Fixed IDs ─────────────────────────────────────────────────────────────────
-- Users
-- TEST_USER_A  = 'aaaaaaaa-0000-4000-a000-000000000001'
-- TEST_USER_B  = 'aaaaaaaa-0000-4000-a000-000000000002'
-- TEST_COMMISSIONER = 'aaaaaaaa-0000-4000-a000-000000000099'

-- Leagues
-- CLASSIC_LEAGUE   = 'bbbbbbbb-0000-4000-b000-000000000001'
-- DRAFT_LEAGUE     = 'bbbbbbbb-0000-4000-b000-000000000002'

-- Squads
-- SQUAD_A_CLASSIC  = 'cccccccc-0000-4000-c000-000000000001'
-- SQUAD_B_CLASSIC  = 'cccccccc-0000-4000-c000-000000000002'
-- SQUAD_A_DRAFT    = 'cccccccc-0000-4000-c000-000000000003'

-- Tournament / fixture
-- TOURNAMENT_ID  = 'TEST_429'
-- MATCHDAY_ID    = 'TEST_429-r1'
-- FIXTURE_ID     = 'test-fixture-0001'

-- Coin wallet
-- WALLET_A  (owned by TEST_USER_A)

-- Bet instance
-- BET_INSTANCE_1 = 'dddddddd-0000-4000-d000-000000000001'

-- Auction listing
-- AUCTION_1 = 'eeeeeeee-0000-4000-e000-000000000001'

-- ── Users ─────────────────────────────────────────────────────────────────────

INSERT INTO users (id, username, email)
VALUES
  ('aaaaaaaa-0000-4000-a000-000000000001', 'test_user_a', 'test_a@example.com'),
  ('aaaaaaaa-0000-4000-a000-000000000002', 'test_user_b', 'test_b@example.com'),
  ('aaaaaaaa-0000-4000-a000-000000000099', 'test_commissioner', 'test_commissioner@example.com')
ON CONFLICT (id) DO NOTHING;

-- ── Tournament ────────────────────────────────────────────────────────────────

INSERT INTO tournaments (id, name, provider, provider_key, sport_id)
VALUES
  ('TEST_429', 'Test World Cup 2026', 'forza', 'TEST_429', NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Leagues ───────────────────────────────────────────────────────────────────

INSERT INTO leagues (id, name, format, tournament_id, created_by, league_mode, invite_code)
VALUES
  ('bbbbbbbb-0000-4000-b000-000000000001', 'TEST_Classic_League', 'classic', 'TEST_429',
   'aaaaaaaa-0000-4000-a000-000000000099', 'classic', 'TEST-CLS-001'),
  ('bbbbbbbb-0000-4000-b000-000000000002', 'TEST_Draft_League', 'noduplicate', 'TEST_429',
   'aaaaaaaa-0000-4000-a000-000000000099', 'draft', 'TEST-DRF-001')
ON CONFLICT (id) DO NOTHING;

-- ── League members ────────────────────────────────────────────────────────────

INSERT INTO league_members (league_id, user_id, role, total_points)
VALUES
  ('bbbbbbbb-0000-4000-b000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000001', 'member', 0),
  ('bbbbbbbb-0000-4000-b000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000002', 'member', 0),
  ('bbbbbbbb-0000-4000-b000-000000000001', 'aaaaaaaa-0000-4000-a000-000000000099', 'commissioner', 0),
  ('bbbbbbbb-0000-4000-b000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000001', 'member', 0),
  ('bbbbbbbb-0000-4000-b000-000000000002', 'aaaaaaaa-0000-4000-a000-000000000099', 'commissioner', 0)
ON CONFLICT (league_id, user_id) DO NOTHING;

-- ── League config ─────────────────────────────────────────────────────────────

INSERT INTO league_config (league_id, key, value)
VALUES
  ('bbbbbbbb-0000-4000-b000-000000000001', 'budget', '100'),
  ('bbbbbbbb-0000-4000-b000-000000000001', 'free_transfers_per_round', '3'),
  ('bbbbbbbb-0000-4000-b000-000000000001', 'club_cap', '3'),
  ('bbbbbbbb-0000-4000-b000-000000000001', 'transfer_penalty', '4'),
  ('bbbbbbbb-0000-4000-b000-000000000002', 'budget', '100'),
  ('bbbbbbbb-0000-4000-b000-000000000002', 'draft_list_size', '45')
ON CONFLICT (league_id, key) DO NOTHING;

-- ── Matchday deadlines ────────────────────────────────────────────────────────

INSERT INTO matchday_deadlines (league_id, matchday_id, deadline_at)
VALUES
  ('bbbbbbbb-0000-4000-b000-000000000001', 'TEST_429-r1', NOW() + INTERVAL '7 days'),
  ('bbbbbbbb-0000-4000-b000-000000000002', 'TEST_429-r1', NOW() + INTERVAL '7 days')
ON CONFLICT (league_id, matchday_id) DO NOTHING;

-- ── Players (15 per club so we can test club cap) ─────────────────────────────

INSERT INTO players (id, name, position, nationality, club, price, tournament_id, forza_team_id)
VALUES
  -- Club ARG (3 players — at cap)
  ('test-gk-arg-01', 'ARG GK 1',  'GK',  'Argentina', 'Argentina', 6.5, 'TEST_429', 'CLUB_ARG'),
  ('test-def-arg-01','ARG DEF 1', 'DEF', 'Argentina', 'Argentina', 5.5, 'TEST_429', 'CLUB_ARG'),
  ('test-def-arg-02','ARG DEF 2', 'DEF', 'Argentina', 'Argentina', 5.0, 'TEST_429', 'CLUB_ARG'),
  -- Club BRA
  ('test-def-bra-01','BRA DEF 1', 'DEF', 'Brazil',    'Brazil',    5.0, 'TEST_429', 'CLUB_BRA'),
  ('test-mid-bra-01','BRA MID 1', 'MID', 'Brazil',    'Brazil',    6.0, 'TEST_429', 'CLUB_BRA'),
  ('test-mid-bra-02','BRA MID 2', 'MID', 'Brazil',    'Brazil',    5.5, 'TEST_429', 'CLUB_BRA'),
  -- Club ENG
  ('test-mid-eng-01','ENG MID 1', 'MID', 'England',   'England',   5.5, 'TEST_429', 'CLUB_ENG'),
  ('test-fwd-eng-01','ENG FWD 1', 'FWD', 'England',   'England',   7.0, 'TEST_429', 'CLUB_ENG'),
  ('test-fwd-eng-02','ENG FWD 2', 'FWD', 'England',   'England',   6.5, 'TEST_429', 'CLUB_ENG'),
  -- Club FRA (extras — for transfer tests)
  ('test-fwd-fra-01','FRA FWD 1', 'FWD', 'France',    'France',    7.5, 'TEST_429', 'CLUB_FRA'),
  ('test-mid-fra-01','FRA MID 1', 'MID', 'France',    'France',    6.0, 'TEST_429', 'CLUB_FRA'),
  ('test-def-fra-01','FRA DEF 1', 'DEF', 'France',    'France',    5.0, 'TEST_429', 'CLUB_FRA'),
  -- Club GER (extras — for club-cap breach tests)
  ('test-gk-ger-01', 'GER GK 1',  'GK',  'Germany',  'Germany',   6.0, 'TEST_429', 'CLUB_GER'),
  ('test-def-ger-01','GER DEF 1', 'DEF', 'Germany',   'Germany',   5.0, 'TEST_429', 'CLUB_GER'),
  ('test-def-ger-02','GER DEF 2', 'DEF', 'Germany',   'Germany',   4.5, 'TEST_429', 'CLUB_GER'),
  ('test-def-ger-03','GER DEF 3', 'DEF', 'Germany',   'Germany',   4.5, 'TEST_429', 'CLUB_GER')
ON CONFLICT (id) DO NOTHING;

-- ── Squads ────────────────────────────────────────────────────────────────────
-- SQUAD_A_CLASSIC: 11 players, budget 47.0, initial_build_complete = true
-- starting XI: all 11
-- captain: test-fwd-eng-01

INSERT INTO squads (
  id, league_id, user_id, matchday_id,
  players, starting_xi, captain_id,
  budget_remaining, initial_build_complete, round_transfers
)
VALUES (
  'cccccccc-0000-4000-c000-000000000001',
  'bbbbbbbb-0000-4000-b000-000000000001',
  'aaaaaaaa-0000-4000-a000-000000000001',
  'TEST_429-r1',
  ARRAY[
    'test-gk-arg-01','test-def-arg-01','test-def-arg-02',
    'test-def-bra-01','test-mid-bra-01','test-mid-bra-02',
    'test-mid-eng-01','test-fwd-eng-01','test-fwd-eng-02',
    'test-fwd-fra-01','test-mid-fra-01'
  ],
  ARRAY[
    'test-gk-arg-01','test-def-arg-01','test-def-arg-02',
    'test-def-bra-01','test-mid-bra-01','test-mid-bra-02',
    'test-mid-eng-01','test-fwd-eng-01','test-fwd-eng-02',
    'test-fwd-fra-01','test-mid-fra-01'
  ],
  'test-fwd-eng-01',
  47.0,   -- budget remaining (100 - sum of player prices 53.0)
  true,
  '{}'
)
ON CONFLICT (id) DO NOTHING;

-- SQUAD_B_CLASSIC: user B, 11 players, budget 45.5
INSERT INTO squads (
  id, league_id, user_id, matchday_id,
  players, starting_xi, captain_id,
  budget_remaining, initial_build_complete, round_transfers
)
VALUES (
  'cccccccc-0000-4000-c000-000000000002',
  'bbbbbbbb-0000-4000-b000-000000000001',
  'aaaaaaaa-0000-4000-a000-000000000002',
  'TEST_429-r1',
  ARRAY[
    'test-gk-arg-01','test-def-arg-01','test-def-bra-01',
    'test-mid-bra-01','test-mid-bra-02','test-mid-eng-01',
    'test-fwd-eng-01','test-fwd-eng-02','test-fwd-fra-01',
    'test-mid-fra-01','test-def-fra-01'
  ],
  ARRAY[
    'test-gk-arg-01','test-def-arg-01','test-def-bra-01',
    'test-mid-bra-01','test-mid-bra-02','test-mid-eng-01',
    'test-fwd-eng-01','test-fwd-eng-02','test-fwd-fra-01',
    'test-mid-fra-01','test-def-fra-01'
  ],
  'test-fwd-fra-01',
  45.5,
  true,
  '{}'
)
ON CONFLICT (id) DO NOTHING;

-- SQUAD_A_DRAFT: user A, draft league, 8 players (incomplete — initial_build_complete false)
INSERT INTO squads (
  id, league_id, user_id, matchday_id,
  players, starting_xi, captain_id,
  budget_remaining, initial_build_complete, round_transfers
)
VALUES (
  'cccccccc-0000-4000-c000-000000000003',
  'bbbbbbbb-0000-4000-b000-000000000002',
  'aaaaaaaa-0000-4000-a000-000000000001',
  'TEST_429-r1',
  ARRAY[
    'test-gk-arg-01','test-def-arg-01','test-def-arg-02',
    'test-def-bra-01','test-mid-bra-01','test-mid-bra-02',
    'test-mid-eng-01','test-fwd-eng-01'
  ],
  ARRAY[]::text[],
  NULL,
  55.0,
  false,  -- initial build not complete — transfer limit should be bypassed
  '{}'
)
ON CONFLICT (id) DO NOTHING;

-- ── Fixture ───────────────────────────────────────────────────────────────────

INSERT INTO fixtures (
  id, tournament_id, matchday_id, round_number,
  home_team, away_team, home_team_forza_id, away_team_forza_id,
  kickoff_at, status
)
VALUES (
  'test-fixture-0001', 'TEST_429', 'TEST_429-r1', 1,
  'England', 'France', 'CLUB_ENG', 'CLUB_FRA',
  NOW() + INTERVAL '2 days', 'scheduled'
)
ON CONFLICT (id) DO NOTHING;

-- ── Coin wallets ──────────────────────────────────────────────────────────────

INSERT INTO coin_wallets (user_id, balance, escrow_balance)
VALUES
  ('aaaaaaaa-0000-4000-a000-000000000001', 500, 0),
  ('aaaaaaaa-0000-4000-a000-000000000002', 200, 0),
  ('aaaaaaaa-0000-4000-a000-000000000099', 1000, 0)
ON CONFLICT (user_id) DO NOTHING;

-- ── Bet instance ──────────────────────────────────────────────────────────────

INSERT INTO bet_instances (
  id, league_id, title, description,
  bet_type, answer_type, scope_type,
  options, deadline_at, status, created_by
)
VALUES (
  'dddddddd-0000-4000-d000-000000000001',
  'bbbbbbbb-0000-4000-b000-000000000001',
  'Test Bet — Match Result',
  'Who wins England vs France?',
  'standard', 'option_pick', 'match',
  '["England","France","Draw"]'::jsonb,
  NOW() + INTERVAL '2 days',
  'open',
  'aaaaaaaa-0000-4000-a000-000000000099'
)
ON CONFLICT (id) DO NOTHING;

-- ── Auction listing ───────────────────────────────────────────────────────────

INSERT INTO auction_listings (
  id, league_id, seller_id, player_id,
  min_bid, current_bid, highest_bidder_id,
  status, deadline_at
)
VALUES (
  'eeeeeeee-0000-4000-e000-000000000001',
  'bbbbbbbb-0000-4000-b000-000000000001',
  'aaaaaaaa-0000-4000-a000-000000000002',  -- seller: user B
  'test-mid-fra-01',
  2.0, 2.0, NULL,
  'open',
  NOW() + INTERVAL '1 day'
)
ON CONFLICT (id) DO NOTHING;
