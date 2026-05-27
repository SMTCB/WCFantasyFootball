import { useState, useEffect, useCallback } from 'react';
import { supabase, FUNCTIONS_BASE } from '../lib/supabase';
import { useAuth } from './useAuth';

async function invokeTransfer(body) {
  if (!FUNCTIONS_BASE) return { ok: false, error: 'Supabase not configured' };
  const { data: { session } } = await supabase.auth.getSession();
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
  return res.json();
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

      const map = {};
      for (const squad of squads) {
        const managerName = squad.user_id === user?.id
          ? 'You'
          : (usernameMap[squad.user_id] ?? 'Unknown');
        for (const pid of (squad.players ?? [])) {
          map[pid] = { userId: squad.user_id, managerName };
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
    setTakenMap(prev => ({
      ...prev,
      [player.id]: { userId: user?.id, managerName: 'You' },
    }));

    return { ok: true, players: data.players, budget_remaining: data.budget_remaining };
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

    // Optimistic update: remove player from takenMap
    setTakenMap(prev => {
      const next = { ...prev };
      delete next[player.id];
      return next;
    });

    return { ok: true, players: data.players, budget_remaining: data.budget_remaining };
  }, [leagueId]);

  const isTaken    = useCallback((playerId) => !!takenMap[playerId], [takenMap]);
  const takenBy    = useCallback((playerId) => takenMap[playerId]?.managerName ?? null, [takenMap]);
  const isOwnedBy  = useCallback((playerId) => takenMap[playerId]?.userId === user?.id, [takenMap, user]);

  return { takenMap, takenMapLoading, takenMapError, buy, sell, isTaken, takenBy, isOwnedBy, reload: loadTakenMap };
}
