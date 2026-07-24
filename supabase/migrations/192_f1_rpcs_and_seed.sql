BEGIN;

-- ── PADDOCK RPCs ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_paddock(p_name text, p_circle_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paddock_id uuid;
  v_sport_id   uuid;
BEGIN
  SELECT id INTO v_sport_id FROM sports WHERE slug = 'f1';
  IF v_sport_id IS NULL THEN RAISE EXCEPTION 'F1_SPORT_NOT_FOUND'; END IF;

  INSERT INTO paddocks (name, created_by, sport_id)
    VALUES (p_name, auth.uid(), v_sport_id)
    RETURNING id INTO v_paddock_id;

  INSERT INTO paddock_members (paddock_id, user_id, role)
    VALUES (v_paddock_id, auth.uid(), 'owner');

  IF p_circle_id IS NOT NULL THEN
    INSERT INTO circle_paddocks (circle_id, paddock_id)
      VALUES (p_circle_id, v_paddock_id)
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_paddock_id;
END;
$$;
GRANT EXECUTE ON FUNCTION create_paddock(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION join_paddock_by_code(p_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_paddock_id uuid;
BEGIN
  SELECT id INTO v_paddock_id FROM paddocks WHERE invite_code = upper(p_code);
  IF v_paddock_id IS NULL THEN RAISE EXCEPTION 'PADDOCK_NOT_FOUND'; END IF;

  INSERT INTO paddock_members (paddock_id, user_id, role)
    VALUES (v_paddock_id, auth.uid(), 'member')
    ON CONFLICT (paddock_id, user_id) DO NOTHING;

  RETURN v_paddock_id;
END;
$$;
GRANT EXECUTE ON FUNCTION join_paddock_by_code(text) TO authenticated;

-- get_my_paddocks: list caller's paddocks with member count
CREATE OR REPLACE FUNCTION get_my_paddocks()
RETURNS TABLE (
  paddock_id   uuid,
  name         text,
  invite_code  text,
  role         text,
  member_count bigint,
  season       integer
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.invite_code,
    pm.role,
    COUNT(*) OVER (PARTITION BY p.id) AS member_count,
    p.season
  FROM paddock_members pm
  JOIN paddocks p ON p.id = pm.paddock_id
  WHERE pm.user_id = auth.uid()
  ORDER BY pm.joined_at;
END;
$$;
GRANT EXECUTE ON FUNCTION get_my_paddocks() TO authenticated;

-- get_paddock_leaderboard: ranked standings for a paddock
CREATE OR REPLACE FUNCTION get_paddock_leaderboard(p_paddock_id uuid)
RETURNS TABLE (
  user_id       uuid,
  display_name  text,
  avatar_url    text,
  total_points  bigint,
  race_points   bigint,
  year_points   bigint,
  races_scored  bigint,
  rank          bigint
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT
    pm.user_id,
    u.username                              AS display_name,
    u.avatar_url,
    COALESCE(SUM(s.total_points), 0)        AS total_points,
    COALESCE(SUM(s.total_points) FILTER (WHERE s.score_type = 'race'), 0) AS race_points,
    COALESCE(SUM(s.total_points) FILTER (WHERE s.score_type = 'year'), 0) AS year_points,
    COUNT(s.id) FILTER (WHERE s.score_type = 'race')                       AS races_scored,
    RANK() OVER (ORDER BY COALESCE(SUM(s.total_points), 0) DESC)           AS rank
  FROM paddock_members pm
  JOIN public.users u ON u.id = pm.user_id
  LEFT JOIN f1_scores s ON s.user_id = pm.user_id AND s.season = 2026
  WHERE pm.paddock_id = p_paddock_id
  GROUP BY pm.user_id, u.username, u.avatar_url;
END;
$$;
GRANT EXECUTE ON FUNCTION get_paddock_leaderboard(uuid) TO authenticated;

-- ── 2026 RACE CALENDAR SEED ──────────────────────────────────────────────────
INSERT INTO f1_races (season, round_number, gp_name, circuit, race_date, is_saturday, special_category_question, special_category_type) VALUES
  (2026,  1, 'Australian GP',          'Albert Park',             '2026-03-08', false, 'Number of pit stops by the 1st place finisher',                'options'),
  (2026,  2, 'Chinese GP',             'Shanghai International',  '2026-03-15', false, 'Driver who will receive a penalty during the race',            'driver'),
  (2026,  3, 'Japanese GP',            'Suzuka',                  '2026-03-29', false, 'Fastest lap',                                                  'driver'),
  (2026,  4, 'Bahrain GP',             'Sakhir',                  '2026-04-12', false, 'Fastest lap',                                                  'driver'),
  (2026,  5, 'Saudi Arabian GP',       'Jeddah Street Circuit',   '2026-04-19', false, 'Last place finisher (excluding DNFs)',                         'driver'),
  (2026,  6, 'Miami GP',               'Miami International',     '2026-05-03', false, 'Driver of the Day',                                            'driver'),
  (2026,  7, 'Canadian GP',            'Circuit Gilles Villeneuve','2026-05-24', false, 'Driver of the Day',                                           'driver'),
  (2026,  8, 'Monaco GP',              'Circuit de Monaco',       '2026-06-07', false, 'Team with the slowest pit stop',                               'team'),
  (2026,  9, 'Barcelona-Catalunya GP', 'Circuit de Catalunya',    '2026-06-14', false, 'Driver who recovers the most positions',                       'driver'),
  (2026, 10, 'Austrian GP',            'Red Bull Ring',           '2026-06-28', false, 'Time gap between 1st and 2nd place finisher',                  'options'),
  (2026, 11, 'British GP',             'Silverstone',             '2026-07-05', false, 'Number of DNFs',                                               'options'),
  (2026, 12, 'Belgian GP',             'Spa-Francorchamps',       '2026-07-19', false, 'Team with the fastest pit stop',                               'team'),
  (2026, 13, 'Hungarian GP',           'Hungaroring',             '2026-07-26', false, 'Number of DNFs',                                               'options'),
  (2026, 14, 'Dutch GP',               'Zandvoort',               '2026-08-23', false, 'Team with the fastest pit stop',                               'team'),
  (2026, 15, 'Italian GP',             'Monza',                   '2026-09-06', false, 'Number of safety car entries',                                 'options'),
  (2026, 16, 'Spanish GP (Madrid)',    'Madrid Street Circuit',   '2026-09-13', false, 'Team with fewest combined points',                             'team'),
  (2026, 17, 'Azerbaijan GP',          'Baku City Circuit',       '2026-09-26', true,  'Sprint race winner',                                           'driver'),
  (2026, 18, 'Singapore GP',           'Marina Bay Street Circuit','2026-10-11', false, 'Team with greatest gap between driver championship positions','team'),
  (2026, 19, 'United States GP',       'Circuit of the Americas', '2026-10-25', false, 'Driver leading at the end of lap 1',                          'driver'),
  (2026, 20, 'Mexico City GP',         'Autodromo Hermanos Rodriguez','2026-11-01', false, 'Number of safety car entries',                             'options'),
  (2026, 21, 'Sao Paulo GP',           'Autodromo Jose Carlos Pace','2026-11-08', false, 'First retirement',                                          'driver'),
  (2026, 22, 'Las Vegas GP',           'Las Vegas Strip Circuit', '2026-11-21', true,  'Sprint race winner',                                           'driver'),
  (2026, 23, 'Qatar GP',               'Lusail International',    '2026-11-29', false, 'Driver who loses the most positions from grid to finish',      'driver'),
  (2026, 24, 'Abu Dhabi GP',           'Yas Marina Circuit',      '2026-12-06', false, 'Team with the fastest pit stop',                               'team')
ON CONFLICT (season, round_number) DO NOTHING;

-- Seed special_category_options for type='options' races
UPDATE f1_races SET special_category_options = ARRAY['1','2','3','4+']
  WHERE season = 2026 AND round_number = 1;
UPDATE f1_races SET special_category_options = ARRAY['Under 1 second','1–5 seconds','5–10 seconds','10+ seconds']
  WHERE season = 2026 AND round_number = 10;
UPDATE f1_races SET special_category_options = ARRAY['0','1','2','3+']
  WHERE season = 2026 AND round_number IN (11, 13);
UPDATE f1_races SET special_category_options = ARRAY['0','1','2','3+']
  WHERE season = 2026 AND round_number IN (15, 20);

COMMIT;
