-- 233_clubhouse_backfill_pilot_leagues.sql
-- Cutover backfill: the 7 real pilot leagues (created pre-Clubhouse-layer,
-- migration 188) have no circle. Group them into one Clubhouse so pilot
-- users land somewhere coherent post-cutover instead of an empty state.
-- See docs/platform_revision/CUTOVER_PLAN.md §3 (clubhouse mapping decision).

DO $$
DECLARE
  v_circle_id uuid;
  v_owner uuid := '9b521778-d7cd-4213-a131-2fea4a11f028'; -- creator of 6 of the 7 leagues
  v_league_ids uuid[] := ARRAY[
    '23bc151c-b756-41d4-96da-c2a542bfead8', -- Mundial do Eder
    '23fa0f27-26b6-4d73-a9f8-d691698d6c0f', -- Mundial Gordo Vai a Baliza
    'a4c59f59-40ce-424b-a4ae-d4b7b5c256ab', -- Draft Mundial 26
    'f5f75bd9-3d87-42d4-a4d0-fbafddc9e610', -- RANKS FC World Cup Fantasy
    'da4ef2e2-f099-4120-abe0-2087369a4163', -- Munaial '26
    'dc54f38f-6cdd-45c4-8a26-84c7fb42316c', -- Miami WC Fantasy Testers
    '70b874f0-ad78-4072-a535-3adbaa8545c7'  -- FIXO DRAFT MUNDIAL 26
  ];
BEGIN
  INSERT INTO circles (name, created_by)
  VALUES ('World Cup Pilot', v_owner)
  RETURNING id INTO v_circle_id;

  UPDATE leagues
  SET circle_id = v_circle_id
  WHERE id = ANY(v_league_ids);

  INSERT INTO circle_leagues (circle_id, league_id)
  SELECT v_circle_id, unnest(v_league_ids)
  ON CONFLICT DO NOTHING;

  INSERT INTO circle_members (circle_id, user_id, role)
  SELECT v_circle_id, lm.user_id, CASE WHEN lm.user_id = v_owner THEN 'owner' ELSE 'member' END
  FROM league_members lm
  WHERE lm.league_id = ANY(v_league_ids)
  GROUP BY lm.user_id
  ON CONFLICT (circle_id, user_id) DO NOTHING;
END $$;
