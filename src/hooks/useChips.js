/**
 * useChips — chip state + actions for the Squad "Chips" tab.
 *
 * chips_used / daily_jokers have RLS on with no policies, so everything goes through the
 * SECURITY DEFINER RPCs in migration 304 (get_my_chips, activate_chip, set_joker, clear_joker).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useChips(leagueId, userId) {
  const [state,   setState]   = useState(null);   // { round, disabled, chips } | null
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [busy,    setBusy]    = useState(null);   // chip id currently being changed

  const refresh = useCallback(async () => {
    if (!leagueId) return;
    const { data, error: err } = await supabase.rpc('get_my_chips', { p_league_id: leagueId });
    if (err || data?.ok === false) {
      setError(err?.message ?? data?.error ?? 'Could not load chips');
      setState(null);
    } else {
      setError(null);
      setState(data);
    }
    setLoading(false);
  }, [leagueId]);

  useEffect(() => { setLoading(true); refresh(); }, [refresh]);

  // Wrap an RPC call: returns { ok, error } and always re-syncs from the server.
  const run = useCallback(async (chipId, call) => {
    setBusy(chipId);
    try {
      const { data, error: err } = await call();
      const ok = !err && data?.ok !== false;
      await refresh();
      return { ok, error: err?.message ?? (ok ? null : data?.error ?? 'Something went wrong') };
    } finally {
      setBusy(null);
    }
  }, [refresh]);

  const toggleChip = useCallback((chipId) => run(chipId, () =>
    supabase.rpc('activate_chip', { p_user_id: userId, p_league_id: leagueId, p_chip_type: chipId })
  ), [run, userId, leagueId]);

  const setJoker = useCallback((playerId) => run('joker', () =>
    supabase.rpc('set_joker', { p_league_id: leagueId, p_player_id: playerId })
  ), [run, leagueId]);

  const clearJoker = useCallback(() => run('joker', () =>
    supabase.rpc('clear_joker', { p_league_id: leagueId })
  ), [run, leagueId]);

  return { state, loading, error, busy, refresh, toggleChip, setJoker, clearJoker };
}
