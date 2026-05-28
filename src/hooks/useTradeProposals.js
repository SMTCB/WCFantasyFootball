import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export function useTradeProposals(leagueId, mySquadId) {
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const channelRef = useRef(null);

  const load = useCallback(async () => {
    if (!leagueId || !mySquadId) return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('trade_proposals')
      .select(`
        id, league_id, status, cash_sweetener, points_sweetener,
        created_at, expires_at, resolved_at,
        proposer_squad_id, target_squad_id,
        proposer_player_id, target_player_id,
        proposer_player:players!trade_proposals_proposer_player_id_fkey(id, name, position),
        target_player:players!trade_proposals_target_player_id_fkey(id, name, position)
      `)
      .eq('league_id', leagueId)
      .in('status', ['pending'])
      .order('created_at', { ascending: false });

    if (err) { setError(err.message); setLoading(false); return; }

    setIncoming((data || []).filter(p => p.target_squad_id  === mySquadId));
    setOutgoing((data || []).filter(p => p.proposer_squad_id === mySquadId));
    setLoading(false);
  }, [leagueId, mySquadId]);

  // Subscribe to any INSERT or UPDATE on trade_proposals for this league
  useEffect(() => {
    if (!leagueId) return;

    channelRef.current = supabase
      .channel(`trade-proposals-${leagueId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'trade_proposals',
        filter: `league_id=eq.${leagueId}`,
      }, () => load())
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [leagueId, load]);

  useEffect(() => { load(); }, [load]);

  const submitProposal = useCallback(async ({
    targetSquadId, myPlayerId, theirPlayerId, cashSweetener, pointsSweetener,
  }) => {
    const { data, error: err } = await supabase.rpc('submit_trade_proposal', {
      p_league_id:          leagueId,
      p_proposer_squad_id:  mySquadId,
      p_target_squad_id:    targetSquadId,
      p_proposer_player_id: myPlayerId,
      p_target_player_id:   theirPlayerId,
      p_cash_sweetener:     cashSweetener,
      p_points_sweetener:   pointsSweetener,
    });
    if (err) throw new Error(err.message);
    if (data && !data.ok) throw new Error(data.error);
    await load();
  }, [leagueId, mySquadId, load]);

  const acceptProposal = useCallback(async (proposalId) => {
    const { data, error: err } = await supabase.rpc('accept_trade_proposal', {
      p_proposal_id: proposalId,
    });
    if (err) throw new Error(err.message);
    if (data && !data.ok) throw new Error(data.error);
    await load();
  }, [load]);

  const rejectProposal = useCallback(async (proposalId) => {
    const { data, error: err } = await supabase.rpc('reject_trade_proposal', {
      p_proposal_id: proposalId,
    });
    if (err) throw new Error(err.message);
    if (data && !data.ok) throw new Error(data.error);
    await load();
  }, [load]);

  const cancelProposal = useCallback(async (proposalId) => {
    const { data, error: err } = await supabase.rpc('cancel_trade_proposal', {
      p_proposal_id: proposalId,
    });
    if (err) throw new Error(err.message);
    if (data && !data.ok) throw new Error(data.error);
    await load();
  }, [load]);

  return {
    incoming, outgoing, loading, error,
    submitProposal, acceptProposal, rejectProposal, cancelProposal,
    reload: load,
  };
}
