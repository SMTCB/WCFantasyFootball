-- Migration 71: Observability — client_errors table + report_client_error RPC + pruning cron
-- O3: Frontend errors funnel into the same edge_function_errors table visibility pattern.
-- O4: Auto-prune old rows to keep tables small.

-- ── client_errors table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_errors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,                       -- nullable; signed-out users have no id
  url         TEXT,
  message     TEXT NOT NULL,
  stack       TEXT,
  user_agent  TEXT,
  context     JSONB       DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

-- No client SELECT — only service role can read
CREATE POLICY "no client reads" ON client_errors USING (false);

CREATE INDEX IF NOT EXISTS idx_ce_time ON client_errors (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ce_url  ON client_errors (url, created_at DESC);

-- ── SECURITY DEFINER RPC so anon/authenticated can INSERT ───────────────────
-- Caps message + stack length to prevent abuse.

CREATE OR REPLACE FUNCTION report_client_error(
  p_message    TEXT,
  p_stack      TEXT  DEFAULT NULL,
  p_url        TEXT  DEFAULT NULL,
  p_user_agent TEXT  DEFAULT NULL,
  p_context    JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO client_errors (user_id, message, stack, url, user_agent, context)
  VALUES (
    auth.uid(),
    LEFT(p_message, 2000),
    LEFT(p_stack,   8000),
    LEFT(p_url,      500),
    LEFT(p_user_agent, 500),
    p_context
  );
END;
$$;

GRANT EXECUTE ON FUNCTION report_client_error TO anon, authenticated;

-- ── Auto-prune cron ──────────────────────────────────────────────────────────
-- 30 days for edge errors (rare; high signal).
-- 14 days for client errors (noisier; higher volume).

SELECT cron.schedule(
  'prune-error-logs',
  '0 4 * * *',  -- 4 AM UTC daily
  $$
    DELETE FROM edge_function_errors WHERE created_at < NOW() - INTERVAL '30 days';
    DELETE FROM client_errors        WHERE created_at < NOW() - INTERVAL '14 days';
  $$
);
