import { supabase } from './supabase';

// Points won on bets, per manager and round, so the Recap and the live table
// show the same round totals. league_members.total_points already includes
// these (migration 167); this only places them on a round.

const roundNo = (id) => parseInt(String(id).replace(/^.*-r/, ''), 10);

async function fetchPlayedRoundIds(tournamentId) {
  const { data, error } = await supabase
    .from('matchday_deadlines').select('matchday_id')
    .eq('tournament_id', tournamentId).lte('deadline_at', new Date().toISOString());
  if (error) throw error;
  return (data ?? []).map(r => r.matchday_id).sort((a, b) => roundNo(a) - roundNo(b));
}

// Live table rows (get_live_league_table) with this round's bet points: adds
// bet_points, and ranks "before this round" without them. matchday_points stays
// player points only, which head-to-head and challenges are decided on.
export function withRoundBets(rows, betsByUser, matchdayId) {
  const out = rows.map(r => {
    const bet = betsByUser[r.user_id]?.[matchdayId]?.total ?? 0;
    const before = Number(r.total_points) - Number(r.matchday_points ?? 0) - bet;
    return { ...r, bet_points: bet, before: Math.round(before * 100) / 100 };
  });
  return out.map(({ before, ...r }) => ({ ...r, rank_before: 1 + out.filter(o => o.before > before).length }));
}

// Returns { [userId]: { [matchdayId]: { total, bets: [{ title, amount }] } } }.
// roundIds (ascending) are the rounds on screen; defaults to those whose deadline has passed.
//
// bet_instances has no matchday_id column. A match-scoped bet takes its fixture's
// round; any other bet takes the first round whose last kickoff is on/after its
// created_at (the round in progress when it was set). Mapping by the bet's own
// deadline pushed every bet into the following round.
export async function fetchRoundBets({ leagueId, tournamentId, roundIds }) {
  const { data: betRows, error: betErr } = await supabase
    .from('bet_submissions')
    .select('user_id, reward_awarded, bet_instances!inner(league_id, created_at, scope_type, scope_ref, title, reward_type, status)')
    .eq('is_correct', true)
    .not('reward_awarded', 'is', null)
    .eq('bet_instances.league_id', leagueId)
    .eq('bet_instances.reward_type', 'points')
    .eq('bet_instances.status', 'resolved');
  if (betErr) throw betErr;
  if (!betRows?.length) return {};

  const rounds = roundIds ?? await fetchPlayedRoundIds(tournamentId);
  if (!rounds.length) return {};

  const { data: fixRows, error: fixErr } = await supabase
    .from('fixtures').select('id, matchday_id, kickoff_at')
    .eq('tournament_id', tournamentId);
  if (fixErr) throw fixErr;

  const fixtureRound = {};
  const lastKickoff = {};
  for (const f of fixRows ?? []) {
    if (!f.matchday_id) continue;
    fixtureRound[f.id] = f.matchday_id;
    const t = new Date(f.kickoff_at).getTime();
    if (!(lastKickoff[f.matchday_id] >= t)) lastKickoff[f.matchday_id] = t;
  }

  const shown = new Set(rounds);
  const lastShown = rounds[rounds.length - 1];
  const roundOf = (bet) => {
    const scoped = bet.scope_type === 'match' ? fixtureRound[bet.scope_ref] : null;
    if (scoped) return shown.has(scoped) ? scoped : lastShown;
    const created = new Date(bet.created_at).getTime();
    return rounds.find(id => lastKickoff[id] >= created) ?? lastShown;
  };

  const map = {};
  for (const row of betRows) {
    const bet = row.bet_instances;
    const amount = Number(row.reward_awarded) || 0;
    if (!amount) continue;
    const id = roundOf(bet);
    const byRound = (map[row.user_id] ??= {});
    const entry = (byRound[id] ??= { total: 0, bets: [] });
    entry.total += amount;
    entry.bets.push({ title: bet.title || 'Bet', amount });
  }
  return map;
}
