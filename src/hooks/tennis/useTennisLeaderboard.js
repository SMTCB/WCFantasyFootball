import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

export function useTennisLeaderboard(playerBoxId, seasonYear = 2026) {
  const [standings, setStandings] = useState([]);
  const [seasonSummary, setSeasonSummary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!playerBoxId) return;
    setLoading(true);
    setError(null);
    try {
      const [lbRes, sumRes] = await Promise.all([
        supabase.rpc('get_player_box_leaderboard', {
          p_player_box_id: playerBoxId,
          p_season_year: seasonYear,
        }),
        supabase.rpc('get_tennis_season_summary', {
          p_player_box_id: playerBoxId,
          p_season_year: seasonYear,
        }),
      ]);
      if (lbRes.error) throw lbRes.error;
      if (sumRes.error) throw sumRes.error;
      setStandings(lbRes.data ?? []);
      setSeasonSummary(sumRes.data ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [playerBoxId, seasonYear]);

  useEffect(() => { fetch(); }, [fetch]);

  return { standings, seasonSummary, loading, error, refresh: fetch };
}
