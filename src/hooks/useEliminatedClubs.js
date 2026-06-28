import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Returns the Set of eliminated club names for this league.
 *
 * Draft/cup leagues: authoritative `cup_active_clubs.eliminated_at IS NOT NULL`
 * (set by sync_cup_eliminations, manually correctable via eliminate_cup_club).
 *
 * Classic leagues have no cup_active_clubs pool at all, so elimination is
 * derived live from the tournament's fixtures: a club with zero fixtures
 * remaining (status != 'finished' AND kickoff_at > NOW()) is eliminated.
 * Same definition sync_cup_eliminations uses, just computed on read instead
 * of persisted — classic leagues never restrict the transfer market by club,
 * so there's nothing to self-heal here.
 */
export function useEliminatedClubs(leagueId, tournamentId) {
  const [eliminatedClubs, setEliminatedClubs] = useState(new Set());

  const load = useCallback(async () => {
    if (!leagueId) { setEliminatedClubs(new Set()); return; }

    const { data: cupRows } = await supabase
      .from('cup_active_clubs')
      .select('club_id, eliminated_at')
      .eq('league_id', leagueId);

    if (cupRows && cupRows.length > 0) {
      setEliminatedClubs(new Set(cupRows.filter(r => r.eliminated_at).map(r => r.club_id)));
      return;
    }

    if (!tournamentId) { setEliminatedClubs(new Set()); return; }

    const { data: fixtures } = await supabase
      .from('fixtures')
      .select('home_team, away_team, status, kickoff_at')
      .eq('tournament_id', tournamentId);

    if (!fixtures) { setEliminatedClubs(new Set()); return; }

    const now = Date.now();
    const hasFuture = new Set();
    const allClubs   = new Set();
    fixtures.forEach(f => {
      [f.home_team, f.away_team].forEach(team => {
        if (!team) return;
        allClubs.add(team);
        if (f.status !== 'finished' && new Date(f.kickoff_at).getTime() > now) {
          hasFuture.add(team);
        }
      });
    });
    setEliminatedClubs(new Set([...allClubs].filter(c => !hasFuture.has(c))));
  }, [leagueId, tournamentId]);

  useEffect(() => { load(); }, [load]);

  return eliminatedClubs;
}
