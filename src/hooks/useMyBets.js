import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Consolidated cross-clubhouse P2P Group Bets — every bet the user has joined,
// across every circle they belong to. Backed by get_my_p2p_bets() (migration 263).
export function useMyBets(userId) {
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchBets = useCallback(async () => {
    if (!userId) { setBets([]); setLoading(false); return; }
    setError(null);
    const { data, error: err } = await supabase.rpc('get_my_p2p_bets');
    if (err) { setError(err.message); setLoading(false); return; }
    setBets(data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    fetchBets();
  }, [fetchBets]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`my-bets-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_bets' }, fetchBets)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'p2p_bet_participants', filter: `user_id=eq.${userId}` }, fetchBets)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, fetchBets]);

  const circles = [...new Map(bets.map(b => [b.circle_id, { id: b.circle_id, name: b.circle_name }])).values()]
    .sort((a, b) => a.name.localeCompare(b.name));

  // get_my_p2p_bets() only returns bets the caller has already joined, so every row's
  // is_participant is TRUE — there's no "invited but not joined" bucket here (that
  // discovery flow stays on the per-clubhouse Group Bets tab, backed by get_clubhouse_bets).
  const myOpenJoined         = bets.filter(b => b.status === 'open');
  const closedAwaitingDeclare = bets.filter(b => b.status === 'closed' && b.creator_id === userId);
  const closedAwaitingResolution = bets.filter(b => b.status === 'closed' && b.creator_id !== userId);
  const disputed              = bets.filter(b => b.status === 'disputed');
  const history                = bets.filter(b => b.status === 'resolved' || b.status === 'cancelled');

  return {
    bets, circles, loading, error, refetch: fetchBets,
    myOpenJoined, closedAwaitingDeclare, closedAwaitingResolution, disputed, history,
  };
}
