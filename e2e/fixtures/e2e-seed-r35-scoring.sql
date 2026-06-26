-- E2E scoring-verification seed — EPL 2025-26 Round 35 (completed season, real stats)
-- Purpose: verify captain ×2/×3 multiplier and end-of-round auto-substitution after the
-- session-79 test-data wipe. Run as DB owner (npx supabase db query --linked / SQL editor).
--
-- Scenario (league EPL_R35_SCORING_VERIFY, classic, tournament 426, matchday 426-r35):
--   TestComm  — captain Gyökeres (10.71) in XI + DNP starter Xavi Simons (0 min); bench-
--               priority MID Hinshelwood (8.98) auto-subs in. NO chip → captain ×2.
--   TestMgr2  — IDENTICAL squad + chips_used triple_captain row → captain ×3.
--   TestMgr3/4 — clean all-played XI (captain Szoboszlai) for standings.
--
-- Expected fantasy_points.total (calculate-scores rounds the TOTAL):
--   TestComm  = 105  (5 + 30.25 DEF + 38.22 MID[Hinshelwood subbed for Xavi] + 31.42 FWD[Gyökeres×2])
--   TestMgr2  = 116  (same, Gyökeres×3 → +10.71 vs TestComm; proves triple captain)
--   If auto-sub had NOT fired, TestComm would be 96 (Xavi 0 instead of Hinshelwood 8.98).
--   If captain had NOT applied, TestComm would be 94.
--
-- Players (round 35 fp = player_match_stats.fantasy_points):
--   GK   Raya fp-726686-426 (5.00) · Petrovic fp-2229728-426 (5.00, bench)
--   DEF  Mukiele fp-720865-426 (9.25) · Burn fp-812017-426 (7.25) · Bueno fp-2879446-426 (7.00)
--        · Hill fp-709618-426 (6.75) · van den Berg fp-1911867-426 (6.50, bench)
--   MID  Szoboszlai fp-1392164-426 (10.75) · Gallagher fp-2115140-426 (9.25)
--        · Damsgaard fp-473113-426 (9.24) · Xavi Simons fp-1096659603-426 (0.00 DNP)
--        · Hinshelwood fp-1210266686-426 (8.98, bench → auto-sub-in)
--   FWD  Gyökeres fp-523161-426 (10.71, captain) · Doku fp-1994-426 (10.00)
--        · Awoniyi fp-1341123-426 (10.00, bench)

INSERT INTO leagues (id, name, format, tournament_id, created_by, join_code, budget_total, squad_size, max_members)
VALUES ('e1100000-0000-4000-a000-000000000035', 'EPL_R35_SCORING_VERIFY', 'classic', '426',
        'aaaae001-0000-4000-a000-000000000001', 'R35VFY', 100, 15, 8);

INSERT INTO league_members (league_id, user_id, role) VALUES
  ('e1100000-0000-4000-a000-000000000035', 'aaaae001-0000-4000-a000-000000000001', 'commissioner'),
  ('e1100000-0000-4000-a000-000000000035', 'aaaae002-0000-4000-a000-000000000002', 'member'),
  ('e1100000-0000-4000-a000-000000000035', 'aaaae003-0000-4000-a000-000000000003', 'member'),
  ('e1100000-0000-4000-a000-000000000035', 'aaaae004-0000-4000-a000-000000000004', 'member');

-- TestComm + TestMgr2: identical squad; XI[8]=Xavi(DNP), bench[0]=Hinshelwood(auto-sub-in)
INSERT INTO squads (id, league_id, user_id, matchday_id, players, starting_xi, captain_id, budget_remaining) VALUES
  ('5a000001-0000-4000-a000-000000000001', 'e1100000-0000-4000-a000-000000000035', 'aaaae001-0000-4000-a000-000000000001', '426-r35',
   ARRAY['fp-726686-426','fp-720865-426','fp-812017-426','fp-2879446-426','fp-709618-426','fp-1392164-426','fp-2115140-426','fp-473113-426','fp-1096659603-426','fp-523161-426','fp-1994-426','fp-1210266686-426','fp-1911867-426','fp-1341123-426','fp-2229728-426'],
   ARRAY['fp-726686-426','fp-720865-426','fp-812017-426','fp-2879446-426','fp-709618-426','fp-1392164-426','fp-2115140-426','fp-473113-426','fp-1096659603-426','fp-523161-426','fp-1994-426'],
   'fp-523161-426', 0),
  ('5a000002-0000-4000-a000-000000000002', 'e1100000-0000-4000-a000-000000000035', 'aaaae002-0000-4000-a000-000000000002', '426-r35',
   ARRAY['fp-726686-426','fp-720865-426','fp-812017-426','fp-2879446-426','fp-709618-426','fp-1392164-426','fp-2115140-426','fp-473113-426','fp-1096659603-426','fp-523161-426','fp-1994-426','fp-1210266686-426','fp-1911867-426','fp-1341123-426','fp-2229728-426'],
   ARRAY['fp-726686-426','fp-720865-426','fp-812017-426','fp-2879446-426','fp-709618-426','fp-1392164-426','fp-2115140-426','fp-473113-426','fp-1096659603-426','fp-523161-426','fp-1994-426'],
   'fp-523161-426', 0),
  -- TestMgr3/4: clean all-played XI (Hinshelwood starts, Xavi benched), captain Szoboszlai
  ('5a000003-0000-4000-a000-000000000003', 'e1100000-0000-4000-a000-000000000035', 'aaaae003-0000-4000-a000-000000000003', '426-r35',
   ARRAY['fp-726686-426','fp-720865-426','fp-812017-426','fp-2879446-426','fp-709618-426','fp-1392164-426','fp-2115140-426','fp-473113-426','fp-1210266686-426','fp-523161-426','fp-1994-426','fp-1096659603-426','fp-1911867-426','fp-1341123-426','fp-2229728-426'],
   ARRAY['fp-726686-426','fp-720865-426','fp-812017-426','fp-2879446-426','fp-709618-426','fp-1392164-426','fp-2115140-426','fp-473113-426','fp-1210266686-426','fp-523161-426','fp-1994-426'],
   'fp-1392164-426', 0),
  ('5a000004-0000-4000-a000-000000000004', 'e1100000-0000-4000-a000-000000000035', 'aaaae004-0000-4000-a000-000000000004', '426-r35',
   ARRAY['fp-726686-426','fp-720865-426','fp-812017-426','fp-2879446-426','fp-709618-426','fp-1392164-426','fp-2115140-426','fp-473113-426','fp-1210266686-426','fp-523161-426','fp-1994-426','fp-1096659603-426','fp-1911867-426','fp-1341123-426','fp-2229728-426'],
   ARRAY['fp-726686-426','fp-720865-426','fp-812017-426','fp-2879446-426','fp-709618-426','fp-1392164-426','fp-2115140-426','fp-473113-426','fp-1210266686-426','fp-523161-426','fp-1994-426'],
   'fp-1392164-426', 0);

INSERT INTO chips_used (user_id, league_id, chip_type, matchday_id)
VALUES ('aaaae002-0000-4000-a000-000000000002', 'e1100000-0000-4000-a000-000000000035', 'triple_captain', '426-r35');
