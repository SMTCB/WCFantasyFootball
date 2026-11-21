import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  LIVE_FIXTURE_COLUMNS, withGoals, uniqueChannelName, fetchActiveMatchdays,
  resolveRoundSquad, scoreSquad,
} from '../lib/livePoints';
import { normalisePlayer, buildFixtureInfo, formatFixtureStatus } from '../lib/players';
import { normalizeIntelligence } from '../lib/intelligence';

const REFRESH_MS = 60 * 1000;
const DEBOUNCE_MS = 1500;

// One football league's matchweek, for the Matchweek tab (MD-6 / MD-7).
// Uses the same rules as the Live screen and Home (lib/livePoints), so the points match.
//
// Returns {
//   loading,
//   matchdayId,      the round being played (last deadline passed), else the next one
//   started,         true once that round's deadline has passed
//   deadlineAt,      the round's deadline, when it has not passed yet
//   fixtures,        every fixture in the round, with homeGoals/awayGoals
//   squad,           { players (XI), bench, captainId, isTripleCaptain } | null
//   gwPoints,        your points this round
//   table,           rows from get_live_league_table, or null when it is not available
//   duel,            this round's head-to-head row for you, or null
//   refresh,
// }
export function useLeagueMatchweek({ leagueId, tournamentId, userId, h2hEnabled = false }) {
  const [state, setState] = useState({
    key: '', loading: true, matchdayId: null, started: false, deadlineAt: null,
    fixtures: [], squad: null, gwPoints: null, table: null, duel: null,
  });
  const key = `${leagueId ?? ''}:${tournamentId ?? ''}:${userId ?? ''}`;

  const load = useCallback(async () => {
    if (!leagueId || !tournamentId || !userId) return;
    try {
      const { matchdayIdByTournament } = await fetchActiveMatchdays([tournamentId]);
      let matchdayId = matchdayIdByTournament[tournamentId] ?? null;
      let started = Boolean(matchdayId);
      let deadlineAt = null;
      if (!matchdayId) {
        const { data: next } = await supabase
          .from('matchday_deadlines')
          .select('matchday_id, deadline_at')
          .eq('tournament_id', tournamentId)
          .gt('deadline_at', new Date().toISOString())
          .order('deadline_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        matchdayId = next?.matchday_id ?? null;
        deadlineAt = next?.deadline_at ?? null;
        started = false;
      }
      if (!matchdayId) {
        setState({ key, loading: false, matchdayId: null, started: false, deadlineAt: null, fixtures: [], squad: null, gwPoints: null, table: null, duel: null });
        return;
      }

      const [{ data: fixRows = [] }, { data: squadRows = [] }, tableRes, duelRes] = await Promise.all([
        supabase.from('fixtures').select(LIVE_FIXTURE_COLUMNS).eq('matchday_id', matchdayId).order('kickoff_at', { ascending: true }),
        supabase.from('squads')
          .select('id, league_id, matchday_id, players, starting_xi, captain_id, is_triple_captain, created_at')
          .eq('league_id', leagueId).eq('user_id', userId)
          .order('created_at', { ascending: false }),
        supabase.rpc('get_live_league_table', { p_league_id: leagueId, p_matchday_id: matchdayId }),
        h2hEnabled
          ? supabase.from('h2h_schedule').select('*').eq('league_id', leagueId).eq('matchday_id', matchdayId)
              .or(`home_user_id.eq.${userId},away_user_id.eq.${userId},bye_user_id.eq.${userId}`).limit(1).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const fixtures = (fixRows || []).map(withGoals);
      // The table function arrives with migration 313; until then the tab falls back to season totals.
      const table = tableRes.error ? null : (tableRes.data ?? []);

      const squadRow = (squadRows || []).find(s => s.matchday_id === matchdayId) ?? (squadRows || [])[0] ?? null;
      let squad = null;
      let gwPoints = null;
      if (squadRow) {
        const { data: fp } = await supabase
          .from('fantasy_points').select('total, points_breakdown')
          .eq('squad_id', squadRow.id).eq('matchday_id', matchdayId).maybeSingle();
        const resolved = resolveRoundSquad(squadRow, fp?.points_breakdown);
        const ids = resolved.squadPlayerIds;
        const scoredFixtureIds = fixtures.filter(f => f.status === 'live' || f.status === 'finished').map(f => f.id);
        const [{ data: playerRows = [] }, { data: statsData = [] }, { data: intelRows = [] }] = await Promise.all([
          ids.length ? supabase.from('players').select('*').in('id', ids) : Promise.resolve({ data: [] }),
          ids.length && scoredFixtureIds.length
            ? supabase.from('player_match_stats').select('player_id, fixture_id, fantasy_points, minutes_played')
                .in('player_id', ids).in('fixture_id', scoredFixtureIds)
            : Promise.resolve({ data: [] }),
          ids.length ? supabase.from('player_status').select('*').in('player_id', ids) : Promise.resolve({ data: [] }),
        ]);
        const scored = scoreSquad({
          ...resolved, playerRows, statsData,
          liveFixtureIds: fixtures.filter(f => f.status === 'live').map(f => f.id),
        });
        const intelById = new Map((intelRows || []).map(r => [r.player_id, r]));
        const shape = (p) => {
          const fixtureInfo = buildFixtureInfo(p, fixtures);
          return {
            ...normalisePlayer({ ...p, points: p.points, intel: normalizeIntelligence(intelById.get(p.id)) }),
            isBench: p.isBench,
            live: p.live,
            fixtureInfo,
            fixtureStatus: formatFixtureStatus(fixtureInfo),
          };
        };
        squad = {
          players: scored.starters.map(shape),
          bench: scored.bench.map(shape),
          captainId: resolved.captainId,
          isTripleCaptain: resolved.isTripleCap,
        };
        gwPoints = fp ? Number(fp.total ?? 0) : scored.starters.reduce((sum, p) => sum + (p.displayPoints ?? 0), 0);
      }

      setState({ key, loading: false, matchdayId, started, deadlineAt, fixtures, squad, gwPoints, table, duel: duelRes?.data ?? null });
    } catch (err) {
      console.error('useLeagueMatchweek', err);
      setState(s => ({ ...s, key, loading: false }));
    }
  }, [key, leagueId, tournamentId, userId, h2hEnabled]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  // Live stats arrive in bursts; one refetch per burst.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const current = state.key === key ? state : null;
  const liveIdList = useMemo(
    () => (current?.fixtures ?? []).filter(f => f.status === 'live').map(f => f.id).sort().join(','),
    [current?.fixtures],
  );
  useEffect(() => {
    if (!liveIdList) return undefined;
    let timer = null;
    const bump = () => { clearTimeout(timer); timer = setTimeout(() => loadRef.current(), DEBOUNCE_MS); };
    const ch = supabase
      .channel(uniqueChannelName(`matchweek-stats-${liveIdList}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'player_match_stats', filter: `fixture_id=in.(${liveIdList})` }, bump)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'fixtures', filter: `id=in.(${liveIdList})` }, bump)
      .subscribe();
    return () => { clearTimeout(timer); supabase.removeChannel(ch); };
  }, [liveIdList]);

  return {
    ...(current ?? { loading: true, matchdayId: null, started: false, deadlineAt: null, fixtures: [], squad: null, gwPoints: null, table: null, duel: null }),
    refresh: load,
  };
}
