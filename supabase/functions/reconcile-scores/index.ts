import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/auth.ts';
import { logError } from '../_shared/log.ts';

// ─────────────────────────────────────────────────────────────────────────────
// reconcile-scores — closes the "ingestion reconciliation gap"
//
// Once a round freezes (rollupSquads() writes points_breakdown->effective_xi
// once per squad+matchday, calculate-scores/index.js), fantasy_points.total
// is never recomputed again — not on a race-condition undercount (CODE-RACE-1,
// migration 291), and not when player_match_stats is corrected after the fact
// (e.g. the Suárez/Tresoldi/Guirassy goal/penalty fix, PR #1009). Both bugs
// were only caught because a user reported a score looked wrong.
//
// This function calls get_score_discrepancies() (migration 292), which
// recomputes `total` from the frozen effective_xi/captain/joker/penalty
// metadata against CURRENT player_match_stats and returns any squad+matchday
// where that disagrees with the stored total. Detection only — it never
// writes to fantasy_points or league_members. Each discrepancy is reported
// via logError() (same path as check-cron-health): writes to
// edge_function_errors (visible in the admin ObservabilityPanel) and
// forwards to Sentry. A human still reviews and applies the correction
// manually, per the Pilot Safeguards SELECT-before-UPDATE rule — see
// BACKLOG.md for the 2026-09-11 UCL correction as the worked example.
//
// Not wired to a schedule yet — code-only until a cron entry is added and
// approved separately, same as check-cron-health. Safe to invoke manually
// any time; it only reads and writes to edge_function_errors.
//
// Dedup: an alert is skipped if edge_function_errors already has a
// 'reconcile-scores' entry for the same squad+matchday within the cooldown
// window, so a schedule wouldn't spam Sentry every run while a discrepancy
// sits unreviewed — only on first detection and after the cooldown.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COOLDOWN_HOURS = 6;

interface ScoreDiscrepancy {
  squad_id: string;
  league_id: string;
  matchday_id: string;
  stored_total: number;
  recomputed_total: number;
  diff: number;
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

    let matchdayId: string | null = null;
    try {
      const body = await req.json();
      if (typeof body?.matchday_id === 'string') matchdayId = body.matchday_id;
    } catch { /* empty/no body is fine — check every frozen round */ }

    const { data: discrepancies, error: rpcErr } = await supabase.rpc('get_score_discrepancies', {
      p_matchday_id: matchdayId,
    });
    if (rpcErr) throw rpcErr;

    const rows = (discrepancies ?? []) as ScoreDiscrepancy[];
    const alerted: string[] = [];
    const skipped: string[] = [];

    const cooldownCutoff = new Date(Date.now() - COOLDOWN_HOURS * 3600_000).toISOString();

    for (const row of rows) {
      const key = `${row.squad_id}:${row.matchday_id}`;

      const { data: recent } = await supabase
        .from('edge_function_errors')
        .select('id')
        .eq('function', 'reconcile-scores')
        .eq('context->>squad_id', row.squad_id)
        .eq('context->>matchday_id', row.matchday_id)
        .gte('created_at', cooldownCutoff)
        .limit(1);

      if (recent && recent.length > 0) {
        skipped.push(key);
        continue;
      }

      await logError(
        'reconcile-scores',
        'critical',
        `Squad ${row.squad_id} has a frozen total (${row.stored_total}) that disagrees with player_match_stats (recomputes to ${row.recomputed_total}) for matchday ${row.matchday_id}`,
        {
          squad_id: row.squad_id,
          league_id: row.league_id,
          matchday_id: row.matchday_id,
          stored_total: row.stored_total,
          recomputed_total: row.recomputed_total,
          diff: row.diff,
        },
      );
      alerted.push(key);
    }

    console.log(`[reconcile-scores] matchday=${matchdayId ?? 'all'} alerted=${alerted.length} skipped(cooldown)=${skipped.length}`);

    return new Response(
      JSON.stringify({ ok: true, matchday_id: matchdayId, alerted, skipped }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    await logError('reconcile-scores', 'error', String(err));
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
