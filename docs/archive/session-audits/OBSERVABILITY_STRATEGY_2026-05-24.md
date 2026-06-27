# Observability Strategy — Forza Fantasy League
**Date:** 2026-05-24
**Scope:** Lightweight error visibility appropriate for a fantasy football app — not a flight system.

## Goal

Know **what fails**, **roughly when**, and **enough context to debug** — without standing up Sentry, Datadog, or any external SaaS. This needs to be readable by Claude Code during a session ("what broke since yesterday?") and by the user during a test-launch incident.

## Current state assessment

| Surface | Status |
|---|---|
| **`edge_function_errors` table** (migration 48) | ✅ Exists. Service-role only. Indexed on `(function, created_at DESC)`. Good. |
| **`logError` helper** | 🟡 Defined in only **2** of 13 edge functions: `calculate-scores` and `ingest-match-events`. Other 11 functions just `console.error` and lose the data to log rotation. |
| **Edge function `console.error`** | 🟡 Captured by Supabase's built-in function logs — but rotates fast, isn't queryable, isn't aggregable. Fine for live debugging, useless for "what failed yesterday". |
| **Frontend errors** | 🔴 None captured. `ErrorBoundary` catches React render errors only. Async `supabase.from(...).catch(...)` failures, unhandled promise rejections, and most runtime errors go nowhere. |
| **Cron job failures** | 🔴 Postgres `cron.job_run_details` exists but no one reads it. A broken cron silently no-ops until a user reports missing data. |
| **Alerting** | 🔴 None. |
| **Dashboards** | 🔴 None. |

**Net:** the foundation is partially built (one table, two callers). Maybe 15% of the way to "we'd notice an outage".

## Design principles for this app

Given this is a fantasy football app and not safety-critical:

1. **Single table, single shape** — everything funnels into one place. No multiple "logs" tables, no per-service flavors.
2. **Pull, not push** — no email/SMS/Slack. The user (and Claude) query the table when something feels wrong.
3. **5-minute install per function** — adding logging to a new edge function should be 3 lines, copy-paste.
4. **Self-pruning** — old rows auto-deleted by cron to keep the table small.
5. **Browser errors land in the same table** via an unauthenticated RPC. One query gives full visibility.

## The strategy — 5 components

### O1. Unify the error logger into `_shared/log.ts`

Currently `calculate-scores/index.js:34-40` and `ingest-match-events/index.js:35-41` each define their own `logError`. Extract to `supabase/functions/_shared/log.ts`:

```ts
// supabase/functions/_shared/log.ts
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
    await sb.from('edge_function_errors').insert({
      function: fn,
      severity,
      message,
      context,
    });
  } catch {
    // Never throw from the logger — would mask the real error
  }
  // Also print to console so Supabase function logs still work
  console.error(`[${fn}] ${severity}: ${message}`, context);
}
```

Then every function imports it:
```js
import { logError } from '../_shared/log.ts';
// ...
await logError('process-transfer', 'critical', 'budget arithmetic failed', { user_id, price });
```

### O2. Apply `logError` to every critical path in every edge function

These functions should log at the listed severities. Today most don't log to the table at all.

| Function | Where to log | Severity |
|---|---|---|
| `process-transfer` | Budget exceeded; player not found; deadline check; membership check failure | `error` |
| `run-draft-lottery` | Upsert errors; partial allocation failures; league/submission load errors | `critical` |
| `run-reverse-standings-draft` | Same as lottery | `critical` |
| `sync-fixtures` | Forza API failure; upsert error; deadline upsert failure | `error` / `warning` |
| `sync-players` | Forza API failure; upsert error (currently silent — see I1) | `error` |
| `sync-player-status` | Per-team failure; reset failure | `error` |
| `ingest-match-events` | Already wired ✓ — extend to log on Forza failures | (extend) |
| `calculate-scores` | Already wired ✓ — extend to log on missing scoring_rules fallback | (extend) |
| `calculate-relaxation` | RPC failure; tier transition (info) | `warning` |
| `eliminate-cup-club` | Club not found; relaxation invoke failure | `error` |
| `auto-open-transfer-window` | Window insert race; deadline lookup failure | `error` |
| `discover-tournament` | Forza API failure; timeout | `warning` |
| `test-forza-api` | Token missing or invalid | `warning` |

Estimated effort: **20 minutes per function** to add 2-4 logging calls. Total **~3-4 hours**.

### O3. Capture frontend errors

Add a single `public.client_errors` table + a permissive RPC that anon can call:

```sql
-- new migration
CREATE TABLE IF NOT EXISTS client_errors (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID,                                  -- nullable; signed-out users have no id
  url         TEXT,
  message     TEXT NOT NULL,
  stack       TEXT,
  user_agent  TEXT,
  context     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;
-- No client SELECT. Only service role.
CREATE POLICY "no client reads" ON client_errors USING (false);

CREATE INDEX idx_ce_time ON client_errors (created_at DESC);
CREATE INDEX idx_ce_url  ON client_errors (url, created_at DESC);

-- Anon-callable insert via SECURITY DEFINER (so RLS doesn't block)
CREATE OR REPLACE FUNCTION report_client_error(
  p_message    TEXT,
  p_stack      TEXT  DEFAULT NULL,
  p_url        TEXT  DEFAULT NULL,
  p_user_agent TEXT  DEFAULT NULL,
  p_context    JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Cap message + stack length to avoid abuse
  INSERT INTO client_errors (user_id, message, stack, url, user_agent, context)
  VALUES (
    auth.uid(),
    LEFT(p_message, 2000),
    LEFT(p_stack, 8000),
    LEFT(p_url, 500),
    LEFT(p_user_agent, 500),
    p_context
  );
END;
$$;
GRANT EXECUTE ON FUNCTION report_client_error TO anon, authenticated;
```

