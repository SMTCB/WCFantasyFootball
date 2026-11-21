// Live football points, shared by the Live screen and Home (MD-3).
// Both screens must show the same numbers, so every rule about which round is
// live, which fixtures count, who starts and how the captain scores lives here.

import { supabase } from './supabase';

export const LIVE_FIXTURE_COLUMNS =
  'id, home_team, away_team, status, kickoff_at, minute, home_score, away_score, tournament_id, matchday_id';

// A hook that opens a realtime channel needs a name no other mounted instance
// uses: supabase.channel(name) hands back the already-subscribed channel and
// adding .on() to it throws (see the Clubhouse crash, PR #1169).
export function uniqueChannelName(name) {
  return `${name}:${Math.random().toString(36).slice(2)}`;
}

export function withGoals(f) {
  return { ...f, homeGoals: f.home_score ?? 0, awayGoals: f.away_score ?? 0 };
}

// The round being played in each tournament: the most recent deadline that has passed.
export async function fetchActiveMatchdays(tournamentIds) {
  const activeMatchdayIds = [];
  const matchdayIdByTournament = {};
  if (!tournamentIds.length) return { activeMatchdayIds, matchdayIdByTournament };
  const { data: mdRows = [] } = await supabase
    .from('matchday_deadlines')
    .select('matchday_id, tournament_id, deadline_at')
    .in('tournament_id', tournamentIds)
    .lte('deadline_at', new Date().toISOString())
    .order('deadline_at', { ascending: false });
  const seen = new Set();
  for (const row of (mdRows || [])) {
    if (!seen.has(row.tournament_id)) {
      seen.add(row.tournament_id);
      activeMatchdayIds.push(row.matchday_id);
      matchdayIdByTournament[row.tournament_id] = row.matchday_id;
    }
  }
  return { activeMatchdayIds, matchdayIdByTournament };
}

// Live fixtures, scoped to the active round(s) when known, else to the user's tournaments.
export async function fetchLiveFixtures({ activeMatchdayIds, tournamentIds }) {
  let q = supabase
    .from('fixtures')
    .select(LIVE_FIXTURE_COLUMNS)
    .eq('status', 'live')
    .order('kickoff_at', { ascending: true });
  if (activeMatchdayIds.length) q = q.in('matchday_id', activeMatchdayIds);
  else if (tournamentIds.length) q = q.in('tournament_id', tournamentIds);
  const { data = [] } = await q;
  return data || [];
}

// Fixtures whose stats count toward this round: the live ones plus every finished
// fixture in the active round(s), so a multi-day round keeps its points all the way
// through. With no known round, fall back to fixtures finished in the last 6 hours.
export async function fetchStatsFixtureIds({ liveFixtures, activeMatchdayIds, tournamentId = null }) {
  let ids = liveFixtures.map(f => f.id);
  if (activeMatchdayIds.length) {
    const { data: finished = [] } = await supabase
      .from('fixtures')
      .select('id')
      .in('matchday_id', activeMatchdayIds)
      .eq('status', 'finished');
    ids = [...new Set([...ids, ...(finished || []).map(f => f.id)])];
  }
  if (!ids.length) {
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    let q = supabase.from('fixtures').select('id').eq('status', 'finished').gte('kickoff_at', cutoff);
    if (tournamentId) q = q.eq('tournament_id', tournamentId);
    const { data: recent = [] } = await q;
    ids = (recent || []).map(f => f.id);
  }
  return ids;
}

// Once a round is settled, points_breakdown holds the exact XI, bench and captain
// that were scored, so later transfers cannot rewrite what the round showed.
export function resolveRoundSquad(squadRow, breakdown) {
  const settledXi    = breakdown?.effective_xi?.length  ? breakdown.effective_xi  : null;
  const settledBench = breakdown?.bench_players?.length ? breakdown.bench_players : null;
  const roundIsSettled = Boolean(settledXi);
  const squadPlayerIds = roundIsSettled
    ? [...(settledXi || []), ...(settledBench || [])]
    : (squadRow?.players || []);
  const startingXi = roundIsSettled
    ? settledXi
    : (squadRow?.starting_xi?.length > 0 ? squadRow.starting_xi : null);
  // No captain set: the first starter is captain, as on the squad screen.
  const captainId = breakdown?.effective_captain_id ?? squadRow?.captain_id ?? (startingXi?.[0] ?? squadPlayerIds[0] ?? null);
  const isTripleCap = breakdown?.is_triple_captain ?? squadRow?.is_triple_captain ?? false;
  return { squadPlayerIds, startingXi, captainId, isTripleCap, roundIsSettled };
}

