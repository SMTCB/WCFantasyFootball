import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Fetches betting performance leaderboard for a league.
 * Aggregates correct bets, accuracy %, and total rewards per user.
 * Subscribes to bet_submissions updates for realtime changes.
 */
export function useBettingLeaderboard(leagueId, currentUserId) {
  const [leaderboard, setLeaderboard]       = useState([]);
  const [myBetsByType, setMyBetsByType]     = useState([]);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState(null);
  const instanceIdsRef = useRef([]);

  const fetchLeaderboard = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    setError(null);

    try {
      // !inner ensures only rows with a matching bet_instance are returned
      const { data: entries, error: err } = await supabase
        .from('bet_submissions')
        .select(`
          user_id,
          squad_id,
          squads!squad_id(users!user_id(username)),
          bet_instances!inner!bet_instance_id(league_id, title),
          is_correct,
          reward_awarded
        `)
        .eq('bet_instances.league_id', leagueId)
        .not('is_correct', 'is', null);

      if (err) throw err;

      // Cache instance IDs so Realtime subscription can be scoped (L2.7)
      instanceIdsRef.current = [...new Set((entries ?? []).map(e => e.bet_instance_id).filter(Boolean))];

      // Aggregate by user
      const userStats = {};
      const typeStats = {};
      (entries ?? []).forEach(entry => {
        const userId = entry.user_id;
        if (!userStats[userId]) {
          userStats[userId] = {
            user_id: userId,
            username: entry.squads?.users?.username || 'Unknown',
            total_bets: 0,
            correct_bets: 0,
            total_rewards: 0,
          };
        }
        userStats[userId].total_bets += 1;
        if (entry.is_correct) userStats[userId].correct_bets += 1;
        userStats[userId].total_rewards += entry.reward_awarded ?? 0;

        // Per-type breakdown for the current user
        if (currentUserId && entry.user_id === currentUserId) {
          const title = entry.bet_instances?.title || 'Other';
          if (!typeStats[title]) typeStats[title] = { title, correct: 0, wrong: 0 };
          if (entry.is_correct) typeStats[title].correct += 1;
          else typeStats[title].wrong += 1;
        }
      });

      // Calculate accuracy % and sort by rewards
      const leaderboardData = Object.values(userStats)
        .map(stat => ({
          ...stat,
          accuracy_pct: stat.total_bets > 0
            ? Math.round((stat.correct_bets / stat.total_bets) * 100 * 10) / 10
            : 0,
        }))
        .sort((a, b) => b.total_rewards - a.total_rewards);

      setLeaderboard(leaderboardData);
      setMyBetsByType(Object.values(typeStats).sort((a, b) => (b.correct + b.wrong) - (a.correct + a.wrong)));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [leagueId, currentUserId]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Subscribe to realtime changes — scoped to known instance IDs for this league (L2.7)
  useEffect(() => {
    if (!leagueId) return;

    const ids = instanceIdsRef.current;
    // If no instances yet, fall back to unfiltered channel (will refetch anyway)
    const filter = ids.length
      ? `bet_instance_id=in.(${ids.join(',')})`
      : undefined;

    const channelName = `betting_leaderboard:${leagueId}`;
    const channel = supabase.channel(channelName);

    channel.on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'bet_submissions',
        ...(filter ? { filter } : {}),
      },
      () => { fetchLeaderboard(); }
    ).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [leagueId, fetchLeaderboard]);

  return { leaderboard, myBetsByType, loading, error, refetch: fetchLeaderboard };
}
