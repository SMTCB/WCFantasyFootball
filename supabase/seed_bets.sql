-- Seed test bet instances for manual testing
-- Run this in Supabase SQL editor after creating a test league

-- Replace these with your actual test league_id
-- Example: SELECT id FROM leagues LIMIT 1;
DO $$
DECLARE
  v_league_id UUID := 'YOUR_TEST_LEAGUE_ID_HERE';
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Bet 1: Top Scorer (matchday scope)
  INSERT INTO bet_instances (
    league_id, template_id, title, prompt, options, deadline_at,
    reward_value, reward_type, scope_type, scope_ref, status
  ) VALUES (
    v_league_id,
    (SELECT id FROM bet_templates WHERE slug = 'top_scorer' LIMIT 1),
    'MD5 Top Scorer',
    'Who will score the most goals in matchday 5?',
    '[]'::jsonb,
    v_now + INTERVAL '2 days',
    5,
    'points',
    'matchday',
    'MD5',
    'open'
  );

  -- Bet 2: Match Result (match scope)
  INSERT INTO bet_instances (
    league_id, template_id, title, prompt, options, deadline_at,
    reward_value, reward_type, scope_type, scope_ref, status
  ) VALUES (
    v_league_id,
    (SELECT id FROM bet_templates WHERE slug = 'match_result' LIMIT 1),
    'Arsenal vs Liverpool',
    'Predict the outcome of Arsenal vs Liverpool this weekend',
    '[]'::jsonb,
    v_now + INTERVAL '1 day',
    3,
    'points',
    'match',
    'fixture-001',
    'open'
  );

  -- Bet 3: Player Block (matchday scope) - will resolve to show opponent block mechanics
  INSERT INTO bet_instances (
    league_id, template_id, title, prompt, options, deadline_at,
    reward_value, reward_type, scope_type, scope_ref, status
  ) VALUES (
    v_league_id,
    (SELECT id FROM bet_templates WHERE slug = 'player_block' LIMIT 1),
    'Block Opponent Players',
    'Pick an opponent player — if they score <5 pts, you earn +4pts',
    '[]'::jsonb,
    v_now + INTERVAL '3 days',
    4,
    'points',
    'matchday',
    'MD5',
    'open'
  );

  -- Bet 4: Already-closed bet (for resolution demo)
  INSERT INTO bet_instances (
    league_id, template_id, title, prompt, options, deadline_at,
    reward_value, reward_type, scope_type, scope_ref, status
  ) VALUES (
    v_league_id,
    (SELECT id FROM bet_templates WHERE slug = 'top_scorer' LIMIT 1),
    'MD4 Top Scorer (Ready to Resolve)',
    'Who scored the most goals in MD4?',
    '[]'::jsonb,
    v_now - INTERVAL '6 hours',
    5,
    'points',
    'matchday',
    'MD4',
    'closed'
  );

  -- Bet 5: Already-resolved bet (for testing resolution display)
  INSERT INTO bet_instances (
    league_id, template_id, title, prompt, options, deadline_at,
    reward_value, reward_type, scope_type, scope_ref, status, correct_answer
  ) VALUES (
    v_league_id,
    (SELECT id FROM bet_templates WHERE slug = 'match_result' LIMIT 1),
    'Man City vs Chelsea (Resolved)',
    'Predict the outcome of Man City vs Chelsea',
    '[]'::jsonb,
    v_now - INTERVAL '1 day',
    3,
    'points',
    'match',
    'fixture-999',
    'resolved',
    'City Win'
  );

  RAISE NOTICE 'Seeded 5 bet instances for league %', v_league_id;
END $$;
