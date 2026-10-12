import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/auth.ts';
import { logError } from '../_shared/log.ts';

// ─────────────────────────────────────────────────────────────────────────────
// check-cron-health — OPS-2 part (c): failed-cron alerting
//
// Calls get_cron_failure_streaks() (migration 223) to find active cron jobs
// whose most recent runs have failed p_threshold times in a row (default 3),
// and reports each one via logError() — same path OPS-2 parts (a)/(b) already
// use for Edge Function errors: writes to edge_function_errors (visible in
// the admin ObservabilityPanel) and forwards to Sentry when SENTRY_DSN is set.
//
// Not wired to a schedule yet — this function is code-only until a cron entry
// is added and approved separately (see TRACKER.md OPS-2). Safe to invoke
// manually any time; it only reads cron.job_run_details and writes to
// edge_function_errors, neither of which the live pilot depends on.
//
// Dedup: an alert is skipped if edge_function_errors already has a
// 'check-cron-health' entry for the same job within the cooldown window, so
// re-running this on a schedule doesn't spam Sentry/the log on every tick
// while a job stays broken — only on first detection and after the cooldown.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// PostgREST errors are plain objects, so String(err) logged an unreadable "[object Object]".
const describeError = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);

const DEFAULT_THRESHOLD = 3;
const COOLDOWN_HOURS = 6;

interface FailureStreak {
  jobname: string;
  consecutive_failures: number;
  last_run: string | null;
  last_message: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authErr = await requireServiceRole(req);
  if (authErr) return authErr;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let threshold = DEFAULT_THRESHOLD;
    try {
      const body = await req.json();
      if (typeof body?.threshold === 'number' && body.threshold > 0) threshold = body.threshold;
    } catch { /* empty/no body is fine — use default threshold */ }

    // A failure here must not skip the unpriced-player check below, so it is reported
    // (with a readable message) and the run continues.
    let rows: FailureStreak[] = [];
    let streakError: string | null = null;
    const { data: streaks, error: rpcErr } = await supabase.rpc('get_cron_failure_streaks', {
      p_threshold: threshold,
    });
    if (rpcErr) {
      streakError = describeError(rpcErr);
      await logError('check-cron-health', 'error', `get_cron_failure_streaks failed: ${streakError}`, {
        check: 'cron_failure_streaks',
      });
    } else {
      rows = (streaks ?? []) as FailureStreak[];
    }
    const alerted: string[] = [];
    const skipped: string[] = [];

    const cooldownCutoff = new Date(Date.now() - COOLDOWN_HOURS * 3600_000).toISOString();

    for (const row of rows) {
      const { data: recent } = await supabase
        .from('edge_function_errors')
        .select('id')
        .eq('function', 'check-cron-health')
        .eq('context->>jobname', row.jobname)
        .gte('created_at', cooldownCutoff)
        .limit(1);

      if (recent && recent.length > 0) {
        skipped.push(row.jobname);
        continue;
      }

      await logError(
        'check-cron-health',
        'critical',
        `Cron job "${row.jobname}" has failed ${row.consecutive_failures} times in a row`,
        {
          jobname: row.jobname,
          consecutive_failures: row.consecutive_failures,
          last_run: row.last_run,
          last_message: row.last_message,
        },
      );
      alerted.push(row.jobname);
    }

    // ── Unpriced active players (active tournaments only) ───────────────────────
    // New arrivals synced from Forza land with price NULL and must be priced by a
    // human before they are buyable (process-transfer refuses them, the Market hides
    // them). This surfaces them so they are priced in the designated windows instead
    // of silently sitting in the pool. Same cooldown dedup as the cron alerts above.
    let unpriced: { count: number; sample: string[] } | null = null;
    const { data: activeTournaments } = await supabase
      .from('tournaments').select('forza_id').eq('status', 'active');
    const activeIds = (activeTournaments ?? []).map((t: { forza_id: string }) => t.forza_id);
    if (activeIds.length) {
      const { data: unpricedRows, count } = await supabase
        .from('players')
        .select('name, club, position, tournament_id', { count: 'exact' })
        .in('tournament_id', activeIds)
        .eq('is_active', true)
        .is('price', null)
        .limit(15);
      if ((count ?? 0) > 0) {
        const { data: recentUnpriced } = await supabase
          .from('edge_function_errors')
          .select('id')
          .eq('function', 'check-cron-health')
          .eq('context->>check', 'unpriced_active_players')
          .gte('created_at', cooldownCutoff)
          .limit(1);
        unpriced = {
          count: count ?? 0,
          sample: (unpricedRows ?? []).map(
            (p: { name: string; club: string; position: string }) => `${p.name} (${p.club}, ${p.position})`,
          ),
        };
        if (!recentUnpriced || recentUnpriced.length === 0) {
          await logError(
            'check-cron-health',
            'warning',
            `${count} active player(s) in active tournaments have no price — price them before they reach managers`,
            { check: 'unpriced_active_players', count, sample: unpriced.sample },
          );
        }
      }
    }

    console.log(`[check-cron-health] threshold=${threshold} alerted=${alerted.length} skipped(cooldown)=${skipped.length} unpriced=${unpriced?.count ?? 0}`);

    return new Response(
      JSON.stringify({ ok: streakError === null, threshold, alerted, skipped, unpriced, streakError }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    await logError('check-cron-health', 'error', describeError(err));
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', detail: describeError(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
