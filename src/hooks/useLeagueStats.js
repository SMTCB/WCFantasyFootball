import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Fetches league-wide statistics: top scorers and team metrics.
 * Subscribes to league_members updates for realtime changes.
 */
export function useLeagueStats(leagueId) {
  const [topScorers, setTopScorers] = useState([]);
  const [teamMetrics, setTeamMetrics] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch top 10 scorers
      const { data: scorers, error: scorersErr } = await supabase
        .from('league_members')
        .select('user_id, rank, total_points, users(username)')
        .eq('league_id', leagueId)
        .order('total_points', { ascending: false })
        .limit(10);

      if (scorersErr) throw scorersErr;

      // Transform to flatten user data
      const transformedScorers = (scorers ?? []).map(s => ({
        user_id: s.user_id,
        rank: s.rank,
        total_points: s.total_points,
        username: s.users?.username || 'Unknown',
      }));

      setTopScorers(transformedScorers);

      // Fetch team metrics
      const { data: metrics, error: metricsErr } = await supabase
        .rpc('get_league_stats', { p_league_id: leagueId });

      if (metricsErr) {
        // Fallback to manual query if RPC doesn't exist
        const { data: members, error: membersErr } = await supabase
          .from('league_members')
          .select('total_points')
          .eq('league_id', leagueId);

        if (membersErr) throw membersErr;

        const memberCount = members?.length ?? 0;
        const avgPoints = memberCount > 0
          ? Math.round(members.reduce((sum, m) => sum + (m.total_points ?? 0), 0) / memberCount)
          : 0;

        setTeamMetrics({
          member_count: memberCount,
          avg_points: avgPoints,
        });
      } else {
        setTeamMetrics(metrics);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Subscribe to realtime changes on league_members
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

    return () => {
      subscription.unsubscribe();
    };
  }, [leagueId, fetchStats]);

  return { topScorers, teamMetrics, loading, error, refetch: fetchStats };
}
