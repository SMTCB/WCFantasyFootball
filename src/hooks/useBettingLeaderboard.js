import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Fetches betting performance leaderboard for a league.
 * Aggregates correct bets, accuracy %, and total rewards per user.
 * Subscribes to bet_submissions updates for realtime changes.
 */
export function useBettingLeaderboard(leagueId) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLeaderboard = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch betting performance aggregates
      const { data: entries, error: err } = await supabase
        .from('bet_submissions')
        .select(`
          user_id,
          squad_id,
          squads!squad_id(users!user_id(username)),
          bet_instances!bet_instance_id(league_id),
          is_correct,
          reward_awarded
        `)
        .filter('bet_instances.league_id', 'eq', leagueId)
        .not('is_correct', 'is', null);

      if (err) throw err;

      // Aggregate by user
      const userStats = {};
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
        if (entry.is_correct) {
          userStats[userId].correct_bets += 1;
        }
        userStats[userId].total_rewards += entry.reward_awarded ?? 0;
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  // Subscribe to realtime changes on bet_submissions
  useEffect(() => {
    if (!leagueId) return;

    const subscription = supabase
      .channel(`betting_leaderboard:league_id=${leagueId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bet_submissions' },
        () => { fetchLeaderboard(); }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [leagueId, fetchLeaderboard]);

  return { leaderboard, loading, error, refetch: fetchLeaderboard };
}
