import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const DEFAULT_MAX_SLOTS = 5;

/**
 * Manages knockout keep submissions for a cup+draft league.
 *
 * Show condition (all must be true):
 *   - league.format is 'cup' or 'noduplicate'
 *   - league.league_mode is 'draft' or 'noduplicate'
 *   - league.cup_phase === 'group_stage'   ← key guard against group-stage draft
 *   - league.knockout_draft_deadline is set
 *
 * Returns:
 *   shouldShow      — whether the UI should be visible at all
 *   players         — manager's current squad players (id, name, position, club, price, forza_team_id)
 *   existingKeeps   — player_ids already submitted
 *   maxSlots        — per-league cap (default 5)
 *   knockoutDeadline — ISO string for display
 *   eliminatedClubs — Set of forza_team_id values (for UI validation hint)
 *   submit(ids)     — call submit_knockout_keeps RPC
 *   loading, saving, error
 */
export function useKnockoutKeep(leagueId) {
  const { user } = useAuth();

  const [league,          setLeague]          = useState(null);
  const [players,         setPlayers]         = useState([]);
  const [existingKeeps,   setExistingKeeps]   = useState([]);
  const [maxSlots,        setMaxSlots]        = useState(DEFAULT_MAX_SLOTS);
  const [eliminatedClubs, setEliminatedClubs] = useState(new Set());
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState(null);

  const load = useCallback(async () => {
    if (!leagueId || !user?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch league metadata
      const { data: lg } = await supabase
        .from('leagues')
        .select('format, league_mode, cup_phase, knockout_draft_deadline, tournament_id')
        .eq('id', leagueId)
        .maybeSingle();

      setLeague(lg);

      // Bail early if conditions not met — nothing else to load.
      const shouldLoad =
        lg &&
        (lg.format === 'cup' || lg.format === 'noduplicate') &&
        (lg.league_mode === 'draft' || lg.league_mode === 'noduplicate') &&
        lg.cup_phase === 'group_stage' &&
        !!lg.knockout_draft_deadline;

      if (!shouldLoad) { setLoading(false); return; }

      // 2. Manager's current squad players
      const { data: squad } = await supabase
        .from('squads')
        .select('players')
        .eq('league_id', leagueId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const playerIds = squad?.players ?? [];

      let squadPlayers = [];
      if (playerIds.length > 0) {
        const { data: pRows } = await supabase
          .from('players')
          .select('id, name, position, club, price, forza_team_id')
          .in('id', playerIds);
        squadPlayers = pRows ?? [];
      }
      setPlayers(squadPlayers);

      // 3. Eliminated clubs
      const { data: elim } = await supabase
        .from('cup_active_clubs')
        .select('club_id')
        .eq('league_id', leagueId)
        .not('eliminated_at', 'is', null);
      setEliminatedClubs(new Set((elim ?? []).map(r => r.club_id)));

      // 4. Existing keep submission for this manager
      const { data: sub } = await supabase
        .from('knockout_keep_submissions')
        .select('player_ids')
        .eq('league_id', leagueId)
        .eq('user_id', user.id)
        .maybeSingle();
      setExistingKeeps(sub?.player_ids ?? []);

      // 5. Per-league slot limit from config (fallback to 5)
      const { data: cfg } = await supabase
        .from('league_config')
        .select('config_value')
        .eq('league_id', leagueId)
        .eq('config_key', 'knockout_keep_slots')
        .maybeSingle();
      if (cfg?.config_value !== undefined && cfg.config_value !== null) {
        setMaxSlots(Number(cfg.config_value) || DEFAULT_MAX_SLOTS);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [leagueId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const submit = useCallback(async (playerIds) => {
    setSaving(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase
        .rpc('submit_knockout_keeps', {
          p_league_id:  leagueId,
          p_player_ids: playerIds,
        });
      if (rpcErr) throw new Error(rpcErr.message);
      if (!data?.ok) throw new Error(data?.error ?? 'Submission failed');
      setExistingKeeps(playerIds);
      return { ok: true };
    } catch (err) {
      setError(err.message);
      return { ok: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }, [leagueId]);

  const shouldShow =
    !!league &&
    (league.format === 'cup' || league.format === 'noduplicate') &&
    (league.league_mode === 'draft' || league.league_mode === 'noduplicate') &&
    league.cup_phase === 'group_stage' &&
    !!league.knockout_draft_deadline;

  return {
    shouldShow,
    players,
    existingKeeps,
    maxSlots,
    knockoutDeadline: league?.knockout_draft_deadline ?? null,
    eliminatedClubs,
    submit,
    loading,
    saving,
    error,
  };
}
