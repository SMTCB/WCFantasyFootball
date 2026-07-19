-- 1. Create a Master User
INSERT INTO users (id, username, avatar_url, xp)
VALUES 
  ('00000000-0000-0000-0000-000000000000', 'João', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Joao', 1250)
ON CONFLICT (id) DO NOTHING;

-- 2. Create an Alpha League
INSERT INTO leagues (id, name, format, tournament_id, created_by)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'World Cup Legends', 'classic', 'wc2026', '00000000-0000-0000-0000-000000000000')
ON CONFLICT (id) DO NOTHING;

-- 3. Add João to the League
INSERT INTO league_members (league_id, user_id, rank, total_points)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 1, 312)
ON CONFLICT DO NOTHING;

-- 4. Seed Real Players
INSERT INTO players (id, name, position, nationality, club, price, photo_url)
VALUES 
  ('p1', 'Vinicius Jr.', 'FW', 'Brazil', 'Real Madrid', 12.5, 'https://img.a.transfermarkt.technology/portrait/header/432557-1663242045.jpg'),
  ('p2', 'Kylian Mbappé', 'FW', 'France', 'Real Madrid', 13.0, 'https://img.a.transfermarkt.technology/portrait/header/342229-1632989253.jpg'),
  ('p3', 'Jude Bellingham', 'MID', 'England', 'Real Madrid', 11.0, 'https://img.a.transfermarkt.technology/portrait/header/581678-1693987878.jpg'),
  ('p4', 'Pedri', 'MID', 'Spain', 'Barcelona', 9.5, 'https://img.a.transfermarkt.technology/portrait/header/683840-1620304931.jpg'),
  ('p5', 'Kevin De Bruyne', 'MID', 'Belgium', 'Man City', 10.5, 'https://img.a.transfermarkt.technology/portrait/header/88755-1663242045.jpg'),
  ('p6', 'Neymar Jr.', 'FW', 'Brazil', 'Al-Hilal', 10.0, 'https://img.a.transfermarkt.technology/portrait/header/68210-1632989253.jpg'),
  ('p7', 'Ederson', 'GK', 'Brazil', 'Man City', 6.0, 'https://img.a.transfermarkt.technology/portrait/header/238221-1663242045.jpg')
ON CONFLICT (id) DO NOTHING;

-- 5. Set Player Statuses (Danger Zone)
INSERT INTO player_status (player_id, status, confidence, reason, return_date)
VALUES 
  ('p5', 'doubt', 60, 'Minor hamstring tightness — training reduced', '2026-04-20'),
  ('p6', 'out', 0, 'Ankle surgery recovery', '2026-05-15'),
  ('p3', 'fit', 100, 'All clear', NULL)
ON CONFLICT (player_id) DO UPDATE SET 
  status = EXCLUDED.status,
  confidence = EXCLUDED.confidence,
  reason = EXCLUDED.reason,
  return_date = EXCLUDED.return_date;

-- 6. Seed Current Fixtures
INSERT INTO fixtures (id, home_team, away_team, kickoff_at, competition, status, minute)
VALUES 
  ('f1', 'BRA', 'KOR', '2026-04-18 21:00:00+00', 'World Cup R16', 'live', '72'),
  ('f2', 'FRA', 'POL', '2026-04-19 19:00:00+00', 'World Cup R16', 'scheduled', '0')
ON CONFLICT (id) DO NOTHING;

-- 7. Seed Initial Squad for João (Matchday 4)
INSERT INTO squads (league_id, user_id, matchday_id, players, captain_id, joker_player_id, locked_at)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', '4', ARRAY['p1', 'p2', 'p3', 'p4', 'p5', 'p7'], 'p2', 'p4', NOW())
ON CONFLICT (league_id, user_id, matchday_id) DO NOTHING;

-- 8. Top Scorer Prediction for João
INSERT INTO top_scorer_predictions (user_id, matchday_id, predicted_player_id)
VALUES 
  ('00000000-0000-0000-0000-000000000000', '4', 'p2')
ON CONFLICT DO NOTHING;
-- 9. Matchday Recap for João
INSERT INTO matchday_recaps (user_id, league_id, matchday_id, final_rank, final_points, rank_change, best_player_id, captain_id, joker_player_id, transfers_made, created_at)
VALUES 
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '3', 1, 87, 1, 'p1', 'p2', 'p4', 2, NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- 10. Add Other Members to the League
-- Ana / Ricardo users were referenced below but never inserted here — FK violation
-- on any fresh replay (local rebuild dry run, 2026-07-19). Adding them so this
-- decades-old dummy seed file can actually run end to end; no production impact,
-- migration 01 already applied to prod long ago.
INSERT INTO users (id, username, avatar_url, xp)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Ana', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ana', 980),
  ('22222222-2222-2222-2222-222222222222', 'Ricardo', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ricardo', 860)
ON CONFLICT (id) DO NOTHING;

INSERT INTO league_members (league_id, user_id, rank, total_points)
VALUES
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 2, 287),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 3, 271)
ON CONFLICT DO NOTHING;

-- 11. Seed H2H Records
INSERT INTO h2h_records (league_id, user_a_id, user_b_id, matchday_id, user_a_points, user_b_points, winner_id)
VALUES 
  -- João vs Ana
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '1', 71, 71, NULL),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '2', 81, 64, '00000000-0000-0000-0000-000000000000'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111', '3', 64, 87, '11111111-1111-1111-1111-111111111111'),
  -- João vs Ricardo
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', '1', 72, 75, '22222222-2222-2222-2222-222222222222'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', '2', 80, 61, '00000000-0000-0000-0000-000000000000'),
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222', '3', 65, 78, '22222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;
