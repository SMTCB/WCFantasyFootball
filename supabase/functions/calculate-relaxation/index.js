// Edge Function: calculate-relaxation
// Called by eliminate-cup-club after each club elimination.
// Runs the relaxation formula, persists the result, and writes a
// gazette entry ONLY when the tier changes (to avoid gazette noise).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';

const FN      = 'calculate-relaxation';
const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
);

// L6.11: tier2_mult=1.4 and tier3_mult=1.8 were calibrated for squad_size=15.
// With dynamic squad_size (L6.6), recalibrate once typical squad_size distribution is known.
const TIER_LABELS = [
  null,                        // tier 0 — no message needed
  '1 repeated player allowed', // tier 1
  '3 repeated players allowed',// tier 2
  'No-repeat rule lifted',     // tier 3
];

Deno.serve(async (req) => {
  try {
    const { league_id } = await req.json();
    if (!league_id) return respond(400, { error: 'league_id required' });

    // Apply formula and persist
    const { data: result } = await supabase
      .rpc('apply_relaxation_state', { p_league_id: league_id })
      .single();

    if (!result) return respond(500, { error: 'apply_relaxation_state returned null' });

    const { state, tier_changed, prev_tier, new_tier } = result;

    // Only write gazette when tier actually changes
    if (tier_changed && new_tier > 0) {
      const label    = TIER_LABELS[new_tier];
      const pressure = state.pressure;
      const pool     = state.available_pool;
      const managers = state.n_managers;

      const headline = `RULE UPDATE: Pool pressure at ${(pressure * 100).toFixed(0)}% — ${label}`;

      const bullets = [
        { text: `Available pool: ${pool} players · ${managers} managers · ${managers * 15} total slots` },
        { text: `Pressure ratio: ${pressure} (threshold: ${state.threshold})` },
        new_tier === 3
          ? { text: 'The no-repeat rule is now fully lifted for this league — managers may hold any player.' }
          : { text: `Each manager may hold up to ${TIER_LABELS[new_tier].match(/\d+/)?.[0] ?? 'unlimited'} repeated player(s).` },
      ];

      await supabase.from('gazette_entries').insert({
        league_id,
        entry_type:   'breaking_news',
        headline,
        bullets:      JSON.stringify(bullets),
        full_data:    JSON.stringify(state),
        published_at: new Date().toISOString(),
      });
    }

    return respond(200, {
      league_id,
      tier_changed,
      prev_tier,
      new_tier,
      repeats_allowed: state.repeats_allowed,
      pressure:        state.pressure,
      threshold:       state.threshold,
    });
  } catch (err) {
    await logError(FN, 'error', err.message, { stack: err.stack });
    return respond(500, { error: err.message });
  }
});

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