Then in `src/main.jsx`:
```js
import { supabase } from './lib/supabase';

function report(message, stack, context = {}) {
  // fire-and-forget; never block the UI on logging
  supabase.rpc('report_client_error', {
    p_message:    String(message ?? 'unknown'),
    p_stack:      stack ?? null,
    p_url:        window.location.href,
    p_user_agent: navigator.userAgent,
    p_context:    context,
  }).catch(() => {});
}

window.addEventListener('error', (e) => {
  report(e.message, e.error?.stack, { type: 'window.error', filename: e.filename, lineno: e.lineno });
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const msg = typeof reason === 'string' ? reason : reason?.message ?? 'unhandled rejection';
  report(msg, reason?.stack, { type: 'unhandledrejection' });
});
```

And update `ErrorBoundary.componentDidCatch`:
```js
componentDidCatch(error, errorInfo) {
  report(error.message, error.stack, { type: 'react', screen: this.props.screen, info: errorInfo.componentStack });
}
```

### O4. Auto-prune old rows

To keep both tables small (especially `client_errors` which could grow during a viral moment):

```sql
-- New migration
SELECT cron.schedule(
  'prune-error-logs',
  '0 4 * * *',  -- 4 AM UTC daily
  $$
    DELETE FROM edge_function_errors WHERE created_at < NOW() - INTERVAL '30 days';
    DELETE FROM client_errors        WHERE created_at < NOW() - INTERVAL '14 days';
  $$
);
```

30 days for edge errors (rare; high signal). 14 days for client errors (noisier; high volume).

### O5. Lightweight admin view

Add a simple read-only screen for the user and Claude during incidents. Reuse the existing `AdminSeedScreen` shell or add a new sub-route. Three small panels:

**Panel A — Recent edge function failures (last 24h)**
```sql
SELECT function, severity, message, context, created_at
FROM edge_function_errors
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 100;
```

**Panel B — Recent client errors (last 24h)**
```sql
SELECT url, message, user_id, created_at
FROM client_errors
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC
LIMIT 100;
```

**Panel C — Cron job health (last 24h)**
```sql
SELECT jobid, jobname, status, return_message, start_time, end_time
FROM cron.job_run_details
WHERE start_time > NOW() - INTERVAL '24 hours'
ORDER BY start_time DESC
LIMIT 100;
```

(Last query requires `GRANT SELECT ON cron.job_run_details TO service_role` if not already granted.)

Render these as plain tables, no charts, no filters beyond the time window. The user (or Claude) can copy the message and paste it into a session to debug.

Access gated by `auth.uid() === <YOUR_USER_ID>` or a `users.is_admin` boolean — your choice.

### Optional — O6. Daily digest gazette entry

If you want a passive nudge instead of polling the admin view:

```sql
-- A cron at 09:00 UTC that summarizes the last 24h into a hidden "ops" gazette entry
-- (or a dedicated table `ops_digest` to avoid leaking failure noise to users)
```

This is **optional and can be deferred** — the admin view is enough for the test phase. Skip unless you find yourself manually checking the table multiple times a day.

## What this is NOT

- ❌ Not a metrics system (no Prometheus, no time-series)
- ❌ Not user analytics (no Mixpanel, no funnel)
- ❌ Not performance monitoring (no Core Web Vitals capture)
- ❌ Not alerting (no email/SMS/Slack)
- ❌ Not distributed tracing

Adding any of these is **out of scope** for a basic fantasy football app at test-launch stage. If user reports start mentioning "the app is slow", revisit performance monitoring. If incidents are caught late, revisit alerting. Otherwise, leave it.

## Implementation plan

Allocate to **Sprint 1** (release blockers turn into bug reports without this) as 5 items, ~6 hours total:

- **O1** — Extract `_shared/log.ts` (~30 min)
- **O2** — Apply `logError` across remaining 11 edge functions (~3 h)
- **O3** — `client_errors` table + RPC + frontend listeners (~1 h)
- **O4** — Pruning cron (~15 min)
- **O5** — Admin read-only error view (~1.5 h)
- (Optional **O6** — daily digest — defer)

After Sprint 1, you can answer:
- "What failed in the last hour?" — Panel A
- "What did the user see when they hit that bug?" — Panel B
- "Did any cron actually run yesterday?" — Panel C

That is sufficient for a fantasy football app at test-launch stage.

## How to use this during a session

When the user reports something broken:

1. Open admin view → Panel A → filter by function name or scan messages.
2. Cross-reference Panel B for the same timestamp window — is it a backend or frontend issue?
3. If neither shows anything → check Panel C (a cron that didn't run silently breaks downstream features).
4. Copy the `context` JSONB from the row into a Claude session: "this failed with this context, why?"

Done. No dashboards to build, no SaaS to configure.
