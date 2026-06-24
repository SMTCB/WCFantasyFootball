import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

const TIER_PTS: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 6 };
const DEEP_ROUNDS = new Set(['sf', 'runner_up', 'champion']);
const EARLY_EXIT  = new Set(['r128', 'r64']); // T1 early exit triggers safety_net

interface PlayerRow {
  id: string;
  tier: number;
  rounds_won: number;
  round_reached: string | null;
  player_name: string;
}

interface RosterRow {
  user_id: string;
  tier1_player_id:  string | null;
  tier2a_player_id: string | null;
  tier2b_player_id: string | null;
  tier3a_player_id: string | null;
  tier3b_player_id: string | null;
  tier4a_player_id: string | null;
  tier4b_player_id: string | null;
  ace_card_type: string | null;
}

interface CaptainRow {
  user_id: string;
  captain_player_id: string;
}

function rosterPlayerIds(r: RosterRow): (string | null)[] {
  return [
    r.tier1_player_id,
    r.tier2a_player_id, r.tier2b_player_id,
    r.tier3a_player_id, r.tier3b_player_id,
    r.tier4a_player_id, r.tier4b_player_id,
  ];
}

function scorePlayer(player: PlayerRow, aceCard: string | null, isT4DarkHorse: boolean): number {
  const basePts = TIER_PTS[player.tier] ?? 3;
  let pts = player.rounds_won * basePts;

  // dark_horse_insurance: T4 players get floor of 6 pts even if 0 wins
  if (aceCard === 'dark_horse_insurance' && isT4DarkHorse && pts === 0) {
    pts = 6;
  }

  return pts;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

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
      const { user_id, ace_card_type } = roster;
      const captainId = captainMap.get(user_id) ?? null;
      const breakdown: Record<string, unknown> = { players: [] };

      let basePts = 0;
      let captainBonus = 0;
      let aceBonus = 0;

      const allPids = rosterPlayerIds(roster).filter(Boolean) as string[];
      const t4Pids = new Set([roster.tier4a_player_id, roster.tier4b_player_id].filter(Boolean) as string[]);

      // Score each player slot
      for (const pid of allPids) {
        const player = playerMap.get(pid);
        if (!player) continue;

        const isT4 = t4Pids.has(pid);
        const pts = scorePlayer(player, ace_card_type, isT4);
        basePts += pts;

        // QF captain: add equal bonus (×2 total = base + bonus)
        if (pid === captainId) {
          captainBonus += pts;
        }

        (breakdown.players as unknown[]).push({
          player_id: pid,
          player_name: player.player_name,
          tier: player.tier,
          rounds_won: player.rounds_won,
          round_reached: player.round_reached,
          base_pts: pts,
          is_captain: pid === captainId,
        });
      }

      // ── Ace card bonuses ───────────────────────────────────────────────────
      if (ace_card_type) {
        const myPlayers = allPids.map(pid => playerMap.get(pid)).filter(Boolean) as PlayerRow[];

        if (ace_card_type === 'underdog_boost') {
          // +15 if any T3/T4 player reached SF or better
          const hasDeepRun = myPlayers.some(p =>
            (p.tier === 3 || p.tier === 4) && p.round_reached && DEEP_ROUNDS.has(p.round_reached),
          );
          if (hasDeepRun) aceBonus = 15;

        } else if (ace_card_type === 'safety_net') {
          // +8 if T1 player exited in R1 or R2
          const t1Player = playerMap.get(roster.tier1_player_id ?? '');
          if (t1Player && t1Player.round_reached && EARLY_EXIT.has(t1Player.round_reached)) {
            aceBonus = 8;
          }

        } else if (ace_card_type === 'surface_specialist') {
          // +12 proxy: captain reached SF or better
          if (captainId) {
            const cap = playerMap.get(captainId);
            if (cap && cap.round_reached && DEEP_ROUNDS.has(cap.round_reached)) {
              aceBonus = 12;
            }
          }
        }
        // dark_horse_insurance: already applied per-player in scorePlayer()
      }

      const total = basePts + captainBonus + aceBonus;

      breakdown.ace_card_type    = ace_card_type;
      breakdown.ace_card_bonus   = aceBonus;
      breakdown.captain_player_id = captainId;
      breakdown.captain_bonus    = captainBonus;

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

    // Fetch winner username for headline
    const { data: winnerProfile } = await supabase
      .from('users')
      .select('username')
      .eq('id', winner?.user_id)
      .single();

    const winnerName = (winnerProfile as { username?: string } | null)?.username ?? 'A manager';

    await supabase.from('gazette_entries').upsert({
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
    }, { onConflict: 'entry_type,headline' });

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
    console.error('[score-tennis-tournament] Error:', err);
    return new Response(
      JSON.stringify({ error: 'INTERNAL_ERROR', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
