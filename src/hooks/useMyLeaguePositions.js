import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const SEASON_YEAR = 2026;

// Where the user stands in every active league of every clubhouse (MD-2).
// Takes the clubhouses and the leagues Home already loaded with
// get_clubhouse_competitions, so it adds no extra round trip for them.
//
// Each row: { key, circleId, circleName, leagueId, leagueName, sport, rank, size,
//             total, above: {name,total}|null, below: {name,total}|null }
// Football reads league_members (readable by members); F1 and tennis use their
// leaderboard functions.
export function useMyLeaguePositions(circles, compsByCircle) {
  const { user } = useAuth();
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);

  const leagueKey = circles
    .map(c => {
      const comps = compsByCircle[c.id];
      if (!comps) return '';
      return ['football', 'f1', 'tennis']
        .flatMap(sport => (comps[sport] ?? []).filter(l => !l.archived && !l.finished).map(l => `${sport}:${l.id}`))
        .map(k => `${c.id}|${k}`)
        .join(',');
    })
    .filter(Boolean)
    .join(',');

  // A pull-to-refresh reloads quietly; a new set of leagues shows the loading state.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!user?.id) { setLoading(false); return; }
    if (!quiet) setLoading(true);
    const entries = leagueKey ? leagueKey.split(',').map(k => {
      const [circleId, rest] = k.split('|');
      const [sport, leagueId] = rest.split(':');
      return { circleId, sport, leagueId };
    }) : [];
    if (!entries.length) { setPositions([]); setLoading(false); return; }

    const circleName = Object.fromEntries(circles.map(c => [c.id, c.name]));
    const leagueName = {};
    for (const c of circles) {
      for (const sport of ['football', 'f1', 'tennis']) {
        for (const l of (compsByCircle[c.id]?.[sport] ?? [])) leagueName[`${sport}:${l.id}`] = l.name;
      }
    }

    const footballIds = entries.filter(e => e.sport === 'football').map(e => e.leagueId);
    const [footballRes, ...otherRes] = await Promise.all([
      footballIds.length
        ? supabase.from('league_members').select('league_id, user_id, rank, total_points, users(username)').in('league_id', footballIds)
        : Promise.resolve({ data: [] }),
      ...entries.filter(e => e.sport !== 'football').map(e => (
        e.sport === 'f1'
          ? supabase.rpc('get_paddock_leaderboard', { p_paddock_id: e.leagueId })
          : supabase.rpc('get_player_box_leaderboard', { p_player_box_id: e.leagueId, p_season_year: SEASON_YEAR })
      )),
    ]);

    // Every table normalised to [{ userId, name, total, rank }] sorted best first.
    const tables = {};
    for (const row of (footballRes.data || [])) {
      (tables[`football:${row.league_id}`] ??= []).push({
        userId: row.user_id, name: row.users?.username ?? 'Player', total: Number(row.total_points ?? 0), rank: row.rank,
      });
    }
    entries.filter(e => e.sport !== 'football').forEach((e, i) => {
      tables[`${e.sport}:${e.leagueId}`] = (otherRes[i]?.data || []).map(r => ({
        userId: r.user_id, name: r.display_name ?? r.username ?? 'Player', total: Number(r.total_points ?? 0), rank: r.rank == null ? null : Number(r.rank),
      }));
    });

    const out = [];
    for (const e of entries) {
      const key = `${e.sport}:${e.leagueId}`;
      const table = (tables[key] ?? []).slice().sort((a, b) => b.total - a.total);
      const i = table.findIndex(r => r.userId === user.id);
      if (i === -1) continue;
      const me = table[i];
      const pick = r => (r ? { name: r.name, total: r.total } : null);
      out.push({
        key: `${e.circleId}:${key}`,
        circleId: e.circleId,
        circleName: circleName[e.circleId] ?? 'Clubhouse',
        leagueId: e.leagueId,
        leagueName: leagueName[key] ?? 'League',
        sport: e.sport,
        rank: me.rank ?? i + 1,
        size: table.length,
        total: me.total,
        above: pick(table[i - 1]),
        below: pick(table[i + 1]),
      });
    }
    setPositions(out);
    setLoading(false);
  // circles/compsByCircle are summarised by leagueKey.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, leagueKey]);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(() => load({ quiet: true }), [load]);
  return { positions, loading, refresh };
}

// "You lead N of your M leagues" plus the closest race, for the Home headline.
export function summarisePositions(positions) {
  const contested = positions.filter(p => p.size > 1);
  const leading = contested.filter(p => p.rank === 1).length;
  let closest = null;
  for (const p of contested) {
    const options = [];
    if (p.above) options.push({ gap: p.above.total - p.total, other: p.above.name, dir: 'behind' });
    if (p.below) options.push({ gap: p.total - p.below.total, other: p.below.name, dir: 'ahead of' });
    for (const o of options) {
      if (!closest || o.gap < closest.gap) closest = { ...o, position: p };
    }
  }
  const best = (contested.length ? contested : positions).slice().sort((a, b) => a.rank - b.rank)[0] ?? null;
  return { leading, total: positions.length, contested: contested.length, closest, best };
}
