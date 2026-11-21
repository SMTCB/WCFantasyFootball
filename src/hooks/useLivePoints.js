import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import {
  withGoals, uniqueChannelName, fetchActiveMatchdays, fetchLiveFixtures,
  fetchStatsFixtureIds, resolveRoundSquad, scoreSquad,
} from '../lib/livePoints';

const REFRESH_MS = 60 * 1000;

// Live football points for every league the user plays in, for Home (MD-3).
// Uses the same rules as the Live screen (lib/livePoints), so the numbers match.
//
// Returns {
//   loading,
//   liveFixtures: fixtures in progress in the user's tournaments (with homeGoals/awayGoals),
//   leagues: [{ leagueId, name, tournamentId, gwPoints, starters, liveCount, hasLive }],
//   nextDeadline: { at, tournamentId, leagueIds } | null  — the next picks deadline, when nothing is live
//   refresh,
// }
export function useLivePoints() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, liveFixtures: [], leagues: [], nextDeadline: null });

  const load = useCallback(async () => {
    if (!user?.id) { setState(s => ({ ...s, loading: false })); return; }
    try {
      const { data: rawMemberships = [] } = await supabase
        .from('league_members')
        .select('league_id, leagues(id, name, tournament_id, archived)')
        .eq('user_id', user.id);
      const memberships = (rawMemberships || []).filter(m => m.leagues && !m.leagues.archived);
      const tournamentIds = [...new Set(memberships.map(m => m.leagues.tournament_id).filter(Boolean))];
      if (!tournamentIds.length) { setState({ loading: false, liveFixtures: [], leagues: [], nextDeadline: null }); return; }

      const { activeMatchdayIds, matchdayIdByTournament } = await fetchActiveMatchdays(tournamentIds);
      const liveFixData = await fetchLiveFixtures({ activeMatchdayIds, tournamentIds });
      const liveFixtures = liveFixData.map(withGoals);

      // Nothing live: Home shows the next deadline instead of the live hero.
      if (!liveFixtures.length) {
        const { data: next } = await supabase
          .from('matchday_deadlines')
          .select('deadline_at, tournament_id')
          .in('tournament_id', tournamentIds)
          .gt('deadline_at', new Date().toISOString())
          .order('deadline_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        setState({
          loading: false, liveFixtures: [], leagues: [],
          nextDeadline: next ? {
            at: next.deadline_at,
            tournamentId: next.tournament_id,
            leagueIds: memberships.filter(m => m.leagues.tournament_id === next.tournament_id).map(m => m.league_id),
          } : null,
        });
        return;
      }

      const leagueIds = memberships.map(m => m.league_id);
      const [{ data: squadRows = [] }, statsFixIds] = await Promise.all([
        supabase
          .from('squads')
          .select('id, league_id, players, starting_xi, captain_id, is_triple_captain')
          .eq('user_id', user.id)
          .in('league_id', leagueIds),
        fetchStatsFixtureIds({ liveFixtures: liveFixData, activeMatchdayIds }),
      ]);

      const squadIds = (squadRows || []).map(s => s.id);
      const gwMatchdayIds = [...new Set(Object.values(matchdayIdByTournament))];
      const { data: fpRows = [] } = squadIds.length && gwMatchdayIds.length
        ? await supabase
            .from('fantasy_points')
            .select('squad_id, total, points_breakdown')
            .in('squad_id', squadIds)
            .in('matchday_id', gwMatchdayIds)
        : { data: [] };
      const fpBySquad = Object.fromEntries((fpRows || []).map(fp => [fp.squad_id, fp]));

      const resolved = (squadRows || []).map(s => ({ squad: s, ...resolveRoundSquad(s, fpBySquad[s.id]?.points_breakdown) }));
      const allPlayerIds = [...new Set(resolved.flatMap(r => r.squadPlayerIds))];
      const [{ data: playerRows = [] }, { data: statsData = [] }] = await Promise.all([
        allPlayerIds.length
          ? supabase.from('players').select('id, name, position, club').in('id', allPlayerIds)
          : Promise.resolve({ data: [] }),
        allPlayerIds.length && statsFixIds.length
          ? supabase.from('player_match_stats')
              .select('player_id, fixture_id, fantasy_points, minutes_played')
              .in('player_id', allPlayerIds)
              .in('fixture_id', statsFixIds)
          : Promise.resolve({ data: [] }),
      ]);

      const liveTournaments = new Set(liveFixtures.map(f => f.tournament_id));
      const liveFixtureIds = liveFixtures.map(f => f.id);
      const byLeague = Object.fromEntries(resolved.map(r => [r.squad.league_id, r]));
      const leagues = memberships.map(m => {
        const r = byLeague[m.league_id];
        const scored = r ? scoreSquad({ ...r, playerRows, statsData, liveFixtureIds }) : { starters: [] };
        const fp = r ? fpBySquad[r.squad.id] : null;
        return {
          leagueId: m.league_id,
          name: m.leagues.name,
          tournamentId: m.leagues.tournament_id,
          gwPoints: fp ? Number(fp.total ?? 0) : null,
          starters: scored.starters,
          liveCount: scored.starters.filter(p => p.live).length,
          hasLive: liveTournaments.has(m.leagues.tournament_id),
        };
      });

      setState({ loading: false, liveFixtures, leagues, nextDeadline: null });
    } catch (err) {
      console.error('useLivePoints', err);
      setState(s => ({ ...s, loading: false }));
    }
  }, [user?.id]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const liveIdList = useMemo(() => state.liveFixtures.map(f => f.id).sort().join(','), [state.liveFixtures]);

  useEffect(() => {
    if (!liveIdList) return;
    const ch = supabase
      .channel(uniqueChannelName(`home-live-stats-${liveIdList}`))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'player_match_stats',
        filter: `fixture_id=in.(${liveIdList})`,
      }, () => loadRef.current())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [liveIdList]);

  return { ...state, refresh: load };
}
