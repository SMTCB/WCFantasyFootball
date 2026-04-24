import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Manages transfer state for a specific league.
 * Provides takenMap (player_id → { userId, managerName }) and buy/sell actions.
 */
export function useTransfer(leagueId) {
  const { user } = useAuth();
  const [takenMap,        setTakenMap]        = useState({});
  const [takenMapLoading, setTakenMapLoading] = useState(false);

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
    } finally {
      setTakenMapLoading(false);
    }
  }, [leagueId, user?.id]);

  useEffect(() => { loadTakenMap(); }, [loadTakenMap]);

  const buy = useCallback(async (player) => {
    const { data, error } = await supabase.functions.invoke('process-transfer', {
      body: {
        action:       'buy',
        player_id:    player.id,
        player_price: player.price,
        league_id:    leagueId,
      },
    });

    if (error || !data?.ok) {
      const msg  = data?.error ?? error?.message ?? 'Transfer failed';
      const code = data?.code  ?? '';
      return { ok: false, error: msg, code };
    }

    // Optimistic update: mark this player as owned by current manager
    setTakenMap(prev => ({
      ...prev,
      [player.id]: { userId: user?.id, managerName: 'You' },
    }));

    return { ok: true, players: data.players, budget_remaining: data.budget_remaining };
  }, [leagueId, user?.id]);

  const sell = useCallback(async (player) => {
    const { data, error } = await supabase.functions.invoke('process-transfer', {
      body: {
        action:       'sell',
        player_id:    player.id,
        player_price: player.price,
        league_id:    leagueId,
      },
    });

    if (error || !data?.ok) {
      const msg = data?.error ?? error?.message ?? 'Transfer failed';
      return { ok: false, error: msg };
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
  const isOwnedBy  = useCallback((playerId) => takenMap[playerId]?.userId === user?.id, [takenMap, user?.id]);

  return { takenMap, takenMapLoading, buy, sell, isTaken, takenBy, isOwnedBy, reload: loadTakenMap };
}
