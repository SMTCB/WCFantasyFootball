import { useState, useEffect, useCallback } from 'react';
import { supabase, FUNCTIONS_BASE } from '../lib/supabase';
import { useAuth } from './useAuth';

async function invokeTransfer(body) {
  if (!FUNCTIONS_BASE) return { ok: false, error: 'Supabase not configured' };
  let session = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data?.session ?? null;
  } catch { /* network/token-store failure — fall through to anon key */ }
  const token = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const res = await fetch(`${FUNCTIONS_BASE}/process-transfer`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = 'Transfer failed';
    try { const b = await res.json(); msg = b?.error ?? msg; } catch { /* ignore */ }
    return { ok: false, error: msg };
  }
  try {
    const payload = await res.json();
    return payload ?? { ok: false, error: 'Empty response from server' };
  } catch {
    return { ok: false, error: 'Invalid response from server' };
  }
}

/**
 * Manages transfer state for a specific league.
 * Provides takenMap (player_id → { userId, managerName }) and buy/sell actions.
 */
export function useTransfer(leagueId) {
  const { user } = useAuth();
  const [takenMap,        setTakenMap]        = useState({});
  const [takenMapLoading, setTakenMapLoading] = useState(false);
  const [takenMapError,   setTakenMapError]   = useState(null);

  // Build takenMap from all squads in this league
  const loadTakenMap = useCallback(async () => {
    if (!leagueId) return;
    setTakenMapLoading(true);
    try {
      // Fetch all squads in the league with their players
      const { data: squads } = await supabase
        .from('squads')
        .select('user_id, players')
        .eq('league_id', leagueId);

      if (!squads?.length) { setTakenMap({}); return; }

      // Collect all user_ids to resolve usernames
      const userIds = [...new Set(squads.map(s => s.user_id))];
      const { data: profiles } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);

      const usernameMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p.username]));

      // Relaxation tiers allow the same player to be owned by multiple managers
      // at once, so each player_id maps to an array of owners (not a single one).
      const map = {};
      for (const squad of squads) {
        const managerName = squad.user_id === user?.id
          ? 'You'
          : (usernameMap[squad.user_id] ?? 'Unknown');
        for (const pid of (squad.players ?? [])) {
          if (!map[pid]) map[pid] = [];
          if (!map[pid].some(o => o.userId === squad.user_id)) {
            map[pid].push({ userId: squad.user_id, managerName });
          }
        }
      }
      setTakenMap(map);
    } catch (err) {
      console.error('useTransfer: loadTakenMap failed', err);
      setTakenMapError('Could not load squad data — some players may appear available.');
    } finally {
      setTakenMapLoading(false);
    }
  }, [leagueId, user]);

  useEffect(() => { loadTakenMap(); }, [loadTakenMap]);

  const buy = useCallback(async (player) => {
    const data = await invokeTransfer({
      action:       'buy',
      player_id:    player.id,
      player_price: player.price,
      league_id:    leagueId,
    });

    if (!data?.ok) {
      return { ok: false, error: data?.error ?? 'Transfer failed', code: data?.code ?? '' };
    }

    // Optimistic update: mark this player as owned by current manager
    // (additive — other existing owners under relaxation are preserved)
    setTakenMap(prev => {
      const existing = prev[player.id] ?? [];
      if (existing.some(o => o.userId === user?.id)) return prev;
      return { ...prev, [player.id]: [...existing, { userId: user?.id, managerName: 'You' }] };
    });

    return {
      ok:                  true,
      players:             data.players,
      budget_remaining:    data.budget_remaining,
      penalty_buy:         data.penalty_buy         ?? false,
      free_transfers_used: data.free_transfers_used ?? null,
      penalty_count:       data.penalty_count       ?? 0,
    };
  }, [leagueId, user]);

  const sell = useCallback(async (player) => {
    const data = await invokeTransfer({
      action:       'sell',
      player_id:    player.id,
      player_price: player.price,
      league_id:    leagueId,
    });

    if (!data?.ok) {
      return { ok: false, error: data?.error ?? 'Transfer failed' };
    }

    // Optimistic update: remove only the current manager from this player's owner list
    setTakenMap(prev => {
      const existing = prev[player.id] ?? [];
      const remaining = existing.filter(o => o.userId !== user?.id);
      const next = { ...prev };
      if (remaining.length) next[player.id] = remaining;
      else delete next[player.id];
      return next;
    });

    return { ok: true, players: data.players, budget_remaining: data.budget_remaining };
  }, [leagueId, user]);

  const isTaken     = useCallback((playerId) => !!takenMap[playerId]?.length, [takenMap]);
  const takenBy     = useCallback((playerId) => takenMap[playerId]?.[0]?.managerName ?? null, [takenMap]);
  const takenByAll  = useCallback((playerId) => takenMap[playerId] ?? [], [takenMap]);
  const isOwnedBy   = useCallback((playerId) => (takenMap[playerId] ?? []).some(o => o.userId === user?.id), [takenMap, user]);

  return { takenMap, takenMapLoading, takenMapError, buy, sell, isTaken, takenBy, takenByAll, isOwnedBy, reload: loadTakenMap };
}
