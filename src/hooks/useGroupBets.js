import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// circleId may be one clubhouse id or an array of them (the Bets screen reads every clubhouse).
export function useGroupBets(userId, circleId = null) {
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const circleKey = Array.isArray(circleId) ? circleId.join(',') : (circleId ?? '');
  const isList = Array.isArray(circleId);

  const fetchBets = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const ids = isList ? (circleKey ? circleKey.split(',') : []) : [circleKey || null];
    const results = await Promise.all(ids.map(id => supabase.rpc('get_clubhouse_bets', { p_circle_id: id })));
    const failed = results.find(r => r.error);
    if (failed && results.length === 1) setError(failed.error.message);
    else setBets(results.flatMap(r => (Array.isArray(r.data) ? r.data : [])));
    setLoading(false);
  }, [userId, circleKey, isList]);

  useEffect(() => { fetchBets(); }, [fetchBets]);

  // Realtime: re-fetch when any bet or participant row changes
  useEffect(() => {
    if (!userId) return;
    const suffix = Math.random().toString(36).slice(2); // unique per mount: two components may use this hook at once
    const channel = supabase
      .channel(`p2p_bets:${userId}:${suffix}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'p2p_bets',
      }, fetchBets)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'p2p_bet_participants',
      }, fetchBets)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, fetchBets]);

  const openInvited = bets.filter(
    b => b.status === 'open' && !b.is_participant,
  );
  const myOpenJoined = bets.filter(
    b => b.status === 'open' && b.is_participant,
  );
  const closedAwaitingDeclare = bets.filter(
    b => b.status === 'closed' && b.creator_id === userId,
  );
  const closedAwaitingResolution = bets.filter(
    b => b.status === 'closed' && b.creator_id !== userId,
  );
  const disputed = bets.filter(b => b.status === 'disputed');
  const history = bets.filter(
    b => b.status === 'resolved' || b.status === 'cancelled',
  );

  async function createBet({
    circleId: cid, question, answerMode, allowMultipleAnswers, targetMode,
    targetUserIds, options, stakeCoins, startsAt, endsAt,
  }) {
    const { data, error: err } = await supabase.rpc('create_p2p_bet', {
      p_circle_id: cid,
      p_question: question,
      p_answer_mode: answerMode,
      p_allow_multiple_answers: allowMultipleAnswers,
      p_target_mode: targetMode,
      p_target_user_ids: targetUserIds ?? null,
      p_options: options ?? null,
      p_stake_coins: stakeCoins,
      p_starts_at: startsAt,
      p_ends_at: endsAt ?? null,
    });
    if (err) throw new Error(err.message);
    await fetchBets();
    return data;
  }

  async function joinBet(betId) {
    const { error: err } = await supabase.rpc('join_p2p_bet', { p_bet_id: betId });
    if (err) throw new Error(err.message);
    await fetchBets();
  }

  async function declineBet(betId) {
    const { error: err } = await supabase.rpc('decline_p2p_bet', { p_bet_id: betId });
    if (err) throw new Error(err.message);
    await fetchBets();
  }

  async function submitAnswer(betId, { answerText = null, optionIds = null } = {}) {
    const { error: err } = await supabase.rpc('submit_bet_answer', {
      p_bet_id: betId,
      p_answer_text: answerText,
      p_option_ids: optionIds,
    });
    if (err) throw new Error(err.message);
    await fetchBets();
  }

  async function closeBet(betId) {
    const { error: err } = await supabase.rpc('close_p2p_bet', { p_bet_id: betId });
    if (err) throw new Error(err.message);
    await fetchBets();
  }

  async function cancelBet(betId) {
    const { error: err } = await supabase.rpc('cancel_p2p_bet', { p_bet_id: betId });
    if (err) throw new Error(err.message);
    await fetchBets();
  }

  async function declareOutcome(betId, { winningOptionIds = null, winningUserIds = null } = {}) {
    const { error: err } = await supabase.rpc('declare_bet_outcome', {
      p_bet_id: betId,
      p_winning_option_ids: winningOptionIds,
      p_winning_user_ids: winningUserIds,
    });
    if (err) throw new Error(err.message);
    await fetchBets();
  }

  async function disputeOutcome(betId) {
    const { error: err } = await supabase.rpc('dispute_bet_outcome', { p_bet_id: betId });
    if (err) throw new Error(err.message);
    await fetchBets();
  }

  async function arbitrateOutcome(betId, { winningOptionIds = null, winningUserIds = null } = {}) {
    const { error: err } = await supabase.rpc('arbitrate_bet_outcome', {
      p_bet_id: betId,
      p_winning_option_ids: winningOptionIds,
      p_winning_user_ids: winningUserIds,
    });
    if (err) throw new Error(err.message);
    await fetchBets();
  }

  // On-demand detail reads — get_clubhouse_bets doesn't return per-participant
  // answer data. A future get_bet_detail(p_bet_id) RPC could replace these direct
  // table reads; not implemented here (UI-only pass, RLS already scopes the rows).
  async function fetchParticipants(betId) {
    return supabase.from('p2p_bet_participants').select('*').eq('bet_id', betId);
  }

  async function fetchAnswers(betId) {
    return supabase.from('p2p_bet_participant_answers').select('*').eq('bet_id', betId);
  }

  return {
    bets,
    openInvited,
    myOpenJoined,
    closedAwaitingDeclare,
    closedAwaitingResolution,
    disputed,
    history,
    loading,
    error,
    refetch: fetchBets,
    createBet,
    joinBet,
    declineBet,
    submitAnswer,
    closeBet,
    cancelBet,
    declareOutcome,
    disputeOutcome,
    arbitrateOutcome,
    fetchParticipants,
    fetchAnswers,
  };
}
