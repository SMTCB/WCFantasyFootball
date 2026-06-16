-- Migration 178: free_transfers config key for classic leagues
-- Backfills free_transfers=false for every league that doesn't already have the key.
-- Commissioner can flip to true via Admin tab → Transfer Window toggle.
-- process-transfer reads this key to bypass the per-round limit (limitMatchdayId=null).

INSERT INTO league_config (league_id, config_key, config_value)
SELECT l.id, 'free_transfers', 'false'::jsonb
FROM leagues l
ON CONFLICT (league_id, config_key) DO NOTHING;
