-- Migration 300: split Frontrow cron into a league sweep + batched circle sweeps.
--
-- The single daily sweep generated league editions first, then circle editions,
-- sequentially with a 15s delay each. It ran past the Edge Function timeout, so
-- circle (Clubhouse) editions were starved. generate-frontpage-edition now accepts
-- {"scope":"leagues"|"circles","limit":N} (PR #1040).
--
--   * existing jobs 89 / 100  -> league editions only ("scope":"leagues")
--   * new circle jobs         -> every 5 min for 40 min after, 3 circles per run;
--                                circles that already have today's edition are skipped
--
-- The bearer token is read from the existing cron command at apply time so it
-- never lands in the repo. Requires the function from PR #1040 to be deployed first.
-- Backup: backups/pre_migration_300_*.sql (schema dump).

DO $$
DECLARE
  main_cmd    text;
  preview_cmd text;
BEGIN
  SELECT command INTO main_cmd    FROM cron.job WHERE jobname = 'generate-frontpage-editions';
  SELECT command INTO preview_cmd FROM cron.job WHERE jobname = 'generate-frontpage-editions-preview';

  IF main_cmd IS NULL OR preview_cmd IS NULL
     OR position('"mode":"cron"' IN main_cmd) = 0
     OR position('"mode":"cron"' IN preview_cmd) = 0 THEN
    RAISE EXCEPTION 'Expected frontpage cron jobs missing or in unexpected shape';
  END IF;

  PERFORM cron.alter_job(
    (SELECT jobid FROM cron.job WHERE jobname = 'generate-frontpage-editions'),
    command := replace(main_cmd, '"mode":"cron"', '"mode":"cron","scope":"leagues"'));
  PERFORM cron.alter_job(
    (SELECT jobid FROM cron.job WHERE jobname = 'generate-frontpage-editions-preview'),
    command := replace(preview_cmd, '"mode":"cron"', '"mode":"cron","scope":"leagues"'));

  PERFORM cron.schedule('generate-frontpage-circles', '5-45/5 5 * * *',
    replace(main_cmd, '"mode":"cron"', '"mode":"cron","scope":"circles","limit":3'));
  PERFORM cron.schedule('generate-frontpage-circles-preview', '5-45/5 8 * * *',
    replace(preview_cmd, '"mode":"cron"', '"mode":"cron","scope":"circles","limit":3'));
END $$;
