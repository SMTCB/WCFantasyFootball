import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { requireServiceRole } from '../_shared/auth.ts';
import { logError } from '../_shared/log.ts';

// ─────────────────────────────────────────────────────────────────────────────
// sync-tennis-results — Cron-only. Replaces the fully-manual admin_enter_round_
// results flow for any tournament currently in_progress or qf_captain_open.
//
// API budget: 1 API call PER ACTIVE TOURNAMENT per invocation. Scheduled 3x/day
// (see migration for the cron job) — with at most 1-2 tournaments ever active
// at once, this uses ~3-6 of the 50 req/day RapidAPI budget, leaving headroom
// for admin ad-hoc lookups (sync-tennis-players, lookup work) on the same day.
//
// Scope: grand_slam and masters_1000 only — both use a single-elimination
// bracket, which this function assumes is BYE-LESS (draw_size is an exact
// power of two: 128, 64, 32...). Confirmed correct for Grand Slams (128-draw).
// Masters 1000 events often use a 96-draw with byes for top seeds — that
// breaks the "Nth win = Nth round" assumption below, so any tournament whose
// draw_size isn't a power of two is skipped with a warning rather than risking
// a mislabeled round. ATP Finals (round-robin + knockout, not single-elim) is
// explicitly out of scope — see score-atp-finals for that format.
//
// Derivation method (bye-less single-elim only):
//   A player's most recent result_type='completed' match tells you whether
//   they won or lost. Their number of wins BEFORE that match (or total wins,
//   if still alive) maps directly to round_reached / rounds_won:
//     0 wins → r128, 1 → r64, 2 → r32, 3 → r16, 4 → qf, 5 → sf, 6 → runner_up
//     (max wins, i.e. undefeated through the final) → champion
//   This mirrors the CHECK constraint on tennis_tournament_players.round_reached
//   (exactly these 8 values) and was validated against the US Open 2026 R1
//   results this session (44/44 correctly identified as r128 losers).
//
// Players who appear in the results feed but were never captured by
// sync-tennis-players (the draw endpoint is sometimes incomplete — confirmed
// on US Open, 46/128 players only recoverable via the results feed) are
// auto-seeded here as tier 4 via the same admin_seed_tournament_players RPC.
// This has zero scoring impact for anyone eliminated with rounds_won=0, and
// only under/over-values a genuinely-seeded player if they survive multiple
// rounds without ever having been in the draw sync — rare, and correctable
// by admin via a manual tier update if it happens.
// ─────────────────────────────────────────────────────────────────────────────

const RAPIDAPI_HOST = 'tennis-api-atp-wta-itf.p.rapidapi.com';
const RAPIDAPI_BASE = `https://${RAPIDAPI_HOST}/tennis/v2`;

const ROUND_NAMES = ['r128', 'r64', 'r32', 'r16', 'qf', 'sf', 'runner_up', 'champion'];

function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

interface ResultMatch {
  player1Id: number;
  player2Id: number;
  match_winner: number | null;
  result_type: string;
  date: string;
  player1: { id: number; name: string; countryAcr?: string };
  player2: { id: number; name: string; countryAcr?: string };
}

