-- ═══════════════════════════════════════════════════════════════════
-- E2E FULL SETUP SQL — EPL_OVERALL_E2E
-- Run once in: Supabase Dashboard → SQL Editor
--
-- Creates:
--   • 8 mock managers in public.users
--   • EPL draft league with squad_size=30, no position caps
--   • 8 league_members (manager 1 is commissioner)
--   • Draft submissions with intentional player overlap
--   • 3 test bets (one per category)
-- ═══════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────
-- 0. Constants / config
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  -- Manager UUIDs (predictable, easy to reference)
  m1 UUID := '10000000-0000-0000-0000-000000000001';
  m2 UUID := '10000000-0000-0000-0000-000000000002';
  m3 UUID := '10000000-0000-0000-0000-000000000003';
  m4 UUID := '10000000-0000-0000-0000-000000000004';
  m5 UUID := '10000000-0000-0000-0000-000000000005';
  m6 UUID := '10000000-0000-0000-0000-000000000006';
  m7 UUID := '10000000-0000-0000-0000-000000000007';
  m8 UUID := '10000000-0000-0000-0000-000000000008';

  league_id     UUID := 'e2e00000-0000-0000-0000-000000000001';
  tournament_id INT  := 426;   -- EPL
  squad_size    INT  := 30;
  draft_size    INT  := 30;

  -- Player pool: pick from real EPL players (tournament_id=426)
  all_players   UUID[];
  overlap_core  UUID[];  -- first 40 players — used by all managers
  ext_pool      UUID[];  -- remaining players for unique picks

  -- Per-manager draft lists
  sub1 UUID[]; sub2 UUID[]; sub3 UUID[]; sub4 UUID[];
  sub5 UUID[]; sub6 UUID[]; sub7 UUID[]; sub8 UUID[];

