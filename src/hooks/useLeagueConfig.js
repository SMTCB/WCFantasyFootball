import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Competition-agnostic league configuration.
 *
 * Reads budget_total, squad_size, draft_list_size, position_limits,
 * draft_position_caps, and min_formation directly from the leagues row.
 * Falls back to EPL-sensible defaults so the UI never crashes on missing data.
 *
 * Usage:
 *   const cfg = useLeagueConfig(leagueId);
 *   cfg.positionLimits   // { GK:2, DEF:5, MID:5, FWD:3 }
 *   cfg.budgetTotal      // 100
 *   cfg.squadSize        // 15
 *   cfg.loading          // true while fetching
 */

const DEFAULTS = {
  budgetTotal:       100.0,
  squadSize:         15,
  draftListSize:     45,
  positionLimits:    { GK: 2, DEF: 5, MID: 5, FWD: 3 },
  draftPositionCaps: { GK: 6, DEF: 15, MID: 15, FWD: 9 },
  minFormation:      { GK: 1, DEF: 3, MID: 2, FWD: 1 },
  format:            'classic',
};

export function useLeagueConfig(leagueId) {
  const [config, setConfig] = useState({ ...DEFAULTS, loading: true });

  useEffect(() => {
    if (!leagueId) {
      setConfig({ ...DEFAULTS, loading: false });
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('leagues')
        .select(
          'budget_total, squad_size, draft_list_size, position_limits, draft_position_caps, min_formation, format, tournament_id'
        )
        .eq('id', leagueId)
        .maybeSingle();

      if (cancelled) return;

      if (error || !data) {
        setConfig({ ...DEFAULTS, loading: false });
        return;
      }

      setConfig({
        budgetTotal:       Number(data.budget_total       ?? DEFAULTS.budgetTotal),
        squadSize:         Number(data.squad_size         ?? DEFAULTS.squadSize),
        draftListSize:     Number(data.draft_list_size    ?? DEFAULTS.draftListSize),
        positionLimits:    data.position_limits     ?? DEFAULTS.positionLimits,
        draftPositionCaps: data.draft_position_caps ?? DEFAULTS.draftPositionCaps,
        minFormation:      data.min_formation       ?? DEFAULTS.minFormation,
        format:            data.format              ?? DEFAULTS.format,
        tournamentId:      data.tournament_id       ?? null,
        loading: false,
      });
    })();

    return () => { cancelled = true; };
  }, [leagueId]);

  return config;
}