async function processTournament(
  supabase: ReturnType<typeof createClient>,
  rapidApiKey: string,
  tournament: { id: string; name: string; external_id: number; draw_size: number | null },
) {
  const roundCount = tournament.draw_size ? Math.log2(tournament.draw_size) : NaN;
  if (!tournament.draw_size || !isPowerOfTwo(tournament.draw_size)) {
    console.warn(`[sync-tennis-results] Skipping ${tournament.name}: draw_size (${tournament.draw_size}) is not a bye-less power of two`);
    return { tournament: tournament.name, skipped: true, reason: 'NON_POWER_OF_TWO_DRAW' };
  }

  // ── 1 API call for this tournament ─────────────────────────────────────
  const apiUrl = `${RAPIDAPI_BASE}/atp/tournament/results/${tournament.external_id}?pageSize=300`;
  const apiResp = await fetch(apiUrl, {
    headers: { 'X-RapidAPI-Key': rapidApiKey, 'X-RapidAPI-Host': RAPIDAPI_HOST },
  });

  if (!apiResp.ok) {
    const errText = await apiResp.text();
    console.error(`[sync-tennis-results] ${tournament.name}: API error`, apiResp.status, errText);
    return { tournament: tournament.name, error: 'API_ERROR', status: apiResp.status };
  }

  const apiData = await apiResp.json();
  // Same defensive envelope-unwrapping as sync-tennis-players — confirmed live
  // shape for the fixtures endpoint is a bare `{ data: [...] }`, and the
  // results endpoint has not been observed to differ, but this tolerates it
  // if it does.
  const rawMatches: ResultMatch[] = (
    (apiData.data as ResultMatch[]) ||
    (apiData.results as ResultMatch[]) ||
    (apiData.fixtures as ResultMatch[]) ||
    []
  );
  const matches: ResultMatch[] = rawMatches.filter(
    (m: ResultMatch) => m.result_type === 'completed' && m.match_winner,
  );

  if (matches.length === 0) {
    return { tournament: tournament.name, matches_seen: 0, eliminations_written: 0, champions_written: 0, players_seeded: 0 };
  }

  matches.sort((a, b) => a.date.localeCompare(b.date));

  // ── Existing roster for this tournament ────────────────────────────────
  const { data: existingPlayers, error: pErr } = await supabase
    .from('tennis_tournament_players')
    .select('id, external_player_id, eliminated, round_reached, rounds_won')
    .eq('tournament_id', tournament.id);
  if (pErr) throw new Error(`Players fetch failed: ${pErr.message}`);

  const byExternalId = new Map<number, { id: string; eliminated: boolean; round_reached: string | null; rounds_won: number | null }>(
    (existingPlayers ?? [])
      .filter(p => p.external_player_id != null)
      .map(p => [p.external_player_id as number, p]),
  );

  // ── Seed any player who only exists in the results feed ────────────────
  const missing = new Map<number, { player_name: string; nationality: string | null; seed: null; tier: number; external_player_id: number }>();
  for (const m of matches) {
    for (const side of [m.player1, m.player2]) {
      if (!side?.id || byExternalId.has(side.id) || missing.has(side.id)) continue;
      missing.set(side.id, {
        player_name: side.name,
        nationality: side.countryAcr ?? null,
        seed: null,
        tier: 4,
        external_player_id: side.id,
      });
    }
  }

  if (missing.size > 0) {
    const { error: seedErr } = await supabase.rpc('admin_seed_tournament_players', {
      p_tournament_id: tournament.id,
      p_players: Array.from(missing.values()),
    });
    if (seedErr) throw new Error(`Seed RPC failed: ${seedErr.message}`);

    const { data: refreshed, error: rErr } = await supabase
      .from('tennis_tournament_players')
      .select('id, external_player_id, eliminated, round_reached, rounds_won')
      .eq('tournament_id', tournament.id)
      .in('external_player_id', Array.from(missing.keys()));
    if (rErr) throw new Error(`Refresh fetch failed: ${rErr.message}`);
    for (const p of refreshed ?? []) {
      if (p.external_player_id != null) byExternalId.set(p.external_player_id as number, p);
    }
  }

  // ── Chronological win/loss derivation ──────────────────────────────────
  const wins = new Map<number, number>();
  const lossAtWins = new Map<number, number>(); // external_id -> wins before their loss

  for (const m of matches) {
    const loser = m.match_winner === m.player1Id ? m.player2Id : m.player1Id;
    wins.set(m.match_winner!, (wins.get(m.match_winner!) ?? 0) + 1);
    lossAtWins.set(loser, wins.get(loser) ?? 0);
  }

  let eliminationsWritten = 0;
  let championsWritten = 0;

  for (const [extId, winsBeforeLoss] of lossAtWins) {
    const row = byExternalId.get(extId);
    if (!row || row.eliminated) continue; // already recorded, or an unseeded player we couldn't map
    const roundReached = ROUND_NAMES[Math.min(winsBeforeLoss, ROUND_NAMES.length - 1)];
    const { error } = await supabase
      .from('tennis_tournament_players')
      .update({ eliminated: true, round_reached: roundReached, rounds_won: winsBeforeLoss })
      .eq('id', row.id);
    if (error) throw new Error(`Elimination update failed for player ${row.id}: ${error.message}`);
    eliminationsWritten++;
  }

  for (const [extId, winCount] of wins) {
    if (winCount < roundCount) continue; // hasn't won the final yet
    const row = byExternalId.get(extId);
    if (!row || row.round_reached === 'champion') continue;
    const { error } = await supabase
      .from('tennis_tournament_players')
      .update({ eliminated: false, round_reached: 'champion', rounds_won: roundCount })
      .eq('id', row.id);
    if (error) throw new Error(`Champion update failed for player ${row.id}: ${error.message}`);
    championsWritten++;
  }

  return {
    tournament: tournament.name,
    matches_seen: matches.length,
    players_seeded: missing.size,
    eliminations_written: eliminationsWritten,
    champions_written: championsWritten,
  };
}

Deno.serve(async (req) => {
  const authErr = await requireServiceRole(req);
  if (authErr) return authErr;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const rapidApiKey = Deno.env.get('RAPIDAPI_TENNIS_KEY');
    if (!rapidApiKey) {
      return new Response(JSON.stringify({ error: 'RAPIDAPI_TENNIS_KEY secret not configured' }), { status: 500 });
    }

    const { data: tournaments, error: tErr } = await supabase
      .from('tennis_tournaments')
      .select('id, name, external_id, draw_size, tournament_type, status')
      .in('status', ['in_progress', 'qf_captain_open'])
      .in('tournament_type', ['grand_slam', 'masters_1000'])
      .not('external_id', 'is', null);

    if (tErr) throw new Error(`Tournaments fetch failed: ${tErr.message}`);

    if (!tournaments || tournaments.length === 0) {
      return new Response(JSON.stringify({ ok: true, tournaments_processed: 0, results: [] }), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    }

    const results = [];
    for (const t of tournaments) {
      try {
        results.push(await processTournament(supabase, rapidApiKey, t as { id: string; name: string; external_id: number; draw_size: number | null }));
      } catch (err) {
        console.error(`[sync-tennis-results] ${t.name} failed:`, err);
        results.push({ tournament: t.name, error: String(err) });
      }
    }

    console.log('[sync-tennis-results] Done:', JSON.stringify(results));

    return new Response(JSON.stringify({ ok: true, tournaments_processed: results.length, results }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    await logError('sync-tennis-results', 'error', String(err));
    return new Response(JSON.stringify({ error: 'INTERNAL_ERROR', detail: String(err) }), { status: 500 });
  }
});
