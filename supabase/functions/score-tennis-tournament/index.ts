import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRoleOrAdmin } from '../_shared/auth.ts';
import { logError } from '../_shared/log.ts';
import {
  scoreRoster,
  type PlayerRow, type RosterRow,
} from './scoring-logic.ts';

// ─────────────────────────────────────────────────────────────────────────────
// score-tennis-tournament — Scores a completed standard tennis tournament
//
// Called by admin after entering all round results and confirming the champion.
// Works for grand_slam and masters_1000 (not atp_finals — use score-atp-finals).
//
// Request body: { tournament_id: string }
//
// Scoring model:
//   Base pts per round won (tier-based):
//     T1 = 2 pts/round  (top seeds, easier rounds, lower marginal value)
//     T2 = 3 pts/round
//     T3 = 4 pts/round
//     T4 = 6 pts/round  (dark horses, high risk/reward)
//
//   QF Captain bonus:
//     Captain player's per-round contribution is doubled (extra ×1 on top)
//
//   Ace Card bonuses:
//     underdog_boost:       +15 if any T3 or T4 player reached SF/final/champion
//     safety_net:           +8 if T1 player was eliminated in r128 or r64 (early exit)
//     surface_specialist:   +12 if your captain reached SF or better (proxy for
//                           "specialist performance"; per-player surface data unavailable)
//     dark_horse_insurance: T4 players get minimum 6 pts each (floor, 0→6 if wins=0)
//
// Output written to tennis_tournament_scores.
// Gazette entry written with entry_type='tennis_result' on completion.
// ─────────────────────────────────────────────────────────────────────────────

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CaptainRow {
  user_id: string;
  captain_player_id: string;
}

