// Shared error logger for all edge functions.
// Writes to edge_function_errors table (migration 48) AND console.error.
// Never throws — logging must not crash the calling function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export type Severity = 'warning' | 'error' | 'critical';

export async function logError(
  fn: string,
  severity: Severity,
  message: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  try {
    await sb.from('edge_function_errors').insert({ function: fn, severity, message, context });
  } catch { /* never throw from the logger */ }
  console.error(`[${fn}] ${severity}: ${message}`, context);
}
