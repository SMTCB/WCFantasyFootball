import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useLeagueStats(leagueId) {
  const [topScorers,     setTopScorers]     = useState([]);
  const [teamMetrics,    setTeamMetrics]     = useState(null);
  const [matchdayPoints, setMatchdayPoints]  = useState([]);
  const [positionPoints, setPositionPoints]  = useState([]);
  const [loading,        setLoading]         = useState(false);
  const [error,          setError]           = useState(null);

  const fetchStats = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    setError(null);

    try {
      // ── 1. Top scorers from league_members ──────────────────────────────
      const { data: scorers, error: scorersErr } = await supabase
        .from('league_members')
        .select('user_id, rank, total_points, users(username)')
        .eq('league_id', leagueId)
        .order('total_points', { ascending: false })
        .limit(10);
      if (scorersErr) throw scorersErr;

      const transformedScorers = (scorers ?? []).map(s => ({
        user_id:      s.user_id,
        rank:         s.rank,
        total_points: s.total_points,
        username:     s.users?.username || 'Unknown',
      }));
      setTopScorers(transformedScorers);

      // ── 2. Team metrics (RPC with manual fallback) ───────────────────────
      const { data: metrics, error: metricsErr } = await supabase
        .rpc('get_league_stats', { p_league_id: leagueId });

      if (metricsErr) {
        const { data: members, error: membersErr } = await supabase
          .from('league_members')
          .select('total_points')
          .eq('league_id', leagueId);
        if (membersErr) throw membersErr;
        const memberCount = members?.length ?? 0;
        setTeamMetrics({
          member_count: memberCount,
          avg_points: memberCount > 0
            ? Math.round(members.reduce((s, m) => s + (m.total_points ?? 0), 0) / memberCount)
            : 0,
        });
      } else {
        setTeamMetrics(metrics);
      }

      // ── 3. Squads for this league (one per user, latest) ─────────────────
      const { data: leagueSquads } = await supabase
        .from('squads')
        .select('id, user_id, starting_xi, players, users(username)')
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false });

      const seenUsers   = new Set();
      const uniqueSquads = [];
      for (const s of (leagueSquads || [])) {
        if (!seenUsers.has(s.user_id)) {
          seenUsers.add(s.user_id);
          uniqueSquads.push({ ...s, username: s.users?.username || 'Unknown' });
        }
      }
      const squadIds       = uniqueSquads.map(s => s.id);
      const squadIdToMeta  = Object.fromEntries(
        uniqueSquads.map(s => [s.id, { user_id: s.user_id, username: s.username }])
      );

      if (squadIds.length === 0) {
        setMatchdayPoints([]);
        setPositionPoints([]);
        return;
      }

      // ── 4. Per-matchday points for the progression chart ─────────────────
      const { data: gwPts } = await supabase
        .from('fantasy_points')
        .select('squad_id, matchday_id, total')
        .in('squad_id', squadIds);

      setMatchdayPoints(
        (gwPts || [])
          .map(fp => ({
            squad_id:    fp.squad_id,
            matchday_id: fp.matchday_id,
            total:       fp.total,
            user_id:     squadIdToMeta[fp.squad_id]?.user_id,
            username:    squadIdToMeta[fp.squad_id]?.username,
          }))
          .filter(fp => fp.user_id)
      );

      // ── 5. Position breakdown ─────────────────────────────────────────────
      const allPlayerFpIds = [
        ...new Set(
          uniqueSquads.flatMap(s =>
            s.starting_xi?.length ? s.starting_xi : (s.players || []).slice(0, 11)
          )
        ),
      ];
      const allForzaIds = [
        ...new Set(allPlayerFpIds.map(id => id.split('-')[1]).filter(Boolean)),
      ];

      if (allForzaIds.length > 0) {
        const [{ data: playerPositions }, { data: playerStats }] = await Promise.all([
          supabase
            .from('players')
            .select('forza_player_id, position')
            .in('forza_player_id', allForzaIds),
          supabase
            .from('player_match_stats')
            .select('player_id, fantasy_points')
            .in('player_id', allPlayerFpIds),
        ]);

        const posMap = Object.fromEntries(
          (playerPositions || []).map(p => [p.forza_player_id, p.position])
        );
        const statsByPlayer = {};
        for (const s of (playerStats || [])) {
          statsByPlayer[s.player_id] =
            (statsByPlayer[s.player_id] || 0) + Math.round(Number(s.fantasy_points) || 0);
        }

        setPositionPoints(
          uniqueSquads.map(squad => {
            const xi = squad.starting_xi?.length
              ? squad.starting_xi
              : (squad.players || []).slice(0, 11);
            const pos = {};
            for (const fpId of xi) {
              const forzaId  = fpId.split('-')[1];
              const position = posMap[forzaId];
              if (position) pos[position] = (pos[position] || 0) + (statsByPlayer[fpId] || 0);
            }
            return { user_id: squad.user_id, username: squad.username, ...pos };
          })
        );
      } else {
        setPositionPoints([]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  useEffect(() => {
    if (!leagueId) return;
    const subscription = supabase
      .channel(`league_stats:league_id=eq.${leagueId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` },
        () => { fetchStats(); }
      )
      .subscribe();
    return () => { subscription.unsubscribe(); };
  }, [leagueId, fetchStats]);

  return { topScorers, teamMetrics, matchdayPoints, positionPoints, loading, error, refetch: fetchStats };
}
