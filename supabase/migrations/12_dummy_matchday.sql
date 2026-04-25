-- Migration 12: Dummy Matchday Data
-- Seeds 3 completed club fixtures with match events using real player IDs
-- from migrations 01 + 09. Running calculate-scores against these fixtures
-- will populate player_match_stats and fantasy_points.
--
-- Matchday: 'md2'
-- Fixtures:
--   md2-f1  Man City   2 – 0  Liverpool      (finished)
--   md2-f2  Real Madrid 2 – 1  Arsenal        (finished)
--   md2-f3  Bayern Munich 1 – 1  AC Milan     (live, minute 67 — for LiveScreen demo)

-- ─── Extend enums to cover scoring engine event types ─────────────────────────
-- event_type originally: goal | yellow | red | sub | var
-- calculate-scores also expects: assist | own_goal | penalty_saved | penalty_missed | sub_off
do $$ begin
  alter type event_type add value if not exists 'assist';
  alter type event_type add value if not exists 'own_goal';
  alter type event_type add value if not exists 'penalty_saved';
  alter type event_type add value if not exists 'penalty_missed';
  alter type event_type add value if not exists 'sub_off';
exception when others then null; end $$;

-- ─── Mark old alpha fixtures as finished ─────────────────────────────────────
update fixtures set status = 'finished', minute = '90'
where id in ('f1', 'f2');

-- ─── Matchday deadline for md2 ────────────────────────────────────────────────
delete from matchday_deadlines where matchday_id = 'md2';
insert into matchday_deadlines (matchday_id, deadline_at, label)
values ('md2', now() + interval '7 days', 'Matchday 2');

-- ─── Fixtures ─────────────────────────────────────────────────────────────────
insert into fixtures (id, home_team, away_team, kickoff_at, competition, status, minute)
values
  ('md2-f1', 'Man City',      'Liverpool',    now() - interval '2 hours', 'Fantasy League MD2', 'finished', '90'),
  ('md2-f2', 'Real Madrid',   'Arsenal',      now() - interval '2 hours', 'Fantasy League MD2', 'finished', '90'),
  ('md2-f3', 'Bayern Munich', 'AC Milan',     now() - interval '1 hour',  'Fantasy League MD2', 'live',      '67')
on conflict (id) do update set
  status = excluded.status,
  minute = excluded.minute;

-- ─── Match Events ─────────────────────────────────────────────────────────────
-- Clear any prior events for these fixtures (idempotent re-run)
delete from match_events where fixture_id in ('md2-f1', 'md2-f2', 'md2-f3');

-- ── md2-f1: Man City 2 – 0 Liverpool ──────────────────────────────────────────
-- Man City scorers: Haaland (23'), De Bruyne assist; Foden (78')
-- Liverpool: clean sheet fails (2 conceded); Van Dijk yellow; Alisson penalty save
insert into match_events (fixture_id, player_id, type, minute, team) values
  ('md2-f1', 'a0000001-0000-0000-0000-000000000031', 'goal',          '23', 'Man City'),   -- Haaland goal
  ('md2-f1', 'p5',                                   'assist',        '23', 'Man City'),   -- De Bruyne assist
  ('md2-f1', 'a0000001-0000-0000-0000-000000000001', 'penalty_saved', '38', 'Liverpool'),  -- Alisson penalty save
  ('md2-f1', 'a0000001-0000-0000-0000-000000000011', 'yellow',        '55', 'Liverpool'),  -- Van Dijk yellow
  ('md2-f1', 'a0000001-0000-0000-0000-000000000025', 'goal',          '78', 'Man City'),   -- Foden goal
  ('md2-f1', 'a0000001-0000-0000-0000-000000000016', 'assist',        '78', 'Liverpool');  -- TAA assist (own assist — stays Liverpool side)

-- ── md2-f2: Real Madrid 2 – 1 Arsenal ─────────────────────────────────────────
-- Real Madrid: Mbappé (15', 88'); Bellingham assist (15')
-- Arsenal: Saka (50'); Rice assist (50')
insert into match_events (fixture_id, player_id, type, minute, team) values
  ('md2-f2', 'p2',                                   'goal',   '15', 'Real Madrid'),  -- Mbappé goal
  ('md2-f2', 'p3',                                   'assist', '15', 'Real Madrid'),  -- Bellingham assist
  ('md2-f2', 'a0000001-0000-0000-0000-000000000036', 'goal',   '50', 'Arsenal'),      -- Saka goal
  ('md2-f2', 'a0000001-0000-0000-0000-000000000022', 'assist', '50', 'Arsenal'),      -- Rice assist
  ('md2-f2', 'p2',                                   'goal',   '88', 'Real Madrid'),  -- Mbappé second goal
  ('md2-f2', 'p1',                                   'yellow', '90', 'Real Madrid');  -- Vinicius yellow

-- ── md2-f3: Bayern Munich 1 – 1 AC Milan (LIVE @ 67') ────────────────────────
-- Bayern: Kane (35'); Musiala assist (35')
-- AC Milan: Leao (67'); Neuer penalty save (80') — not yet happened (live)
insert into match_events (fixture_id, player_id, type, minute, team) values
  ('md2-f3', 'a0000001-0000-0000-0000-000000000032', 'goal',          '35', 'Bayern Munich'), -- Kane goal
  ('md2-f3', 'a0000001-0000-0000-0000-000000000027', 'assist',        '35', 'Bayern Munich'), -- Musiala assist
  ('md2-f3', 'a0000001-0000-0000-0000-000000000037', 'goal',          '67', 'AC Milan'),      -- Leao goal
  ('md2-f3', 'a0000001-0000-0000-0000-000000000014', 'yellow',        '58', 'AC Milan');      -- Theo Hernandez yellow

-- ─── Update João's squad to matchday md2 (so fantasy_points upsert hits it) ──
-- Only update if the squad exists; insert guard prevents failure on fresh DB.
update squads
set matchday_id = 'md2'
where user_id = '00000000-0000-0000-0000-000000000000'
  and league_id = '11111111-1111-1111-1111-111111111111';

-- ─── Seed a second squad (Ana) so we get multi-squad scoring output ───────────
-- Ana owns Real Madrid + Man City players across both fixtures
insert into squads (league_id, user_id, matchday_id, players, captain_id, budget_remaining)
values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  'md2',
  ARRAY[
    'p2',                                    -- Mbappé (Real Madrid FWD)
    'p3',                                    -- Bellingham (Real Madrid MID)
    'a0000001-0000-0000-0000-000000000031',  -- Haaland (Man City FWD)
    'a0000001-0000-0000-0000-000000000025',  -- Foden (Man City MID)
    'a0000001-0000-0000-0000-000000000002',  -- Courtois (Real Madrid GK)
    'a0000001-0000-0000-0000-000000000011',  -- Van Dijk (Liverpool DEF)
    'a0000001-0000-0000-0000-000000000032'   -- Kane (Bayern Munich FWD)
  ],
  'p2',   -- Mbappé as captain (x2 pts)
  65.0
)
on conflict (league_id, user_id, matchday_id) do update set
  players          = excluded.players,
  captain_id       = excluded.captain_id,
  budget_remaining = excluded.budget_remaining;
