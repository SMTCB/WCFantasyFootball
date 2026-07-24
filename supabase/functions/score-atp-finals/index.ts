import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/auth.ts';
import { logError } from '../_shared/log.ts';

// ─────────────────────────────────────────────────────────────────────────────
// score-atp-finals — Scores the ATP Finals pick'em prediction game
//
// Called by admin after all 15 match results are entered.
// ATP Finals is a different mechanic from standard tournaments:
//   - Users predict winners of 12 group matches + 2 SF + 1 Final
//   - Points per correct pick:
//       group match (matches 1-12):   3 pts each (max 36)
//       SF (matches 13-14):           5 pts each (max 10)
//       Final (match 15):             8 pts       (max  8)
//       Total possible:              54 pts
//
// Output written to tennis_tournament_scores (same table as standard tournaments,
// using the ATP Finals tennis_tournament row — look up by tournament_type='atp_finals').
// Gazette entry written with entry_type='tennis_result'.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MATCH_PTS: Record<string, number> = {
  group: 3,
  sf:    5,
  final: 8,
};

interface MatchRow {
  match_number: number;
  match_type: string;
  winner_player_id: string | null;
}

interface PickRow {
  user_id: string;
  match_number: number;
  picked_player_id: string;
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

    const body = await req.json();
    const { season_year } = body;
    if (!season_year) {
      return new Response(
        JSON.stringify({ error: 'season_year required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 1. Load ATP Finals tournament ────────────────────────────────────────
    const { data: tournament, error: tErr } = await supabase
      .from('tennis_tournaments')
      .select('id, name, status, season_year')
      .eq('season_year', season_year)
      .eq('tournament_type', 'atp_finals')
      .single();

    if (tErr || !tournament) {
      return new Response(
        JSON.stringify({ error: 'ATP_FINALS_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Load all 15 match results ─────────────────────────────────────────
    const { data: matches, error: mErr } = await supabase
      .from('tennis_atp_finals_matches')
      .select('match_number, match_type, winner_player_id')
      .eq('season_year', season_year)
      .order('match_number');

    if (mErr) throw new Error(`Matches fetch failed: ${mErr.message}`);

    const resultMap = new Map<number, MatchRow>(
      (matches ?? []).map((m: MatchRow) => [m.match_number, m]),
    );

    const settledMatches = (matches ?? []).filter((m: MatchRow) => m.winner_player_id != null);
    if (settledMatches.length === 0) {
      return new Response(
        JSON.stringify({ error: 'NO_RESULTS_ENTERED', detail: 'Enter match results via admin_enter_atp_finals_result first' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 3. Load all user picks ───────────────────────────────────────────────
    const { data: picks, error: pickErr } = await supabase
      .from('tennis_atp_finals_picks')
      .select('user_id, match_number, picked_player_id')
      .eq('season_year', season_year);

    if (pickErr) throw new Error(`Picks fetch failed: ${pickErr.message}`);
    if (!picks || picks.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, scored: 0, message: 'No picks to score' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Group picks by user
    const userPicks = new Map<string, PickRow[]>();
    for (const pick of picks as PickRow[]) {
      if (!userPicks.has(pick.user_id)) userPicks.set(pick.user_id, []);
      userPicks.get(pick.user_id)!.push(pick);
    }

    // ── 4. Score each user ───────────────────────────────────────────────────
    const scoreUpserts = [];
    const leaderboard: { user_id: string; total: number; correct: number }[] = [];

    for (const [user_id, userPickList] of userPicks) {
      let total = 0;
      let correct = 0;
      const breakdown: { match: number; type: string; pts: number; correct: boolean }[] = [];

      for (const pick of userPickList) {
        const match = resultMap.get(pick.match_number);
        if (!match?.winner_player_id) continue; // result not yet entered

        const pts = MATCH_PTS[match.match_type] ?? 0;
        const isCorrect = pick.picked_player_id === match.winner_player_id;
        if (isCorrect) {
          total += pts;
          correct++;
        }
        breakdown.push({ match: pick.match_number, type: match.match_type, pts: isCorrect ? pts : 0, correct: isCorrect });
      }

      scoreUpserts.push({
        user_id,
        tournament_id: tournament.id,
        base_points:    total,
        ace_card_bonus: 0, // no ace cards in ATP Finals
        captain_bonus:  0, // no captain in ATP Finals
        total_points:   total,
        breakdown: { correct_picks: correct, matches: breakdown },
      });

      leaderboard.push({ user_id, total, correct });
    }

    // ── 5. Upsert scores ─────────────────────────────────────────────────────
    const { error: upsertErr } = await supabase
      .from('tennis_tournament_scores')
      .upsert(scoreUpserts, { onConflict: 'user_id,tournament_id' });

    if (upsertErr) throw new Error(`Score upsert failed: ${upsertErr.message}`);

    // ── 6. Write gazette entry ────────────────────────────────────────────────
    leaderboard.sort((a, b) => b.total - a.total || b.correct - a.correct);
    const winner = leaderboard[0];

    const { data: winnerProfile } = await supabase
      .from('users')
      .select('username')
      .eq('id', winner?.user_id)
      .single();

    const winnerName = (winnerProfile as { username?: string } | null)?.username ?? 'A manager';

    await supabase.from('gazette_entries').upsert({
      entry_type: 'tennis_result',
      headline: `ATP Finals ${season_year} — ${winnerName} leads with ${winner?.total ?? 0} pts (${winner?.correct ?? 0}/15 correct)`,
      bullets: leaderboard.slice(0, 5).map((e, i) =>
        `${['🥇','🥈','🥉','4.','5.'][i]} ${e.user_id} — ${e.total} pts (${e.correct}/15)`,
      ),
      full_data: { season_year, tournament_id: tournament.id },
    }, { onConflict: 'entry_type,headline' });

    // ── 7. Mark ATP Finals completed ─────────────────────────────────────────
    const allSettled = settledMatches.length >= 15;
    if (allSettled && tournament.status !== 'completed') {
      await supabase.rpc('admin_complete_tournament', { p_tournament_id: tournament.id });
    }

    console.log(`[score-atp-finals] ${season_year}: scored ${scoreUpserts.length} users, ${settledMatches.length}/15 matches settled`);

    return new Response(
      JSON.stringify({
        ok: true,
        season_year,
        matches_settled: settledMatches.length,
        scored: scoreUpserts.length,
        leaderboard: leaderboard.slice(0, 5),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    await logError('score-atp-finals', 'error', String(err));
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
