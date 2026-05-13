-- Migration 34: Add auto-close bets cron job
-- Auto-transitions bet_instances from 'open' → 'closed' at deadline
-- Runs every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)

SELECT cron.schedule(
  'auto-close-bets',
  '0 */6 * * *',
  $$
  UPDATE bet_instances
  SET status = 'closed'
  WHERE status = 'open'
    AND deadline_at < NOW();
  $$
);
