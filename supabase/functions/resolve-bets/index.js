// Edge Function: resolve-bets
// Auto-resolves closed bet_instances by looking up actual match outcomes.
// Runs on cron every 15 minutes (migration 72).
//
// Handles bet type: match_result
//   scope_ref = fixture.id; correct answer derived from fixtures.home_score/away_score.
//   Only resolves if fixture.status = 'finished'.
//
// Deferred types: top_scorer, player_block — require additional query logic; commissioner must resolve manually.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';

const FN      = 'resolve-bets';
const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond(405, { error: 'POST required' });

  try {
    // Find closed bets where resolves_at has passed (or is null — those get checked anyway)
    const { data: instances, error: fetchErr } = await supabase
      .from('bet_instances')
      .select('id, scope_type, scope_ref, options, template_id, bet_templates(slug)')
      .eq('status', 'closed')
      .or('resolves_at.is.null,resolves_at.lt.now()');

    if (fetchErr) {
      await logError(FN, 'error', 'Failed to fetch closed bets', { error: fetchErr.message });
      return respond(500, { error: fetchErr.message });
    }

    let resolved = 0;
    let skipped  = 0;
    const errors = [];

    for (const inst of instances ?? []) {
      const slug = inst.bet_templates?.slug ?? null;

      if (slug === 'match_result') {
        if (!inst.scope_ref) { skipped++; continue; }

        const { data: fx } = await supabase
          .from('fixtures')
          .select('status, home_score, away_score, home_team, away_team')
          .eq('id', inst.scope_ref)
          .maybeSingle();

        if (!fx || fx.status !== 'finished') { skipped++; continue; }

        // DD-C11: skip fixtures with NULL scores (postponed/abandoned/API-gap)
        if (fx.home_score === null || fx.away_score === null) { skipped++; continue; }

        // Derive correct answer key — format must match what BetCreatorPanel wrote to options
        const homeKey = `${inst.scope_ref}_home`;
        const drawKey = `${inst.scope_ref}_draw`;
        const awayKey = `${inst.scope_ref}_away`;

        let correctAnswer;
        if (fx.home_score > fx.away_score)       correctAnswer = homeKey;
        else if (fx.home_score < fx.away_score)  correctAnswer = awayKey;
        else                                     correctAnswer = drawKey;

        const { data: result, error: rpcErr } = await supabase
          .rpc('resolve_bet', { p_instance_id: inst.id, p_answers: [correctAnswer] });

        if (rpcErr || result?.ok === false) {
          const msg = rpcErr?.message ?? result?.error ?? 'unknown';
          errors.push(`${inst.id}: ${msg}`);
          await logError(FN, 'warning', `resolve_bet failed for instance ${inst.id}`, { error: msg });
        } else {
          resolved++;
        }

      } else {
        // top_scorer and player_block require commissioner resolution for now
        skipped++;
      }
    }

    return respond(200, {
      ok:       true,
      resolved,
      skipped,
      errors:   errors.length ? errors : undefined,
    });

  } catch (err) {
    await logError(FN, 'error', err.message, { stack: err.stack });
    return respond(500, { error: err.message });
  }
});
