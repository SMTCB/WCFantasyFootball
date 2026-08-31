import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useChallenges(userId, circleId = null) {
  const [challenges, setChallenges] = useState([]);
  const [openChallenges, setOpenChallenges] = useState([]);
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

  const fetchOpenChallenges = useCallback(async () => {
    if (!userId || !circleId) { setOpenChallenges([]); return; }
    const { data, error: err } = await supabase.rpc('get_open_challenges', {
      p_circle_id: circleId,
    });
    if (err) setError(err.message);
    else setOpenChallenges(Array.isArray(data) ? data : []);
  }, [userId, circleId]);

  useEffect(() => { fetchChallenges(); }, [fetchChallenges]);
  useEffect(() => { fetchOpenChallenges(); }, [fetchOpenChallenges]);

  // Realtime: re-fetch when any challenge the user is part of (or any open,
  // unclaimed challenge in this circle) changes
  useEffect(() => {
    if (!userId) return;
    const refetchAll = () => { fetchChallenges(); fetchOpenChallenges(); };
    const channel = supabase
      .channel(`p2p_challenges:${userId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'p2p_challenges',
      }, refetchAll)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, fetchChallenges, fetchOpenChallenges]);

  const incoming = challenges.filter(
    c => c.opponent_id === userId && c.status === 'pending',
  );
  const outgoing = challenges.filter(
    c => c.challenger_id === userId && c.status === 'pending',
  );
  const active = challenges.filter(c => c.status === 'accepted');
  const disputed = challenges.filter(c => c.status === 'disputed');
  const history = challenges.filter(
    c => ['resolved', 'expired', 'declined', 'cancelled'].includes(c.status),
  );

  async function createChallenge({ circleId: cid, betType, opponentId, leagueId, matchdayId, stakeCoins, message, question }) {
    const { data, error: err } = await supabase.rpc('create_p2p_challenge', {
      p_circle_id:   cid,
      p_opponent_id: opponentId,
      p_bet_type:    betType,
      p_stake_coins: stakeCoins,
      p_message:     message ?? null,
      p_league_id:   leagueId ?? null,
      p_matchday_id: matchdayId ?? null,
      p_question:    question ?? null,
    });
    if (err) throw new Error(err.message);
    await fetchChallenges();
    return data;
  }

  async function claimChallenge(challengeId) {
    const { error: err } = await supabase.rpc('claim_p2p_challenge', { p_challenge_id: challengeId });
    if (err) throw new Error(err.message);
    await Promise.all([fetchChallenges(), fetchOpenChallenges()]);
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

  // Freeform lifecycle: declare -> confirm/dispute -> (if disputed) owner arbitrates.
  // winnerId of null means "push" (declare/confirm) or "void" (arbitrate) — refunds both stakes.
  async function declareResult(challengeId, winnerId) {
    const { error: err } = await supabase.rpc('declare_freeform_result', {
      p_challenge_id: challengeId,
      p_winner_id:    winnerId ?? null,
    });
    if (err) throw new Error(err.message);
    await fetchChallenges();
  }

  async function confirmResult(challengeId) {
    const { error: err } = await supabase.rpc('confirm_freeform_result', { p_challenge_id: challengeId });
    if (err) throw new Error(err.message);
    await fetchChallenges();
  }

  async function disputeResult(challengeId) {
    const { error: err } = await supabase.rpc('dispute_freeform_result', { p_challenge_id: challengeId });
    if (err) throw new Error(err.message);
    await fetchChallenges();
  }

  async function arbitrateResult(challengeId, winnerId) {
    const { error: err } = await supabase.rpc('arbitrate_freeform_result', {
      p_challenge_id: challengeId,
      p_winner_id:    winnerId ?? null,
    });
    if (err) throw new Error(err.message);
    await fetchChallenges();
  }

  return {
    challenges,
    openChallenges,
    incoming,
    outgoing,
    active,
    disputed,
    history,
    loading,
    error,
    refetch: fetchChallenges,
    createChallenge,
    acceptChallenge,
    declineChallenge,
    cancelChallenge,
    claimChallenge,
    declareResult,
    confirmResult,
    disputeResult,
    arbitrateResult,
  };
}
