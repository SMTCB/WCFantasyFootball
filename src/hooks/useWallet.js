import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useWallet(userId) {
  const [wallet, setWallet] = useState(null); // { balance, escrow, transactions }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchWallet = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);
    const { data, error: err } = await supabase.rpc('get_my_wallet');
    if (err) {
      setError(err.message);
    } else {
      setWallet(data);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchWallet(); }, [fetchWallet]);

  // Realtime: re-fetch on any wallet change for this user
  useEffect(() => {
    if (!userId) return;
    const suffix = Math.random().toString(36).slice(2); // unique per mount: two components may use this hook at once
    const channel = supabase
      .channel(`wallet:${userId}:${suffix}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'coin_wallets',
        filter: `user_id=eq.${userId}`,
      }, fetchWallet)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [userId, fetchWallet]);

  return { wallet, loading, error, refetch: fetchWallet };
}
