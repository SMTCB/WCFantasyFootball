// Shared error logger for all edge functions.
// Writes to edge_function_errors table (migration 48) AND console.error.
// For 'error'/'critical' severity, also forwards to Sentry when SENTRY_DSN is set.
// Never throws — logging must not crash the calling function.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

export type Severity = 'warning' | 'error' | 'critical';

// ── Sentry ingest (OPS-2) ─────────────────────────────────────────────────────
// Uses Sentry's envelope HTTP API directly — no SDK import needed in Deno.
// Only fires for 'error' and 'critical' severity; 'warning' stays DB-only.
// DSN format: https://<key>@<host>/api/<project-id>/envelope/
async function reportToSentry(
  fn: string,
  severity: Severity,
  message: string,
  context: Record<string, unknown>
): Promise<void> {
  const dsn = Deno.env.get('SENTRY_DSN');
  if (!dsn || severity === 'warning') return;

  try {
    // Parse DSN → envelope endpoint
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    const endpoint = `${url.protocol}//${url.host}/api/${projectId}/envelope/`;
    const auth = `Sentry sentry_key=${url.username}, sentry_version=7`;

    const eventId = crypto.randomUUID().replace(/-/g, '');
    const timestamp = new Date().toISOString();

    const envelope = [
      // Envelope header
      JSON.stringify({ event_id: eventId, sent_at: timestamp }),
      // Item header
      JSON.stringify({ type: 'event' }),
      // Event payload
      JSON.stringify({
        event_id: eventId,
        timestamp,
        platform: 'other',
        level: severity === 'critical' ? 'fatal' : 'error',
        logger: 'edge-function',
        message,
        tags: { function: fn, severity },
        extra: context,
        environment: Deno.env.get('SUPABASE_URL')?.includes('localhost') ? 'local' : 'production',
      }),
    ].join('\n');

    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': auth },
      body: envelope,
    });
  } catch { /* Sentry reporter must never throw */ }
}

export async function logError(
  fn: string,
  severity: Severity,
  message: string,
  context: Record<string, unknown> = {}
): Promise<void> {
  // DB + console (always)
  try {
    await sb.from('edge_function_errors').insert({ function: fn, severity, message, context });
  } catch { /* never throw from the logger */ }
  console.error(`[${fn}] ${severity}: ${message}`, context);

  // Sentry (error/critical only, fire-and-forget)
  reportToSentry(fn, severity, message, context);
}
