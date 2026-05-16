-- Migration 48: Edge function error log table
--
-- Captures critical Edge Function failures for production observability.
-- Supabase's built-in function logs capture console.* output, but they
-- rotate quickly and aren't queryable. This table provides a persistent,
-- queryable record of critical failures.
--
-- Query recent failures:
--   SELECT * FROM edge_function_errors ORDER BY created_at DESC LIMIT 50;
--
-- Alert query — failures in the last hour:
--   SELECT function, COUNT(*) FROM edge_function_errors
--   WHERE created_at > NOW() - INTERVAL '1 hour'
--   GROUP BY function ORDER BY count DESC;

CREATE TABLE IF NOT EXISTS edge_function_errors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  function    TEXT        NOT NULL,
  severity    TEXT        NOT NULL DEFAULT 'error'
              CHECK (severity IN ('warning', 'error', 'critical')),
  message     TEXT        NOT NULL,
  context     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for the common query pattern (newest failures first, per function)
CREATE INDEX IF NOT EXISTS idx_efe_function_time
  ON edge_function_errors (function, created_at DESC);

-- No client access — service role only. RLS is enabled so the anon key
-- can never read or write this table from the browser.
ALTER TABLE edge_function_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "no client access to error log"
  ON edge_function_errors
  USING (false);
