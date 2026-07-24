import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

export function useTennisTournament(tournamentId) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!tournamentId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: result, error: err } = await supabase.rpc('get_tennis_tournament_for_user', {
        p_tournament_id: tournamentId,
      });
      if (err) throw err;
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => { fetch(); }, [fetch]);

  const submitRoster = useCallback(async (slots, aceCard = null) => {
    const { data: result, error: err } = await supabase.rpc('submit_tennis_roster', {
      p_tournament_id: tournamentId,
      p_tier1:  slots.tier1,
      p_tier2a: slots.tier2a,
      p_tier2b: slots.tier2b,
      p_tier3a: slots.tier3a,
      p_tier3b: slots.tier3b,
      p_tier4a: slots.tier4a,
      p_tier4b: slots.tier4b,
      p_ace_card: aceCard ?? null,
    });
    if (err) throw err;
    await fetch();
    return result;
  }, [tournamentId, fetch]);

  const setQfCaptain = useCallback(async (captainPlayerId) => {
    const { data: result, error: err } = await supabase.rpc('set_tennis_qf_captain', {
      p_tournament_id: tournamentId,
      p_captain_player_id: captainPlayerId,
    });
    if (err) throw err;
    await fetch();
    return result;
  }, [tournamentId, fetch]);

  return {
    tournament: data?.tournament ?? null,
    players: data?.players ?? [],
    roster: data?.roster ?? null,
    captain: data?.captain ?? null,
    aceCards: data?.ace_cards ?? [],
    survivingPlayers: data?.surviving_players ?? [],
    score: data?.score ?? null,
    loading,
    error,
    submitRoster,
    setQfCaptain,
    refresh: fetch,
  };
}
