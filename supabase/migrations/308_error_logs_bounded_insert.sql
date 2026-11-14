-- DD-P2-1: error_logs stays writable by anyone (crash reports must work before login),
-- but a row can no longer be arbitrarily large or empty. Nothing in the app reads or
-- writes this table during gameplay; only client crash reporting uses it.
DROP POLICY IF EXISTS "error_logs: anyone can insert" ON public.error_logs;

CREATE POLICY "error_logs: bounded insert" ON public.error_logs
  FOR INSERT
  WITH CHECK (
    message IS NOT NULL
    AND char_length(message) BETWEEN 1 AND 2000
    AND (stack IS NULL OR char_length(stack) <= 8000)
    AND (screen IS NULL OR char_length(screen) <= 200)
    AND (component IS NULL OR char_length(component) <= 200)
    AND (user_agent IS NULL OR char_length(user_agent) <= 500)
  );
