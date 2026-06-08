-- Migration 157: MD4 extension + scoring rule adjustments for tournament 623
--
-- 1. Assign Argentina-Iceland and Portugal-Nigeria fixtures to 623-r4
-- 2. Add matchday deadline for 623-r4
-- 3. Copy Argentina players from WC 429 to tournament 623
-- 4. Create synthetic Iceland squad for tournament 623
-- 5. Create synthetic Nigeria squad for tournament 623
-- 6. Update scoring_rules for tournament 623:
--    GK goal 6, MID shot_on_target 0.25, FWD big_chance_created 0.5, penalty_missed -2
-- 7. minutes_per_60 and DEF clean_sheet 45-min gate are in calculate-scores v24 (Edge Function)

-- ── 1. Assign MD4 fixtures ──────────────────────────────────────────────────────
UPDATE fixtures SET matchday_id = '623-r4'
WHERE id IN ('f-1220174851', 'f-1220144887');

-- ── 2. Matchday deadline for 623-r4 ────────────────────────────────────────────
INSERT INTO matchday_deadlines (tournament_id, matchday_id, deadline_at)
VALUES ('623', '623-r4', '2026-06-09 23:00:00+00')
ON CONFLICT DO NOTHING;

-- ── 3. Copy Argentina from WC 429 ──────────────────────────────────────────────
INSERT INTO players (id, name, nationality, club, position, forza_player_id, forza_team_id, tournament_id, price, is_active)
SELECT
  'fp-' || forza_player_id || '-623',
  name, nationality, 'Argentina', position, forza_player_id, forza_team_id, '623',
  COALESCE(price, ROUND((RANDOM() * 2 + 4)::NUMERIC, 1)),
  true
FROM players
WHERE tournament_id = '429' AND nationality = 'Argentina'
ON CONFLICT (id) DO NOTHING;

