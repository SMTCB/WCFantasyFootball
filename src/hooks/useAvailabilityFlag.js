import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Manages player availability flags for a league.
 * Provides flagMap (player_id → flag details) and toggle/remove actions.
 */
export function useAvailabilityFlag(leagueId) {
  const { user } = useAuth();
  const [flagMap, setFlagMap] = useState({});
  const [flagMapLoading, setFlagMapLoading] = useState(false);

  // Load all active flags for this league
  const loadFlags = useCallback(async () => {
    if (!leagueId || !user?.id) return;
    setFlagMapLoading(true);
    try {
      const { data: flags } = await supabase
        .from('player_availability_flags')
        .select('id, squad_id, player_id, flagged_at, expires_at, created_by, squads!inner(user_id)')
        .eq('league_id', leagueId)
        .gt('expires_at', new Date().toISOString());

      if (!flags?.length) { setFlagMap({}); return; }

      const map = {};
      for (const flag of flags) {
        const isOwnFlag = flag.created_by === user.id;
        map[flag.player_id] = {
          flagId: flag.id,
          squadId: flag.squad_id,
          isOwnFlag,
          ownedBy: flag.squads?.user_id,
          flaggedAt: flag.flagged_at,
          expiresAt: flag.expires_at,
        };
      }
      setFlagMap(map);
    } catch (err) {
      console.error('useAvailabilityFlag: loadFlags failed', err);
    } finally {
      setFlagMapLoading(false);
    }
  }, [leagueId, user?.id]);

  useEffect(() => { loadFlags(); }, [loadFlags]);

  // Toggle flag for a player on user's squad
  const toggleFlag = useCallback(async (squadId, playerId) => {
    try {
      const existing = flagMap[playerId];

      if (existing?.isOwnFlag) {
        // Remove existing flag
        const { error } = await supabase
          .from('player_availability_flags')
          .delete()
          .eq('id', existing.flagId);

        if (error) {
          return { ok: false, error: error.message };
        }

        // Optimistic update
        setFlagMap(prev => {
          const updated = { ...prev };
          delete updated[playerId];
          return updated;
        });

        return { ok: true };
      } else {
        // Add new flag
        const { data, error } = await supabase
          .from('player_availability_flags')
          .insert([{
            squad_id: squadId,
            player_id: playerId,
            league_id: leagueId,
            created_by: user?.id,
          }])
          .select('id, flagged_at, expires_at')
          .single();

        if (error) {
          return { ok: false, error: error.message };
        }

        // Optimistic update
        setFlagMap(prev => ({
          ...prev,
          [playerId]: {
            flagId: data.id,
            squadId,
            isOwnFlag: true,
            ownedBy: user?.id,
            flaggedAt: data.flagged_at,
            expiresAt: data.expires_at,
          },
        }));

        return { ok: true };
      }
    } catch (err) {
      console.error('useAvailabilityFlag: toggleFlag failed', err);
      return { ok: false, error: err.message };
    }
  }, [leagueId, user?.id, flagMap]);

  return { flagMap, flagMapLoading, toggleFlag, refresh: loadFlags };
}
