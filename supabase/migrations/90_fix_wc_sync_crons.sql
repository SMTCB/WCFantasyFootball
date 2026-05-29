-- Migration 90: Fix WC sync crons that used current_setting() for URL/key (PILOT-01)
-- current_setting('app.supabase_url') and current_setting('app.service_role_key') return NULL
-- on hosted Supabase because ALTER DATABASE SET is not available. Replace with hardcoded values,
-- same pattern applied in migration 86 for other crons.

SELECT cron.unschedule('sync-wc-players-6h');
SELECT cron.unschedule('sync-wc-fixtures-6h');

SELECT cron.schedule(
  'sync-wc-players-6h',
  '2 */6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-players',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
      ),
      body    := jsonb_build_object('forza_id', '429')
    );
  $$
);

SELECT cron.schedule(
  'sync-wc-fixtures-6h',
  '4 */6 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1/sync-fixtures',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzc212aWh4dHF0b2hpc2doamV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NjQ4OTIyNywiZXhwIjoyMDkyMDY1MjI3fQ.rJZLTLnrgTjwMv3vHgUIyY48GrJ7dp5vhjWlkpWyWzg'
      ),
      body    := jsonb_build_object('forza_id', '429')
    );
  $$
);