-- ── 4. Iceland synthetic squad ─────────────────────────────────────────────────
INSERT INTO players (id, name, nationality, club, position, forza_player_id, forza_team_id, tournament_id, price, is_active) VALUES
  ('syn-iceland-001-623','Hannes Halldorsson',        'Iceland','Iceland','GK', 'syn-isl-001','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-002-623','Runar Alex Runarsson',      'Iceland','Iceland','GK', 'syn-isl-002','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-003-623','Gunnar Nielsen',            'Iceland','Iceland','GK', 'syn-isl-003','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-004-623','Ari Skulason',              'Iceland','Iceland','DEF','syn-isl-004','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-005-623','Hordur Bjorgvin Magnusson', 'Iceland','Iceland','DEF','syn-isl-005','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-006-623','Kari Arnason',              'Iceland','Iceland','DEF','syn-isl-006','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-007-623','Birkir Mar Saevarsson',     'Iceland','Iceland','DEF','syn-isl-007','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-008-623','Ragnar Sigurdsson',         'Iceland','Iceland','DEF','syn-isl-008','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-009-623','Sverrir Ingason',           'Iceland','Iceland','DEF','syn-isl-009','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-010-623','Viktor Sigurdsson',         'Iceland','Iceland','DEF','syn-isl-010','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-011-623','Egill Sigurdsson',          'Iceland','Iceland','DEF','syn-isl-011','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-012-623','Birkir Bjarnason',          'Iceland','Iceland','MID','syn-isl-012','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-013-623','Aron Gunnarsson',           'Iceland','Iceland','MID','syn-isl-013','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-014-623','Emil Hallfredsson',         'Iceland','Iceland','MID','syn-isl-014','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-015-623','Sigurdur Egill Sighvatsson','Iceland','Iceland','MID','syn-isl-015','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-016-623','Johann Gudmundsson',        'Iceland','Iceland','MID','syn-isl-016','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-017-623','Jon Gudni Fjolnisson',      'Iceland','Iceland','MID','syn-isl-017','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-018-623','Brynjar Gunnarsson',        'Iceland','Iceland','MID','syn-isl-018','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-019-623','Albert Gudmundsson',        'Iceland','Iceland','FWD','syn-isl-019','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-020-623','Kolbeinn Sigthórsson',      'Iceland','Iceland','FWD','syn-isl-020','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-021-623','Willum Thor Willumsson',    'Iceland','Iceland','FWD','syn-isl-021','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-022-623','Andri Gudjohnsen',          'Iceland','Iceland','FWD','syn-isl-022','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-iceland-023-623','Annar Wren-Presthus',       'Iceland','Iceland','FWD','syn-isl-023','syn-isl-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true)
ON CONFLICT (id) DO NOTHING;

-- ── 5. Nigeria synthetic squad ─────────────────────────────────────────────────
INSERT INTO players (id, name, nationality, club, position, forza_player_id, forza_team_id, tournament_id, price, is_active) VALUES
  ('syn-nigeria-001-623','Stanley Nwabali',      'Nigeria','Nigeria','GK', 'syn-nga-001','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-002-623','Francis Uzoho',        'Nigeria','Nigeria','GK', 'syn-nga-002','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-003-623','Maduka Okoye',         'Nigeria','Nigeria','GK', 'syn-nga-003','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-004-623','William Troost-Ekong', 'Nigeria','Nigeria','DEF','syn-nga-004','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-005-623','Leon Balogun',         'Nigeria','Nigeria','DEF','syn-nga-005','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-006-623','Chidozie Awaziem',     'Nigeria','Nigeria','DEF','syn-nga-006','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-007-623','Zaidu Sanusi',         'Nigeria','Nigeria','DEF','syn-nga-007','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-008-623','Calvin Bassey',        'Nigeria','Nigeria','DEF','syn-nga-008','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-009-623','Semi Ajayi',           'Nigeria','Nigeria','DEF','syn-nga-009','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-010-623','Bright Osayi-Samuel',  'Nigeria','Nigeria','DEF','syn-nga-010','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-011-623','Ola Aina',             'Nigeria','Nigeria','DEF','syn-nga-011','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-012-623','Wilfred Ndidi',        'Nigeria','Nigeria','MID','syn-nga-012','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-013-623','Alex Iwobi',           'Nigeria','Nigeria','MID','syn-nga-013','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-014-623','Joe Aribo',            'Nigeria','Nigeria','MID','syn-nga-014','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-015-623','Oghenekaro Etebo',     'Nigeria','Nigeria','MID','syn-nga-015','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-016-623','Frank Onyeka',         'Nigeria','Nigeria','MID','syn-nga-016','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-017-623','Fisayo Dele-Bashiru',  'Nigeria','Nigeria','MID','syn-nga-017','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-018-623','Moses Simon',          'Nigeria','Nigeria','MID','syn-nga-018','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-019-623','Victor Osimhen',       'Nigeria','Nigeria','FWD','syn-nga-019','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-020-623','Ademola Lookman',      'Nigeria','Nigeria','FWD','syn-nga-020','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-021-623','Emmanuel Dennis',      'Nigeria','Nigeria','FWD','syn-nga-021','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-022-623','Paul Onuachu',         'Nigeria','Nigeria','FWD','syn-nga-022','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true),
  ('syn-nigeria-023-623','Taiwo Awoniyi',        'Nigeria','Nigeria','FWD','syn-nga-023','syn-nga-team','623',ROUND((RANDOM()*1+4)::NUMERIC,1),true)
ON CONFLICT (id) DO NOTHING;

-- ── 6. Update scoring_rules for tournament 623 ─────────────────────────────────
UPDATE scoring_rules SET rules = jsonb_set(rules, '{goal}', '6'::jsonb)
WHERE tournament_id = '623' AND position = 'GK';

UPDATE scoring_rules SET rules = jsonb_set(rules, '{shot_on_target}', '0.25'::jsonb)
WHERE tournament_id = '623' AND position = 'MID';

UPDATE scoring_rules SET rules = jsonb_set(rules, '{big_chance_created}', '0.5'::jsonb)
WHERE tournament_id = '623' AND position = 'FWD';

UPDATE scoring_rules SET rules = jsonb_set(rules, '{penalty_missed}', '-2'::jsonb)
WHERE tournament_id = '623' AND position = 'UNIVERSAL';
