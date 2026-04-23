import { useState, useEffect } from 'react';
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

  useEffect(() => {
    if (!leagueId) return;
    supabase
      .rpc('calculate_relaxation_state', { p_league_id: leagueId })
      .single()
      .then(({ data }) => {
        if (!data) return;
        setState({
          loading:        false,
          repeatsAllowed: data.repeats_allowed,   // null = unlimited
          tier:           data.tier,
          pressure:       data.pressure,
          threshold:      data.threshold,
          availablePool:  data.available_pool,
        });
      })
      .catch(() => setState(s => ({ ...s, loading: false })));
  }, [leagueId]);

  return state;
}
