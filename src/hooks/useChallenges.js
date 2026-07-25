import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useChallenges(userId, circleId = null) {
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchChallenges = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase.rpc('get_my_challenges', {
      p_circle_id: circleId ?? null,
    });
    if (err) setError(err.message);
    else setChallenges(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [userId, circleId]);

  useEffect(() => { fetchChallenges(); }, [fetchChallenges]);

  // Realtime: re-fetch when any challenge the user is part of changes
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`p2p_challenges:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'p2p_challenges',
      }, fetchChallenges)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, fetchChallenges]);

  const incoming = challenges.filter(
    c => c.opponent_id === userId && c.status === 'pending',
  );
  const outgoing = challenges.filter(
    c => c.challenger_id === userId && c.status === 'pending',
  );
  const active = challenges.filter(c => c.status === 'accepted');
  const history = challenges.filter(
    c => ['resolved', 'expired', 'declined', 'cancelled'].includes(c.status),
  );

  async function createChallenge({ circleId: cid, betType, opponentId, leagueId, matchdayId, stakeCoins, message }) {
    const { data, error: err } = await supabase.rpc('create_p2p_challenge', {
      p_circle_id:   cid,
      p_opponent_id: opponentId,
      p_bet_type:    betType,
      p_stake_coins: stakeCoins,
      p_message:     message ?? null,
      p_league_id:   leagueId ?? null,
      p_matchday_id: matchdayId ?? null,
    });
    if (err) throw new Error(err.message);
    await fetchChallenges();
    return data;
  }

  async function acceptChallenge(challengeId) {
    const { error: err } = await supabase.rpc('accept_p2p_challenge', { p_challenge_id: challengeId });
    if (err) throw new Error(err.message);
    await fetchChallenges();
  }

  async function declineChallenge(challengeId) {
    const { error: err } = await supabase.rpc('decline_p2p_challenge', { p_challenge_id: challengeId });
    if (err) throw new Error(err.message);
    await fetchChallenges();
  }

  async function cancelChallenge(challengeId) {
    const { error: err } = await supabase.rpc('cancel_p2p_challenge', { p_challenge_id: challengeId });
    if (err) throw new Error(err.message);
    await fetchChallenges();
  }

  return {
    challenges,
    incoming,
    outgoing,
    active,
    history,
    loading,
    error,
    refetch: fetchChallenges,
    createChallenge,
    acceptChallenge,
    declineChallenge,
    cancelChallenge,
  };
}