// Awards an event_win trophy to the top scorer within each player box for
// this tournament's season — player boxes are tennis's league-equivalent
// (own circle_id, own membership), so "the winner" is scoped per box, not
// platform-wide. Ties at the top are skipped (no clear winner).
// Non-fatal: award_trophy() itself swallows errors, and the caller wraps
// this whole call so a trophy failure never blocks tournament scoring.
async function awardEventWinTrophies(supabase, tournament, leaderboard) {
  if (leaderboard.length === 0) return;
  const scoreByUser = new Map(leaderboard.map(e => [e.user_id, e.total]));

  const { data: sport } = await supabase
    .from('sports').select('id').eq('name', 'Tennis').maybeSingle();
  if (!sport?.id) return;

  const { data: boxes } = await supabase
    .from('player_boxes').select('id, name, circle_id').eq('season_year', tournament.season_year);
  if (!boxes?.length) return;

  const { data: members } = await supabase
    .from('player_box_members').select('player_box_id, user_id')
    .in('player_box_id', boxes.map(b => b.id));

  const membersByBox = new Map();
  for (const m of (members ?? [])) {
    if (!membersByBox.has(m.player_box_id)) membersByBox.set(m.player_box_id, []);
    membersByBox.get(m.player_box_id).push(m.user_id);
  }

  for (const box of boxes) {
    const boxMembers = membersByBox.get(box.id) ?? [];
    let topUser = null;
    let topPts = -1;
    let tie = false;
    for (const uid of boxMembers) {
      const pts = scoreByUser.get(uid);
      if (pts === undefined) continue;
      if (pts > topPts) { topPts = pts; topUser = uid; tie = false; }
      else if (pts === topPts) { tie = true; }
    }
    if (!topUser || tie || topPts <= 0) continue;

    await supabase.rpc('award_trophy', {
      p_circle_id:     box.circle_id,
      p_league_id:     box.id,
      p_user_id:       topUser,
      p_sport_id:      sport.id,
      p_tournament_id: tournament.id,
      p_trophy_type:   'event_win',
      p_tier:          'gold',
      p_meta: {
        event_key:   tournament.id,
        label:       'Tournament Win',
        reason:      `${tournament.name} — ${topPts} pts`,
        league_name: box.name,
        sport_type:  'tennis',
      },
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Direct browser calls (TennisAdminScreen's "Trigger Scoring" button) carry
  // the admin's own session JWT — tennis_tournaments is shared global data,
  // not owned by any single Clubhouse (migration 243), so admin is gated on
  // the global users.is_admin flag, mirroring TennisAdminScreen's existing
  // client-side check, not a per-competition predicate. Cron/service-role
  // calls skip this entirely.
  const authErr = await requireServiceRoleOrAdmin(req, async (userClient, userId) => {
    const { data } = await userClient.from('users').select('is_admin').eq('id', userId).maybeSingle();
    return data?.is_admin === true;
  });
  if (authErr) return authErr;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const body = await req.json();
    const { tournament_id } = body;
    if (!tournament_id) {
      return new Response(
        JSON.stringify({ error: 'tournament_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 1. Load tournament ───────────────────────────────────────────────────
    const { data: tournament, error: tErr } = await supabase
      .from('tennis_tournaments')
      .select('id, name, season_year, tournament_type, status')
      .eq('id', tournament_id)
      .single();

    if (tErr || !tournament) {
      return new Response(
        JSON.stringify({ error: 'TOURNAMENT_NOT_FOUND' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (tournament.tournament_type === 'atp_finals') {
      return new Response(
        JSON.stringify({ error: 'USE_SCORE_ATP_FINALS', detail: 'ATP Finals uses score-atp-finals function' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Allow scoring in qf_captain_open or completed states (idempotent re-score)
    if (!['qf_captain_open', 'in_progress', 'completed'].includes(tournament.status)) {
      return new Response(
        JSON.stringify({ error: 'TOURNAMENT_NOT_SCOREABLE', status: tournament.status }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 2. Load all tournament players ───────────────────────────────────────
    const { data: players, error: pErr } = await supabase
      .from('tennis_tournament_players')
      .select('id, tier, rounds_won, round_reached, player_name')
      .eq('tournament_id', tournament_id);

    if (pErr) throw new Error(`Players fetch failed: ${pErr.message}`);

    const playerMap = new Map<string, PlayerRow>(
      (players ?? []).map((p: PlayerRow) => [p.id, p]),
    );

    // ── 3. Load all rosters ──────────────────────────────────────────────────
    const { data: rosters, error: rErr } = await supabase
      .from('tennis_rosters')
      .select('user_id, tier1_player_id, tier2a_player_id, tier2b_player_id, tier3a_player_id, tier3b_player_id, tier4a_player_id, tier4b_player_id, ace_card_type')
      .eq('tournament_id', tournament_id);

    if (rErr) throw new Error(`Rosters fetch failed: ${rErr.message}`);
    if (!rosters || rosters.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, scored: 0, message: 'No rosters to score' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── 4. Load QF captains ──────────────────────────────────────────────────
    const { data: captains } = await supabase
      .from('tennis_qf_captains')
      .select('user_id, captain_player_id')
      .eq('tournament_id', tournament_id);

    const captainMap = new Map<string, string>(
      (captains ?? []).map((c: CaptainRow) => [c.user_id, c.captain_player_id]),
    );

    // ── 5. Score each roster ─────────────────────────────────────────────────
    const scoreUpserts = [];
    const leaderboard: { user_id: string; total: number }[] = [];

    for (const roster of rosters as RosterRow[]) {
      const { user_id } = roster;
      const captainId = captainMap.get(user_id) ?? null;
      const { basePts, captainBonus, aceBonus, total, breakdown } = scoreRoster(roster, playerMap, captainId);

      scoreUpserts.push({
        user_id,
        tournament_id,
        base_points:    basePts,
        ace_card_bonus: aceBonus,
        captain_bonus:  captainBonus,
        total_points:   total,
        breakdown,
      });

      leaderboard.push({ user_id, total });
    }

    // ── 6. Upsert scores ─────────────────────────────────────────────────────
    const { error: upsertErr } = await supabase
      .from('tennis_tournament_scores')
      .upsert(scoreUpserts, { onConflict: 'user_id,tournament_id' });

    if (upsertErr) throw new Error(`Score upsert failed: ${upsertErr.message}`);

    // ── 7. Write gazette entry ────────────────────────────────────────────────
    leaderboard.sort((a, b) => b.total - a.total);
    const winner = leaderboard[0];

    // event_win trophies — per-player-box winner (membership-filtered over
    // the just-computed global scores), not the single cross-platform top
    // scorer above. Mirrors get_player_box_leaderboard()'s membership-filter
    // pattern.
    try {
      await awardEventWinTrophies(supabase, tournament, leaderboard);
    } catch (e) {
      console.warn('[score-tennis-tournament] award_trophy (event_win) failed (non-critical):', e.message);
    }

    // Fetch winner username for headline
    const { data: winnerProfile } = await supabase
      .from('users')
      .select('username')
      .eq('id', winner?.user_id)
      .single();

    const winnerName = (winnerProfile as { username?: string } | null)?.username ?? 'A manager';

    // Idempotent: delete existing gazette entry for this tournament, then reinsert
    // (no unique constraint on gazette_entries(entry_type,headline) exists — upsert
    // with onConflict silently fails with 42P10, so delete-then-insert like calculate-scores)
    await supabase.from('gazette_entries')
      .delete()
      .eq('entry_type', 'tennis_result')
      .filter('full_data->>tournament_id', 'eq', tournament_id);

    await supabase.from('gazette_entries').insert({
      entry_type: 'tennis_result',
      headline: `${tournament.name} complete — ${winnerName} leads with ${winner?.total ?? 0} pts`,
      bullets: leaderboard.slice(0, 5).map((e, i) =>
        `${['🥇','🥈','🥉','4.','5.'][i]} ${e.user_id} — ${e.total} pts`,
      ),
      full_data: {
        tournament_id,
        season_year: tournament.season_year,
        matchday_id: `tennis-${tournament.season_year}`,
      },
    });

    // ── 8. Mark tournament completed ─────────────────────────────────────────
    if (tournament.status !== 'completed') {
      await supabase.rpc('admin_complete_tournament', { p_tournament_id: tournament_id });
    }

    console.log(`[score-tennis-tournament] ${tournament.name}: scored ${scoreUpserts.length} rosters`);

    return new Response(
      JSON.stringify({
        ok: true,
        tournament: tournament.name,
        scored: scoreUpserts.length,
        leaderboard: leaderboard.slice(0, 5),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    await logError('score-tennis-tournament', 'error', String(err));
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
