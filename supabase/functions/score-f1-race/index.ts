import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/auth.ts';
import { logError } from '../_shared/log.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SCORING = {
  p1_exact: 10, p2_exact: 8, p3_exact: 6,
  wrong_spot: 3,
  dnf: 5, team: 5, special: 5,
  all_correct_bonus: 3,
};

function scoreRaceBet(bet, race) {
  const breakdown = {};
  let total = 0;
  let allCorrect = true;

  // P1
  if (bet.p1 && race.result_p1) {
    if (bet.p1 === race.result_p1) {
      breakdown.p1 = SCORING.p1_exact; total += SCORING.p1_exact;
    } else if ([race.result_p2, race.result_p3].includes(bet.p1)) {
      breakdown.p1 = SCORING.wrong_spot; total += SCORING.wrong_spot; allCorrect = false;
    } else {
      breakdown.p1 = 0; allCorrect = false;
    }
  } else { allCorrect = false; }

  // P2
  if (bet.p2 && race.result_p2) {
    if (bet.p2 === race.result_p2) {
      breakdown.p2 = SCORING.p2_exact; total += SCORING.p2_exact;
    } else if ([race.result_p1, race.result_p3].includes(bet.p2)) {
      breakdown.p2 = SCORING.wrong_spot; total += SCORING.wrong_spot; allCorrect = false;
    } else {
      breakdown.p2 = 0; allCorrect = false;
    }
  } else { allCorrect = false; }

  // P3
  if (bet.p3 && race.result_p3) {
    if (bet.p3 === race.result_p3) {
      breakdown.p3 = SCORING.p3_exact; total += SCORING.p3_exact;
    } else if ([race.result_p1, race.result_p2].includes(bet.p3)) {
      breakdown.p3 = SCORING.wrong_spot; total += SCORING.wrong_spot; allCorrect = false;
    } else {
      breakdown.p3 = 0; allCorrect = false;
    }
  } else { allCorrect = false; }

  // DNF
  if (bet.dnf_driver && race.result_dnf_drivers?.length > 0) {
    if (race.result_dnf_drivers.includes(bet.dnf_driver)) {
      breakdown.dnf = SCORING.dnf; total += SCORING.dnf;
    } else {
      breakdown.dnf = 0; allCorrect = false;
    }
  } else if (bet.dnf_driver) {
    breakdown.dnf = 0; allCorrect = false;
  }

  // Team most points
  if (bet.team_most_points && race.result_team_most_points) {
    if (bet.team_most_points === race.result_team_most_points) {
      breakdown.team = SCORING.team; total += SCORING.team;
    } else {
      breakdown.team = 0; allCorrect = false;
    }
  } else if (bet.team_most_points) {
    breakdown.team = 0; allCorrect = false;
  }

  // Special category
  if (bet.special_category_answer && race.special_category_answer) {
    const normalise = s => s?.trim().toLowerCase();
    if (normalise(bet.special_category_answer) === normalise(race.special_category_answer)) {
      breakdown.special = SCORING.special; total += SCORING.special;
    } else {
      breakdown.special = 0; allCorrect = false;
    }
  } else if (bet.special_category_answer) {
    breakdown.special = 0; allCorrect = false;
  }

  // All correct bonus
  if (allCorrect && total > 0) {
    breakdown.bonus = SCORING.all_correct_bonus;
    total += SCORING.all_correct_bonus;
  }

  return { total, breakdown };
}

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

  const authErr = await requireServiceRole(req);
  if (authErr) return authErr;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    const { race_id } = await req.json();
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
