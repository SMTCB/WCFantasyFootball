import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// Returns { ownershipMap } — { [playerId]: pct } of squads in the league
// that currently own each player. 0–100, rounded to 1 decimal.
export function useLeagueOwnership(leagueId) {
  const [ownershipMap, setOwnershipMap] = useState({});

  useEffect(() => {
    if (!leagueId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const { data: squads } = await supabase
          .from('squads')
          .select('players')
          .eq('league_id', leagueId);

        if (cancelled || !squads?.length) return;

        const counts = {};
        for (const squad of squads) {
          for (const pid of squad.players || []) {
            counts[pid] = (counts[pid] || 0) + 1;
          }
        }

        const total = squads.length;
        const map = {};
        for (const [pid, count] of Object.entries(counts)) {
          map[pid] = Math.round((count / total) * 1000) / 10;
        }

        setOwnershipMap(map);
      } catch (err) {
        console.error('useLeagueOwnership: failed to load', err);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [leagueId]);

  return { ownershipMap };
}
