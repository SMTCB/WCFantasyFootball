import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Returns the current no-repeat relaxation state for a cup league.
// repeats_allowed: 0 = strict, 1/3 = partial, null = rule lifted.

export function useRelaxationState(leagueId) {
  const [state, setState] = useState({
    loading:         true,
    repeatsAllowed:  0,
    tier:            0,
    pressure:        0,
    threshold:       0,
    availablePool:   null,
  });

  const load = useCallback(async () => {
    if (!leagueId) return;
    try {
      // calculate_relaxation_state returns pressure, pool size, thresholds for display.
      // Drop .single() — RETURNS JSON functions don't need it and it can throw on null.
      const { data: calc } = await supabase
        .rpc('calculate_relaxation_state', { p_league_id: leagueId });

      // Read persisted repeats_allowed / tier from league_config.
      // apply_relaxation_state() writes these after each club elimination so the
      // enforcement value is stable between recalculations.
      const { data: cfgRows } = await supabase
        .from('league_config')
        .select('config_key, config_value')
        .eq('league_id', leagueId)
        .in('config_key', ['current_repeats_allowed', 'current_relaxation_tier']);

      const cfgMap = Object.fromEntries(
        (cfgRows ?? []).map(r => [r.config_key, r.config_value])
      );

      const persistedRepeats = cfgMap.current_repeats_allowed;
      const persistedTier    = cfgMap.current_relaxation_tier;

      setState({
        loading:        false,
        // Prefer persisted (applied) value; fall back to live calculation
        repeatsAllowed: persistedRepeats !== undefined
          ? (persistedRepeats === null ? null : Number(persistedRepeats))
          : (calc?.repeats_allowed ?? 0),
        tier:           persistedTier !== undefined
          ? Number(persistedTier)
          : (calc?.tier ?? 0),
        pressure:       calc?.pressure       ?? 0,
        threshold:      calc?.threshold      ?? 0,
        availablePool:  calc?.available_pool ?? null,
      });
    } catch {
      setState(s => ({ ...s, loading: false }));
    }
  }, [leagueId]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: re-fetch when a gazette entry is published for this league.
  // gazette_entries are written by apply_relaxation_state after club eliminations,
  // so an INSERT is the signal that tier may have changed.
  useEffect(() => {
    if (!leagueId) return;
    const channel = supabase
      .channel(`relaxation_${leagueId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'gazette_entries',
        filter: `league_id=eq.${leagueId}`,
      }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [leagueId, load]);

  return state;
}
