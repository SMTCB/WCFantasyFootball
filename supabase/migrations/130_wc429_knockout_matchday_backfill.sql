-- Migration 130: Backfill WC 429 knockout matchday_ids
--
-- Root cause: PR #326 changed sync-fixtures to write matchday_id from the Forza round
-- number. Forza returns round=null for all knockout matches, so the 30-min
-- sync-wc-fixtures-30m cron wiped every knockout fixture's matchday_id to null after
-- migration 126 set them. Migration 129's preserve_manual_matchday_id trigger now
-- prevents future wipes; this migration restores the already-nulled values.
--
-- Mapping (matches migration 126):
--   r4 = Round of 32   (Jun 28 – Jul 4, group-code placeholders like 1A/2B/3C)
--   r5 = Round of 16   (Jul 4–7, winner placeholders W73–W88)
--   r6 = Quarter-finals (Jul 9–12, W89–W96)
--   r7 = Semi-finals    (Jul 14–15, W97–W100)
--   r8 = Final + 3rd    (Jul 18–19, W101/W102/RU101/RU102)

UPDATE fixtures
SET matchday_id = '429-r4', round_number = 4
WHERE tournament_id = '429'
  AND matchday_id IS NULL
  AND status != 'finished'
  AND (
    kickoff_at::date < '2026-07-04'
    OR (kickoff_at::date = '2026-07-04' AND home_team NOT LIKE 'W%' AND home_team NOT LIKE 'RU%')
  );

UPDATE fixtures
SET matchday_id = '429-r5', round_number = 5
WHERE tournament_id = '429'
  AND matchday_id IS NULL
  AND status != 'finished'
  AND (
    (kickoff_at::date = '2026-07-04' AND home_team LIKE 'W%')
    OR kickoff_at::date BETWEEN '2026-07-05' AND '2026-07-07'
  );

UPDATE fixtures
SET matchday_id = '429-r6', round_number = 6
WHERE tournament_id = '429'
  AND matchday_id IS NULL
  AND status != 'finished'
  AND kickoff_at::date BETWEEN '2026-07-09' AND '2026-07-12';

UPDATE fixtures
SET matchday_id = '429-r7', round_number = 7
WHERE tournament_id = '429'
  AND matchday_id IS NULL
  AND status != 'finished'
  AND kickoff_at::date BETWEEN '2026-07-14' AND '2026-07-15';

UPDATE fixtures
SET matchday_id = '429-r8', round_number = 8
WHERE tournament_id = '429'
  AND matchday_id IS NULL
  AND status != 'finished'
  AND kickoff_at::date >= '2026-07-18';

-- Verify: all knockout fixtures should now have a matchday_id
SELECT matchday_id, round_number, COUNT(*) as fixtures
FROM fixtures
WHERE tournament_id = '429' AND status != 'finished'
GROUP BY matchday_id, round_number
ORDER BY matchday_id;
