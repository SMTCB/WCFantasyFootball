import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

export function useAtpFinalsPicks(seasonYear = 2026) {
  const [matches, setMatches] = useState([]);
  const [myPicks, setMyPicks] = useState([]);
  const [atpTournament, setAtpTournament] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [matchRes, pickRes, tournRes] = await Promise.all([
        supabase
          .from('tennis_atp_finals_matches')
          .select('*')
          .eq('season_year', seasonYear)
          .order('match_number'),
        supabase
          .from('tennis_atp_finals_picks')
          .select('*')
          .eq('season_year', seasonYear),
        supabase
          .from('tennis_tournaments')
          .select('id, name, status, roster_lock_at, qf_window_opens_at, qf_window_closes_at')
          .eq('season_year', seasonYear)
          .eq('tournament_type', 'atp_finals')
          .single(),
      ]);
      if (matchRes.error) throw matchRes.error;
      if (pickRes.error && pickRes.error.code !== 'PGRST116') throw pickRes.error;
      if (tournRes.error && tournRes.error.code !== 'PGRST116') throw tournRes.error;
      setMatches(matchRes.data ?? []);
      setMyPicks(pickRes.data ?? []);
      setAtpTournament(tournRes.data ?? null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [seasonYear]);

  useEffect(() => { fetch(); }, [fetch]);

  const submitGroupPicks = useCallback(async (picks) => {
    const { data, error: err } = await supabase.rpc('submit_atp_finals_group_picks', {
      p_season_year: seasonYear,
      p_picks: picks,
    });
    if (err) throw err;
    await fetch();
    return data;
  }, [seasonYear, fetch]);

  const submitKnockoutPicks = useCallback(async (picks) => {
    const { data, error: err } = await supabase.rpc('submit_atp_finals_knockout_picks', {
      p_season_year: seasonYear,
      p_picks: picks,
    });
    if (err) throw err;
    await fetch();
    return data;
  }, [seasonYear, fetch]);

  const groupMatches = matches.filter(m => m.match_type === 'group');
  const knockoutMatches = matches.filter(m => m.match_type !== 'group');
  const myPickMap = Object.fromEntries(myPicks.map(p => [p.match_number, p.picked_player_id]));

  return {
    atpTournament,
    groupMatches,
    knockoutMatches,
    myPickMap,
    loading,
    error,
    submitGroupPicks,
    submitKnockoutPicks,
    refresh: fetch,
  };
}
