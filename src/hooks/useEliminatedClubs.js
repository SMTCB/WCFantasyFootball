import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Returns the Set of club_ids eliminated from this league's cup pool
 * (cup_active_clubs.eliminated_at IS NOT NULL). Empty Set for classic
 * leagues — they have no cup_active_clubs rows at all.
 */
export function useEliminatedClubs(leagueId) {
  const [eliminatedClubs, setEliminatedClubs] = useState(new Set());

  const load = useCallback(async () => {
    if (!leagueId) { setEliminatedClubs(new Set()); return; }
    const { data } = await supabase
      .from('cup_active_clubs')
      .select('club_id')
      .eq('league_id', leagueId)
      .not('eliminated_at', 'is', null);
    setEliminatedClubs(new Set((data ?? []).map(r => r.club_id)));
  }, [leagueId]);

  useEffect(() => { load(); }, [load]);

  return eliminatedClubs;
}
