// Edge Function: run-wishlist-draft
//
// Primary allocation path is the inline call from auto-open-transfer-window
// (see _shared/wishlistDraft.ts) — this function is NOT the main trigger.
// It exists for two secondary purposes:
//   1. Direct call (commissioner JWT): force-resolve a specific league/round
//      right now, without waiting for the next transfer-window tick. Useful
//      during the pilot to unblock a league without a 2h wait.
//   2. Cron mode (no body / no league_id, service role): safety-net sweep —
//      self-discovers any league+round with pending wishlist submissions and
//      an already-open transfer window that hasn't been resolved yet (covers
//      the rare case where the inline pre-step failed transiently).
//
// Security: direct calls require a valid JWT from a league commissioner.
// Cron calls originate from service role (no Authorization header required).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logError } from '../_shared/log.ts';
import { processLeagueWishlistDraft } from '../_shared/wishlistDraft.ts';

const FN           = 'run-wishlist-draft';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const ANON_KEY     = Deno.env.get('SUPABASE_ANON_KEY');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey, x-client-info',
};

function respond(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    const body = await req.json().catch(() => ({}));
    const { league_id, round_number } = body;

    // Direct league call: verify caller is a commissioner of that league.
    if (league_id) {
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

      const resolvedRound = round_number ?? await resolveNextRound(league_id);
      if (resolvedRound === null) {
        return respond(200, { message: 'No upcoming round found for this league', leagueId: league_id, skipped: true });
      }

      const result = await processLeagueWishlistDraft(supabase, league_id, resolvedRound);
      return respond(200, result);
    }

    // Cron-mode safety net: sweep every draft-mode league's open transfer
    // window for a round whose wishlist submissions haven't been resolved
    // yet. processLeagueWishlistDraft no-ops fast for anything already
    // claimed/processed or with zero participants, so it's safe to call
    // speculatively for every open window every hour.
    const { data: openWindows } = await supabase
      .from('transfer_windows')
      .select('league_id, round_number')
      .gt('closes_at', new Date().toISOString());

    const results = [];
    for (const w of openWindows ?? []) {
      try {
        results.push(await processLeagueWishlistDraft(supabase, w.league_id, w.round_number));
      } catch (err) {
        await logError(FN, 'error', 'cron sweep failed for league', { leagueId: w.league_id, round: w.round_number, error: err.message });
      }
    }

    return respond(200, { ok: true, swept: results.length, results });
  } catch (err) {
    await logError(FN, 'critical', err.message, { stack: err.stack });
    return respond(500, { error: err.message });
  }
});

// Mirrors auto-open-transfer-window's own "next round" resolution (highest
// finished fixture round + 1) so a manual commissioner trigger targets the
// same round the automatic pre-step would have.
async function resolveNextRound(leagueId) {
  const { data: league } = await supabase
    .from('leagues')
    .select('tournament_id')
    .eq('id', leagueId)
    .maybeSingle();
  if (!league?.tournament_id) return null;

  const { data: finishedFixtures } = await supabase
    .from('fixtures')
    .select('round_number')
    .eq('status', 'finished')
    .eq('tournament_id', league.tournament_id)
    .order('round_number', { ascending: false })
    .limit(1);

  if (!finishedFixtures?.length) return null;
  return finishedFixtures[0].round_number + 1;
}
