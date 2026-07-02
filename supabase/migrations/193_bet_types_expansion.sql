-- 193: Expand bet_templates — add category column + seed 22 new bet types
-- Session 2026-07-02
--
-- answer_type constraint: player_pick | team_pick | number | yes_no
-- scope_type constraint:  match | matchday | season
--
-- Mapping:
--   fixture 3-way / 2-way / winning_margin / goal_interval / free_bet → team_pick
--   binary yes/no (btts, penalty, etc.) → yes_no
--   over/under → number
--   player bets → player_pick

-- 1. Add category column (default 'match' for backwards compat)
ALTER TABLE bet_templates ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'match';

-- 2. Backfill existing templates
UPDATE bet_templates SET category = 'players' WHERE slug = 'top_scorer';
UPDATE bet_templates SET category = 'match'   WHERE slug = 'match_result';
UPDATE bet_templates SET category = 'match'   WHERE slug = 'clean_sheet';
UPDATE bet_templates SET category = 'custom'  WHERE slug = 'player_block';

-- 3. New MATCH templates
INSERT INTO bet_templates (slug, title, description, answer_type, scope_type, category, is_active, sort_order) VALUES
  ('first_team_score',    'First Team to Score',                'Which team scores first in the match?',                           'team_pick',   'match',      'match',   true, 20),
  ('btts',                'Both Teams to Score',                'Will both teams score in this match?',                            'yes_no',      'match',      'match',   true, 30),
  ('lead_at_halftime',    'Lead at Half-time',                  'Who will be leading at the end of the first half?',               'team_pick',   'match',      'match',   true, 40),
  ('second_half_winner',  'Second Half Winner',                 'Who will win the second half?',                                   'team_pick',   'match',      'match',   true, 50),
  ('winning_margin',      'Winning Margin',                     'What will be the winning margin at full time?',                   'team_pick',   'match',      'match',   true, 60),
  ('most_corners_team',   'Most Corners — Which Team',          'Which team will win the corner count?',                           'team_pick',   'match',      'match',   true, 70),
  ('penalty_in_match',    'Penalty in the Match',               'Will a penalty be awarded during this match?',                    'yes_no',      'match',      'match',   true, 80),
  ('red_card_in_match',   'Red Card in the Match',              'Will a red card be shown during this match?',                     'yes_no',      'match',      'match',   true, 90),
  ('btts_first_half',     'Both Teams Score — 1st Half',        'Will both teams score in the first half only?',                   'yes_no',      'match',      'match',   true, 100),
  ('comeback_win',        'Comeback Win',                       'Will a team that concedes first go on to win the match?',         'yes_no',      'match',      'match',   true, 110)
ON CONFLICT (slug) DO NOTHING;

-- 4. New STATS templates
INSERT INTO bet_templates (slug, title, description, answer_type, scope_type, category, is_active, sort_order) VALUES
  ('goals_ou',            'Goals Over / Under',                 'Will the match have more or fewer goals than the line?',          'number',      'match',      'stats',   true, 200),
  ('first_half_goals_ou', '1st Half Goals O/U',                 'Over or under the line for first-half goals?',                    'number',      'match',      'stats',   true, 210),
  ('shots_on_target_ou',  'Shots on Target O/U',                'Over or under the line for total shots on target?',               'number',      'match',      'stats',   true, 220),
  ('total_corners_ou',    'Total Corners O/U',                  'Over or under the line for total corners in the match?',          'number',      'match',      'stats',   true, 230),
  ('card_count_ou',       'Card Count O/U',                     'Over or under the line for total cards shown in the match?',      'number',      'match',      'stats',   true, 240),
  ('total_offsides_ou',   'Total Offsides O/U',                 'Over or under the line for total offsides in the match?',         'number',      'match',      'stats',   true, 250),
  ('total_subs_ou',       'Total Substitutions O/U',            'Over or under the line for substitutions made in the match?',     'number',      'match',      'stats',   true, 260),
  ('goal_interval',       'Goal Interval',                      'In which 15-minute window will the first goal be scored?',        'team_pick',   'match',      'stats',   true, 270)
ON CONFLICT (slug) DO NOTHING;

-- 5. New PLAYERS templates
INSERT INTO bet_templates (slug, title, description, answer_type, scope_type, category, is_active, sort_order) VALUES
  ('anytime_goalscorer',  'Anytime Goalscorer',                 'Pick a player who will score at any point in the match.',         'player_pick', 'match',      'players', true, 310),
  ('yellow_card',         'Player to get Yellow Card',          'Pick a player who will receive a yellow card.',                   'player_pick', 'match',      'players', true, 320),
  ('man_of_match',        'Man of the Match',                   'Who will be the standout player in this match?',                  'player_pick', 'match',      'players', true, 330)
ON CONFLICT (slug) DO NOTHING;

-- 6. CUSTOM template (scope=matchday — most flexible default for a free-form bet)
INSERT INTO bet_templates (slug, title, description, answer_type, scope_type, category, is_active, sort_order) VALUES
  ('free_bet',            'Free Bet',                           'Custom prediction — commissioner writes the question and options.','team_pick',   'matchday',   'custom',  true, 400)
ON CONFLICT (slug) DO NOTHING;

-- 7. Backfill sort_order on original templates that may have 0 or NULL
UPDATE bet_templates SET sort_order = 10  WHERE slug = 'match_result'  AND (sort_order IS NULL OR sort_order = 0);
UPDATE bet_templates SET sort_order = 300 WHERE slug = 'top_scorer'    AND (sort_order IS NULL OR sort_order = 0);
UPDATE bet_templates SET sort_order = 15  WHERE slug = 'clean_sheet'   AND (sort_order IS NULL OR sort_order = 0);
