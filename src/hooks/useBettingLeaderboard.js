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
      // All bet types shown in YOUR PERFORMANCE, grouped by category
      const BUCKETS = [
        // MATCH
        { slug: 'match_result',      label: 'MATCH RESULT',      category: 'match'   },
        { slug: 'first_team_score',  label: 'FIRST SCORER',      category: 'match'   },
        { slug: 'clean_sheet',       label: 'CLEAN SHEET',       category: 'match'   },
        { slug: 'lead_at_halftime',  label: 'HALFTIME LEAD',     category: 'match'   },
        { slug: 'second_half_winner',label: '2ND HALF WINNER',   category: 'match'   },
        { slug: 'winning_margin',    label: 'WINNING MARGIN',    category: 'match'   },
        { slug: 'most_corners_team', label: 'MOST CORNERS',      category: 'match'   },
        { slug: 'penalty_in_match',  label: 'PENALTY',           category: 'match'   },
        { slug: 'red_card_in_match', label: 'RED CARD',          category: 'match'   },
        { slug: 'btts',              label: 'BTTS',              category: 'match'   },
        { slug: 'btts_first_half',   label: 'BTTS — 1ST HALF',  category: 'match'   },
        { slug: 'comeback_win',      label: 'COMEBACK WIN',      category: 'match'   },
        // STATS
        { slug: 'goals_ou',          label: 'GOALS O/U',         category: 'stats'   },
        { slug: 'first_half_goals_ou',label: '1ST HALF GOALS O/U',category: 'stats' },
        { slug: 'shots_on_target_ou',label: 'SHOTS ON TARGET O/U',category: 'stats' },
        { slug: 'total_corners_ou',  label: 'TOTAL CORNERS O/U', category: 'stats'   },
        { slug: 'card_count_ou',     label: 'CARD COUNT O/U',    category: 'stats'   },
        { slug: 'total_offsides_ou', label: 'OFFSIDES O/U',      category: 'stats'   },
        { slug: 'total_subs_ou',     label: 'SUBS O/U',          category: 'stats'   },
        { slug: 'goal_interval',     label: 'GOAL INTERVAL',     category: 'stats'   },
        // PLAYERS
        { slug: 'top_scorer',        label: 'TOP SCORER',        category: 'players' },
        { slug: 'anytime_goalscorer',label: 'ANYTIME SCORER',    category: 'players' },
        { slug: 'yellow_card',       label: 'YELLOW CARD',       category: 'players' },
        { slug: 'man_of_match',      label: 'MAN OF MATCH',      category: 'players' },
        // CUSTOM
        { slug: 'free_bet',          label: 'FREE BET',          category: 'custom'  },
        { slug: 'player_block',      label: 'PLAYER BLOCK',      category: 'custom'  },
      ];

      // !inner ensures only rows with a matching bet_instance are returned
      // Join through bet_templates to get the slug for bucketing
      const { data: entries, error: err } = await supabase
        .from('bet_submissions')
        .select(`
          user_id,
          squad_id,
          squads!squad_id(users!user_id(username)),
          bet_instances!inner!bet_instance_id(league_id, bet_templates!template_id(slug)),
          is_correct,
          reward_awarded
        `)
        .eq('bet_instances.league_id', leagueId)
        .not('is_correct', 'is', null);

      if (err) throw err;

      // Cache instance IDs so Realtime subscription can be scoped (L2.7)
      instanceIdsRef.current = [...new Set((entries ?? []).map(e => e.bet_instance_id).filter(Boolean))];

      // Aggregate by user + bucket by template slug for the current user
      const userStats   = {};
      const bucketStats = Object.fromEntries(BUCKETS.map(b => [b.slug, { ...b, correct: 0, wrong: 0 }]));

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

        // Per-bucket breakdown for the current user
        if (currentUserId && entry.user_id === currentUserId) {
          const slug = entry.bet_instances?.bet_templates?.slug;
          if (slug && bucketStats[slug]) {
            if (entry.is_correct) bucketStats[slug].correct += 1;
            else bucketStats[slug].wrong += 1;
          }
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
      // Keep bucket order fixed; always return all 3 even if 0 bets
      setMyBetsByType(BUCKETS.map(b => bucketStats[b.slug]));
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
