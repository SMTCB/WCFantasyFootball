-- Migration 59: Restore WC tournament entry
-- Re-add FIFA World Cup 2026 tournament with all required fields

INSERT INTO tournaments (
  id, forza_id, name, slug, environment, sync_enabled, status,
  starts_at, ends_at, available_for_league_creation, created_at
)
VALUES (
  '30b6ad7a-7503-409e-b10f-0c74eeb46968',
  '429',
  'FIFA World Cup 2026',
  'wc-2026',
  'dry_run',
  true,
  'active',
  '2025-11-21 00:00:00+00'::timestamptz,
  '2026-12-18 23:59:59+00'::timestamptz,
  true,
  now()
)
ON CONFLICT (id) DO NOTHING;
