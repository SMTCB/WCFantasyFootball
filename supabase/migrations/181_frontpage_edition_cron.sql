-- Migration 181: Daily cron for frontpage edition generation
--
-- Fires at 05:00 UTC every day.
-- Calls generate-frontpage-edition with mode='cron'.
-- The Edge Function loops all active leagues (>1 member) and skips leagues
-- that already have a fresh manual edition (is_manual=true AND < 12h old).

SELECT cron.schedule(
  'generate-frontpage-editions',
  '0 5 * * *',
  $$
  SELECT net.http_post(
    url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/generate-frontpage-edition',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
    ),
    body    := '{"mode":"cron"}'::jsonb
  );
  $$
);
