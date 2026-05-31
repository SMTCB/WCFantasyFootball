// Edge Function: eliminate-cup-club
// Two call modes:
//   1. Auto (cron): body = { mode: 'auto' }
//      Loops over all leagues with active cup_active_clubs rows, calls
//      sync_cup_eliminations() for each. No JWT required (service-role cron).
//   2. Manual (commissioner): body = { league_id, club_id, club_name? }
//      Eliminates a single named club, writes gazette + recalculates relaxation.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';

const FN           = 'eliminate-cup-club';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { league_id, club_id, club_name, mode } = body;

    // ── AUTO mode (cron) ──────────────────────────────────────────────────────
    if (mode === 'auto') {
      // Find all leagues that have at least one active cup_active_clubs row.
      const { data: cupLeagues } = await supabase
        .from('cup_active_clubs')
        .select('league_id')
        .is('eliminated_at', null);

      const leagueIds = [...new Set((cupLeagues ?? []).map(r => r.league_id))];

      if (!leagueIds.length) {
        return respond(200, { message: 'No active cup leagues found', eliminated: 0 });
      }

      let totalEliminated = 0;
      const results = [];

      for (const lid of leagueIds) {
        const { data: count, error } = await supabase
          .rpc('sync_cup_eliminations', { p_league_id: lid });

        if (error) {
          await logError(FN, 'warning', `sync_cup_eliminations failed for league ${lid}`, { error: error.message });
          results.push({ league_id: lid, error: error.message });
        } else {
          totalEliminated += (count ?? 0);
          results.push({ league_id: lid, eliminated: count ?? 0 });
          // Recalculate relaxation for any league where clubs were eliminated
          if ((count ?? 0) > 0) {
            await supabase.functions.invoke('calculate-relaxation', { body: { league_id: lid } });
          }
        }
      }

      return respond(200, { mode: 'auto', leaguesChecked: leagueIds.length, totalEliminated, results });
    }

    // ── MANUAL mode (commissioner) ────────────────────────────────────────────
    if (!league_id || !club_id) return respond(400, { error: 'league_id and club_id required' });

    // Verify caller is a commissioner of this league.
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return respond(401, { error: 'Unauthorized' });

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return respond(401, { error: 'Unauthorized' });

    const { data: membership } = await supabase
      .from('league_members')
      .select('role')
      .eq('league_id', league_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || membership.role !== 'commissioner') {
      return respond(403, { error: 'Forbidden — commissioner only' });
    }

    // Eliminate
    const { error: elimErr } = await supabase.rpc('eliminate_cup_club', {
      p_league_id: league_id,
      p_club_id:   club_id,
    });
    if (elimErr) return respond(400, { error: elimErr.message });

    // Get updated pool stats
    const { data: stats } = await supabase
      .rpc('get_cup_pool_stats', { p_league_id: league_id })
      .single();

    // Count managers in this league for context
    const { count: managerCount } = await supabase
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', league_id);

    // Build gazette headline
    const displayName = club_name ?? club_id;
    const headline    = `${displayName.toUpperCase()} ELIMINATED — Player pool reduced to ${stats?.available_players ?? '?'} players`;

    const bullets = [
      { text: `${stats?.active_clubs ?? '?'} clubs remain active in the cup` },
      { text: `${stats?.available_players ?? '?'} players now eligible for new picks` },
    ];

    if (managerCount && stats?.available_players) {
      const pressure = ((managerCount * 15) / stats.available_players).toFixed(2);
      bullets.push({ text: `Pool pressure: ${pressure}× — managers × 15 vs available pool` });
    }

    await supabase.from('gazette_entries').insert({
      league_id,
      entry_type:   'breaking_news',
      headline,
      bullets:      JSON.stringify(bullets),
      full_data:    JSON.stringify(stats),
      published_at: new Date().toISOString(),
    });

    // L6.10: await relaxation recalculation so gazette is written before this response returns
    await supabase.functions.invoke('calculate-relaxation', { body: { league_id } });

    return respond(200, { eliminated: club_id, stats });
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
