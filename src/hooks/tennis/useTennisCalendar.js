import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

export function useTennisCalendar(seasonYear = 2026) {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_tennis_tournament_list', {
        p_season_year: seasonYear,
      });
      if (err) throw err;
      setTournaments(data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [seasonYear]);

  useEffect(() => { fetchCalendar(); }, [fetchCalendar]);

  const activeOrNext = tournaments.find(t =>
    t.status === 'in_progress' || t.status === 'roster_open' || t.status === 'qf_captain_open'
  ) ?? tournaments.find(t => t.status === 'upcoming') ?? null;

  return { tournaments, activeOrNext, loading, error, refresh: fetchCalendar };
}