BEGIN

  -- ── 1. Load player pool from DB ────────────────────────────────
  SELECT ARRAY(
    SELECT id FROM players
    WHERE tournament_id = 426
    ORDER BY name
    LIMIT 300
  ) INTO all_players;

  IF array_length(all_players, 1) < draft_size * 8 THEN
    RAISE NOTICE 'WARNING: Only % players found — some squads may have overlap. Run sync-players first.', array_length(all_players, 1);
  END IF;

  -- First 40 are the "hot" overlap pool
  overlap_core := all_players[1:40];

  -- ── 2. Create 8 mock managers in public.users ──────────────────
  INSERT INTO public.users (id, username, avatar_url, xp)
  VALUES
    (m1, 'Alpha_FC',      'https://api.dicebear.com/7.x/avataaars/svg?seed=alpha',   500),
    (m2, 'Bravo_United',  'https://api.dicebear.com/7.x/avataaars/svg?seed=bravo',   450),
    (m3, 'Charlie_City',  'https://api.dicebear.com/7.x/avataaars/svg?seed=charlie', 400),
    (m4, 'Delta_Rovers',  'https://api.dicebear.com/7.x/avataaars/svg?seed=delta',   350),
    (m5, 'Echo_Athletic', 'https://api.dicebear.com/7.x/avataaars/svg?seed=echo',    300),
    (m6, 'Foxtrot_Town',  'https://api.dicebear.com/7.x/avataaars/svg?seed=foxtrot', 250),
    (m7, 'Golf_Palace',   'https://api.dicebear.com/7.x/avataaars/svg?seed=golf',    200),
    (m8, 'Hotel_Hotspur', 'https://api.dicebear.com/7.x/avataaars/svg?seed=hotel',   150)
  ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username;

  RAISE NOTICE '✓ 8 managers created in public.users';

  -- ── 3. Create the league ────────────────────────────────────────
  INSERT INTO leagues (
    id, name, format, tournament_id, created_by, max_members,
    squad_size, draft_list_size,
    position_limits,
    draft_position_caps,
    is_dry_run, transfers_open,
    draft_deadline,   -- past deadline so lottery runs immediately
    join_code
  )
  VALUES (
    league_id,
    'EPL_OVERALL_E2E',
    'noduplicate',   -- league_format enum = {classic, auction, noduplicate, hybrid}; 'draft' is NOT valid. noduplicate → league_mode='draft' via trg_sync_league_mode (migration 121)
    tournament_id,
    m1,              -- Alpha_FC is commissioner
    8,
    squad_size,      -- 30-player squads
    draft_size,      -- 30-player wish lists
    -- No position constraints: each slot can hold any position up to squad_size
    jsonb_build_object('GK', squad_size, 'DEF', squad_size, 'MID', squad_size, 'FWD', squad_size),
    jsonb_build_object('GK', draft_size, 'DEF', draft_size, 'MID', draft_size, 'FWD', draft_size),
    true,   -- dry run
    true,   -- transfers open
    NOW() - INTERVAL '1 hour',   -- draft deadline already past
    'E2ETEST'
  )
  ON CONFLICT (id) DO UPDATE SET
    name             = EXCLUDED.name,
    draft_deadline   = EXCLUDED.draft_deadline,
    transfers_open   = EXCLUDED.transfers_open;

  RAISE NOTICE '✓ League EPL_OVERALL_E2E created (id: %)', league_id;

  -- ── 4. Create league_members ────────────────────────────────────
  INSERT INTO league_members (league_id, user_id, role, total_points, rank)
  VALUES
    (league_id, m1, 'commissioner', 0, 1),
    (league_id, m2, 'member',       0, 2),
    (league_id, m3, 'member',       0, 3),
    (league_id, m4, 'member',       0, 4),
    (league_id, m5, 'member',       0, 5),
    (league_id, m6, 'member',       0, 6),
    (league_id, m7, 'member',       0, 7),
    (league_id, m8, 'member',       0, 8)
  ON CONFLICT (league_id, user_id) DO NOTHING;

  RAISE NOTICE '✓ 8 league_members created';

  -- ── 5. Build draft submission lists ────────────────────────────
  -- Managers 1-3: first 20 players from overlap_core (identical) + unique fill
  -- Managers 4-8: first 10 from overlap_core + unique fill
  -- This creates deliberate conflict on the overlap_core players.

  -- Manager 1: overlap[1:20] + unique from all_players[41:51]
  sub1 := overlap_core[1:20] || all_players[41:51];

  -- Manager 2: overlap[1:20] (same!) + unique from all_players[51:61]
  sub2 := overlap_core[1:20] || all_players[51:61];

  -- Manager 3: overlap[1:20] (same!) + unique from all_players[61:71]
  sub3 := overlap_core[1:20] || all_players[61:71];

  -- Manager 4: overlap[1:10] + unique from all_players[71:91]
  sub4 := overlap_core[1:10] || all_players[71:91];

  -- Manager 5: overlap[1:10] + unique from all_players[91:111]
  sub5 := overlap_core[1:10] || all_players[91:111];

  -- Manager 6: overlap[11:20] + unique from all_players[111:131]
  sub6 := overlap_core[11:20] || all_players[111:131];

  -- Manager 7: overlap[11:20] + unique from all_players[131:151]
  sub7 := overlap_core[11:20] || all_players[131:151];

  -- Manager 8: overlap[21:30] + unique from all_players[151:171]
  sub8 := overlap_core[21:30] || all_players[151:171];

  -- Trim to exactly 30
  sub1 := sub1[1:30]; sub2 := sub2[1:30]; sub3 := sub3[1:30]; sub4 := sub4[1:30];
  sub5 := sub5[1:30]; sub6 := sub6[1:30]; sub7 := sub7[1:30]; sub8 := sub8[1:30];

  -- Insert draft_submissions
  INSERT INTO draft_submissions (league_id, user_id, player_ids, submitted_at, status)
  VALUES
    (league_id, m1, sub1, NOW(), 'pending'),
    (league_id, m2, sub2, NOW(), 'pending'),
    (league_id, m3, sub3, NOW(), 'pending'),
    (league_id, m4, sub4, NOW(), 'pending'),
    (league_id, m5, sub5, NOW(), 'pending'),
    (league_id, m6, sub6, NOW(), 'pending'),
    (league_id, m7, sub7, NOW(), 'pending'),
    (league_id, m8, sub8, NOW(), 'pending')
  -- phase defaults to 'group'; current unique is (league_id, user_id, phase) — the
  -- legacy (league_id, user_id) constraint was dropped in migration 116.
  ON CONFLICT (league_id, user_id, phase) DO UPDATE SET
    player_ids   = EXCLUDED.player_ids,
    submitted_at = EXCLUDED.submitted_at,
    status       = 'pending';

  RAISE NOTICE '✓ 8 draft_submissions created with overlapping players';

  -- ── 6. Create 3 test bets ──────────────────────────────────────
  -- Load template IDs
  INSERT INTO bet_instances (
    league_id, template_id, title, prompt, options,
    deadline_at, reward_value, reward_type, scope_type, scope_ref, status
  )
  SELECT
    league_id,
    bt.id,
    vals.title,
    vals.prompt,
    vals.options::jsonb,
    NOW() + INTERVAL '30 days',
    vals.reward_value,
    'points',
    vals.scope_type,
    vals.scope_ref,
    'open'
  FROM (VALUES
    ('top_scorer',   'GW30 Top Scorer',             'Who scores most in GW30?',                    '["Salah","Haaland","Watkins","Palmer"]',      10, 'matchday', '426-r30'),
    ('match_result', 'GW30 Arsenal vs Man City',    'Predict: Arsenal vs Man City this weekend',   '["Arsenal Win","Draw","Man City Win"]',        5, 'match',    'arsenal-mancity-gw30'),
    ('player_block', 'GW30 Player Block Challenge', 'Pick opponent player — <5 pts earns you +4pt','["Haaland","Salah","Son","Saka"]',             4, 'matchday', '426-r30')
  ) AS vals(slug, title, prompt, options, reward_value, scope_type, scope_ref)
  LEFT JOIN bet_templates bt ON bt.slug = vals.slug
  ON CONFLICT DO NOTHING;

  RAISE NOTICE '✓ 3 bets created';

END;
$$;

COMMIT;

-- ─────────────────────────────────────────────────────────────────
-- Verification query — run after to confirm setup
-- ─────────────────────────────────────────────────────────────────
SELECT
  l.name                   AS league,
  l.squad_size,
  l.draft_deadline         AS deadline,
  count(lm.user_id)        AS members
FROM leagues l
LEFT JOIN league_members lm ON lm.league_id = l.id
WHERE l.name = 'EPL_OVERALL_E2E'
GROUP BY l.id, l.name, l.squad_size, l.draft_deadline;

SELECT user_id, array_length(player_ids, 1) AS list_size, status
FROM draft_submissions
WHERE league_id = 'e2e00000-0000-0000-0000-000000000001'
ORDER BY user_id;

SELECT title, status, reward_value
FROM bet_instances
WHERE league_id = 'e2e00000-0000-0000-0000-000000000001';
