import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRoleOrAdmin } from '../_shared/auth.ts';
import { logError } from '../_shared/log.ts';
import { scoreRaceBet } from './scoring-logic.js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Awards an event_win trophy to the top scorer within each paddock that's
// racing this season — paddocks are F1's league-equivalent (own circle_id,
// own membership), so "the winner" is scoped per paddock, not platform-wide.
// Ties at the top are skipped (no clear winner), matching round_win's
// draws-are-skipped precedent in calculate-scores.
async function awardEventWinTrophies(supabase, race, scoreByUser) {
  if (scoreByUser.size === 0) return;

  const { data: sport } = await supabase
    .from('sports').select('id').eq('name', 'Formula 1').maybeSingle();
  if (!sport?.id) return;

  const { data: season } = await supabase
    .from('f1_seasons').select('id').eq('season', race.season).maybeSingle();
  if (!season?.id) return;

  const { data: paddocks } = await supabase
    .from('paddocks').select('id, name, circle_id').eq('season', race.season).eq('sport_id', sport.id);
  if (!paddocks?.length) return;

  const { data: members } = await supabase
    .from('paddock_members').select('paddock_id, user_id')
    .in('paddock_id', paddocks.map(p => p.id));

  const membersByPaddock = new Map();
  for (const m of (members ?? [])) {
    if (!membersByPaddock.has(m.paddock_id)) membersByPaddock.set(m.paddock_id, []);
    membersByPaddock.get(m.paddock_id).push(m.user_id);
  }

  for (const paddock of paddocks) {
    const paddockMembers = membersByPaddock.get(paddock.id) ?? [];
    let topUser = null;
    let topPts = -1;
    let tie = false;
    for (const uid of paddockMembers) {
      const pts = scoreByUser.get(uid);
      if (pts === undefined) continue;
      if (pts > topPts) { topPts = pts; topUser = uid; tie = false; }
      else if (pts === topPts) { tie = true; }
    }
    if (!topUser || tie || topPts <= 0) continue;

    await supabase.rpc('award_trophy', {
      p_circle_id:     paddock.circle_id,
      p_league_id:     paddock.id,
      p_user_id:       topUser,
      p_sport_id:      sport.id,
      p_tournament_id: season.id,
      p_trophy_type:   'event_win',
      p_tier:          'gold',
      p_meta: {
        event_key:   race.id,
        label:       'Race Win',
        reason:      `${race.gp_name} — ${topPts} pts`,
        league_name: paddock.name,
        sport_type:  'f1',
      },
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const { race_id, paddock_id } = body;

  // Direct browser calls (F1AdminScreen's "SCORE RACE" button) carry the
  // admin's own session JWT and a paddock_id — authorized per-paddock via
  // is_competition_admin, same predicate F1AdminScreen already gates the
  // button on client-side. Cron/service-role calls skip this entirely.
  const authErr = await requireServiceRoleOrAdmin(req, async (userClient) => {
    if (!paddock_id) return false;
    const { data } = await userClient.rpc('is_competition_admin', {
      p_competition_type: 'paddock',
      p_competition_id: paddock_id,
    });
    return data === true;
  });
  if (authErr) return authErr;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    if (!race_id) throw new Error('race_id required');

    // Load race
    const { data: race, error: raceErr } = await supabase
      .from('f1_races').select('*').eq('id', race_id).maybeSingle();
    if (raceErr) throw raceErr;
    if (!race) throw new Error('Race not found');
    if (!race.result_p1) throw new Error('Race has no result — save result first');

    // Load all bets for this race
    const { data: bets, error: betsErr } = await supabase
      .from('f1_bets_race')
      .select('*')
      .eq('season', race.season)
      .eq('round_number', race.round_number);
    if (betsErr) throw betsErr;

    let scored = 0;
    let winner = null;
    let winnerPts = 0;
    const scoreByUser = new Map();

    for (const bet of (bets ?? [])) {
      const { total, breakdown } = scoreRaceBet(bet, race);

      // Upsert score
      const { error: scoreErr } = await supabase.from('f1_scores').upsert({
        user_id: bet.user_id,
        season: race.season,
        round_number: race.round_number,
        score_type: 'race',
        total_points: total,
        breakdown,
        scored_at: new Date().toISOString(),
      }, { onConflict: 'user_id,season,round_number,score_type' });
      if (scoreErr) throw scoreErr;

      scoreByUser.set(bet.user_id, total);
      if (total > winnerPts) {
        winnerPts = total;
        winner = bet.user_id;
      }
      scored++;
    }

    // Mark race as scored
    const { error: markErr } = await supabase
      .from('f1_races').update({ is_scored: true }).eq('id', race_id);
    if (markErr) throw markErr;

    // event_win trophies — per-paddock winner (membership-filtered over the
    // just-computed global scores), not the single cross-platform top scorer
    // above. Mirrors get_paddock_leaderboard()'s membership-filter pattern.
    // Non-fatal: award_trophy() itself swallows errors, and this whole block
    // is best-effort so a trophy failure never blocks race scoring.
    try {
      await awardEventWinTrophies(supabase, race, scoreByUser);
    } catch (e) {
      console.warn('[score-f1-race] award_trophy (event_win) failed (non-critical):', e.message);
    }

    // Resolve winner display name
    let winnerName = null;
    if (winner) {
      const { data: u } = await supabase
        .from('users').select('username').eq('id', winner).maybeSingle();
      winnerName = u?.username ?? winner;
    }

    return new Response(JSON.stringify({ scored, winner: winnerName, winner_pts: winnerPts }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    await logError('score-f1-race', 'error', String(err));
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