// Valid starting XI for squads that never had a lineup set: exactly 1 GK, at
// least 1 DEF/MID/FWD, then squad order up to 11.
export function pickValidStarters(squadIds, playerLookup) {
  const byPos = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const id of squadIds) {
    const p = playerLookup[id];
    if (p && byPos[p.position]) byPos[p.position].push(id);
  }
  const starters = new Set();
  if (byPos.GK.length)  starters.add(byPos.GK[0]);
  if (byPos.DEF.length) starters.add(byPos.DEF[0]);
  if (byPos.MID.length) starters.add(byPos.MID[0]);
  if (byPos.FWD.length) starters.add(byPos.FWD[0]);
  for (const id of squadIds) {
    if (starters.size >= 11) break;
    if (starters.has(id)) continue;
    const p = playerLookup[id];
    if (!p) continue;
    const gkAlreadyIn = [...starters].some(sid => playerLookup[sid]?.position === 'GK');
    if (p.position === 'GK' && gkAlreadyIn) continue;
    starters.add(id);
  }
  return starters;
}

// Points per player for one squad. statsData rows: player_id, fixture_id,
// fantasy_points, minutes_played. A player is "live" only while a fixture they
// have minutes in is still in progress.
export function scoreSquad({ squadPlayerIds, startingXi, captainId, isTripleCap, playerRows, statsData, liveFixtureIds }) {
  const minutesMap = {};
  const pointsMap = {};
  const liveSet = new Set(liveFixtureIds);
  const livePlayerSet = new Set();
  for (const s of (statsData || [])) {
    minutesMap[s.player_id] = (minutesMap[s.player_id] || 0) + (s.minutes_played ?? 0);
    pointsMap[s.player_id] = (pointsMap[s.player_id] || 0) + Number(s.fantasy_points);
    if (liveSet.has(s.fixture_id) && (s.minutes_played ?? 0) > 0) livePlayerSet.add(s.player_id);
  }

  const inSquad = new Set(squadPlayerIds);
  const squadRows = (playerRows || []).filter(p => inSquad.has(p.id));
  const playerLookup = Object.fromEntries(squadRows.map(p => [p.id, p]));
  const starterIdSet = startingXi
    ? new Set(startingXi.filter(id => playerLookup[id]))
    : pickValidStarters(squadPlayerIds, playerLookup);
  const benchSet = new Set(squadPlayerIds.filter(id => !starterIdSet.has(id)));

  const enriched = squadRows.map(p => {
    let pts = pointsMap[p.id] || 0;
    const isBench = benchSet.has(p.id);
    // Round before the captain multiplier, so 1.4 doubled reads 2, not 3.
    if (!isBench && p.id === captainId) pts = Math.round(pts) * (isTripleCap ? 3 : 2);
    return {
      ...p,
      points: pts,
      displayPoints: Math.round(pts ?? 0),
      live: livePlayerSet.has(p.id),
      isBench,
      isCaptain: !isBench && p.id === captainId,
      minutes: minutesMap[p.id] ?? null,
    };
  });
  const byId = Object.fromEntries(enriched.map(p => [p.id, p]));
  const starters = startingXi
    ? startingXi.map(id => byId[id]).filter(Boolean)
    : enriched.filter(p => !p.isBench);
  const bench = squadPlayerIds.filter(id => benchSet.has(id)).map(id => byId[id]).filter(Boolean);

  return { starters, bench, pointsMap, livePlayerSet, benchSet, minutesMap };
}
