-- Migration 155: add clean_sheet bet template; retire player_block
--
-- clean_sheet: managers pick a team; commissioner resolves after the match.
-- player_block: removed from the UI; marking inactive here so it no longer
--   surfaces in template lookups or duplicate-guard queries.

INSERT INTO bet_templates (slug, title, description, answer_type, scope_type, default_reward, reward_type, is_active, sort_order)
VALUES ('clean_sheet', 'Clean Sheet', 'Pick a team — if they keep a clean sheet you earn points.', 'team_pick', 'match', '5', 'points', true, 3)
ON CONFLICT (slug) DO UPDATE
  SET title        = EXCLUDED.title,
      description  = EXCLUDED.description,
      answer_type  = EXCLUDED.answer_type,
      is_active    = EXCLUDED.is_active,
      sort_order   = EXCLUDED.sort_order;

-- Retire player_block — no longer shown in the UI
UPDATE bet_templates SET is_active = false WHERE slug = 'player_block';
