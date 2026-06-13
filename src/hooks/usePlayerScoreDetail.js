import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Expandable per-player scoring history — shared between MarketScreen and
 * SquadScreen. Tracks which player's panel is open and lazily fetches/caches
 * their last-5-GW breakdown + season summary from player_match_stats.
 */
export function usePlayerScoreDetail() {
  const [expandedPlayerId, setExpandedPlayerId] = useState(null);
  const [playerDetails,    setPlayerDetails]    = useState({});
  const loadedRef = useRef(new Set());

  const togglePanel = useCallback(async (playerId) => {
    setExpandedPlayerId(prev => prev === playerId ? null : playerId);
    if (loadedRef.current.has(playerId)) return;
    loadedRef.current.add(playerId);

    try {
      const { data: stats } = await supabase
        .from('player_match_stats')
        .select('fantasy_points, fixture_id, goals, assists, clean_sheet, minutes_played')
        .eq('player_id', playerId)
        .limit(200);

      if (!stats?.length) {
        setPlayerDetails(prev => ({ ...prev, [playerId]: { rounds: [], season: { apps: 0, goals: 0, assists: 0, pts: 0, avgPts: '0.0' } } }));
        return;
      }

      const fixtureIds = [...new Set(stats.map(s => s.fixture_id))];
      const { data: fixtures } = await supabase
        .from('fixtures')
        .select('id, matchday_id, home_team, away_team, kickoff_at')
        .in('id', fixtureIds)
        .eq('status', 'finished')
        .order('kickoff_at', { ascending: false });

      const fixtureMap = {};
      (fixtures ?? []).forEach(f => { fixtureMap[f.id] = f; });

      // Aggregate per matchday (single fixture per player per round in practice)
      const byMD = {};
      for (const s of stats) {
        const f = fixtureMap[s.fixture_id];
        if (!f) continue;
        const md = f.matchday_id;
        if (!byMD[md]) {
          const home = (f.home_team ?? '?').substring(0, 3).toUpperCase();
          const away = (f.away_team ?? '?').substring(0, 3).toUpperCase();
          byMD[md] = { kickoff: f.kickoff_at, fixture: `${home} vs ${away}`, goals: 0, assists: 0, cs: false, mins: 0, pts: 0 };
        }
        byMD[md].goals   += s.goals          ?? 0;
        byMD[md].assists += s.assists         ?? 0;
        byMD[md].cs       = byMD[md].cs || !!(s.clean_sheet);
        byMD[md].mins    += s.minutes_played  ?? 0;
        byMD[md].pts     += Number(s.fantasy_points ?? 0);
      }

      const sorted = Object.entries(byMD)
        .sort((a, b) => b[1].kickoff.localeCompare(a[1].kickoff));

      const rounds = sorted.slice(0, 5).map(([md, r]) => ({
        gw:      md.includes('-r') ? `R${md.split('-r')[1]}` : md,
        fixture: r.fixture,
        goals:   r.goals,
        assists: r.assists,
        cs:      r.cs,
        mins:    r.mins,
        pts:     r.pts,
      }));

      const allRounds  = sorted.map(([, r]) => r);
      // Sum each GW's rounded score (matching the per-round display) so the
      // average is consistent with what the user sees round-by-round.
      const totalPts   = allRounds.reduce((s, r) => s + Math.round(r.pts), 0);
      const totalGoals = allRounds.reduce((s, r) => s + r.goals, 0);
      const totalAst   = allRounds.reduce((s, r) => s + r.assists, 0);
      const apps       = allRounds.filter(r => r.mins > 0).length;

      setPlayerDetails(prev => ({
        ...prev,
        [playerId]: {
          rounds,
          season: { apps, goals: totalGoals, assists: totalAst, pts: totalPts, avgPts: apps > 0 ? (totalPts / apps).toFixed(1) : '0.0' },
        },
      }));
    } catch (err) {
      console.error('PlayerStatsPanel load failed', err);
      setPlayerDetails(prev => ({ ...prev, [playerId]: { rounds: [], season: null } }));
    }
  }, []);

  return { expandedPlayerId, playerDetails, togglePanel };
}
