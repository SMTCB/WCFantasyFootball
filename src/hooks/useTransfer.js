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
    const { data, error } = await supabase.functions.invoke('process-transfer', {
      body: {
        action:       'buy',
        player_id:    player.id,
        player_price: player.price,
        league_id:    leagueId,
        user_id:      user?.id,   // demo-mode fallback when no JWT session
      },
    });

    if (error || !data?.ok) {
      // Supabase SDK puts non-2xx response body in error.context (a Response object)
      let msg  = data?.error;
      let code = data?.code ?? '';
      if (!msg && error?.context) {
        try {
          let body;
          if (typeof error.context?.json === 'function') {
            // error.context is a Response object — read it async
            body = await error.context.json();
          } else if (typeof error.context === 'string') {
            body = JSON.parse(error.context);
          } else {
            body = error.context;
          }
          msg  = body?.error;
          code = body?.code ?? code;
        } catch { /* ignore parse errors */ }
      }
      msg = msg ?? error?.message ?? 'Transfer failed';
      return { ok: false, error: msg, code };
    }

    // Optimistic update: mark this player as owned by current manager
    setTakenMap(prev => ({
      ...prev,
      [player.id]: { userId: user?.id, managerName: 'You' },
    }));

    return { ok: true, players: data.players, budget_remaining: data.budget_remaining };
  }, [leagueId, user]);

  const sell = useCallback(async (player) => {
    const { data, error } = await supabase.functions.invoke('process-transfer', {
      body: {
        action:       'sell',
        player_id:    player.id,
        player_price: player.price,
        league_id:    leagueId,
        user_id:      user?.id,   // demo-mode fallback when no JWT session
      },
    });

    if (error || !data?.ok) {
      let msg = data?.error;
      if (!msg && error?.context) {
        try {
          const body = typeof error.context === 'string' ? JSON.parse(error.context) : error.context;
          msg = body?.error;
        } catch { /* ignore */ }
      }
      msg = msg ?? error?.message ?? 'Transfer failed';
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
  const isOwnedBy  = useCallback((playerId) => takenMap[playerId]?.userId === user?.id, [takenMap, user]);

  return { takenMap, takenMapLoading, takenMapError, buy, sell, isTaken, takenBy, isOwnedBy, reload: loadTakenMap };
}
