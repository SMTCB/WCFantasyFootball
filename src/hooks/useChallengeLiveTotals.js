import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const REFRESH_MS = 60 * 1000;

// Live squad totals for "who scores more this matchweek" bets (MD-9).
// Settled bets use the points saved on the bet; bets still being played read
// get_live_league_table, so the numbers match the Matchweek tab and Home.
//
// Returns { totals: Map(challengeId -> { mine, theirs, final }), refresh }.
export function useChallengeLiveTotals(challenges, userId) {
  const [rows, setRows] = useState({}); // "league:matchday" -> Map(user_id -> matchday_points)

  const live = useMemo(
    () => (challenges ?? []).filter(c => c.bet_type === 'gw_total' && c.status === 'accepted' && c.league_id && c.matchday_id),
    [challenges],
  );
  const pairKey = useMemo(
    () => [...new Set(live.map(c => `${c.league_id}:${c.matchday_id}`))].sort().join('|'),
    [live],
  );

  const load = useCallback(async () => {
    if (!pairKey) return;
    const pairs = pairKey.split('|');
    const results = await Promise.all(pairs.map(p => {
      const [leagueId, matchdayId] = [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)];
      return supabase.rpc('get_live_league_table', { p_league_id: leagueId, p_matchday_id: matchdayId });
    }));
    const next = {};
    results.forEach((r, i) => {
      if (r.error || !Array.isArray(r.data)) return;
      next[pairs[i]] = new Map(r.data.map(row => [row.user_id, Number(row.matchday_points ?? 0)]));
    });
    setRows(prev => ({ ...prev, ...next }));
  }, [pairKey]);

  useEffect(() => {
    if (!pairKey) return undefined;
    load();
    const t = setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [pairKey, load]);

  const totals = useMemo(() => {
    const out = new Map();
    for (const c of challenges ?? []) {
      if (c.bet_type !== 'gw_total') continue;
      const iAmChallenger = c.challenger_id === userId;
      const theirId = iAmChallenger ? c.opponent_id : c.challenger_id;
      const saved = c.challenger_pts != null
        ? { mine: iAmChallenger ? c.challenger_pts : c.opponent_pts, theirs: iAmChallenger ? c.opponent_pts : c.challenger_pts }
        : null;
      const table = c.status === 'accepted' ? rows[`${c.league_id}:${c.matchday_id}`] : null;
      if (table) out.set(c.id, { mine: table.get(userId) ?? 0, theirs: table.get(theirId) ?? 0, final: false });
      else if (saved) out.set(c.id, { ...saved, final: c.status === 'resolved' });
    }
    return out;
  }, [challenges, rows, userId]);

  return { totals, refresh: load };
}
