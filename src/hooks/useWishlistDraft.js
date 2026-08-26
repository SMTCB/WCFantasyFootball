import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

const DEFAULT_MAX_TARGETS = 10;
const DEFAULT_MAX_DROPS   = 5;

/**
 * Manages wishlist draft submissions for a draft-mode league.
 *
 * Show condition: get_wishlist_draft_status() reports `available: true` —
 * league is draft-mode, feature isn't disabled via config, a round exists
 * (at least one finished fixture), and that round hasn't been allocated yet.
 *
 * Returns:
 *   shouldShow          — whether the UI should be visible at all
 *   roundNumber         — the round currently accepting submissions
 *   squadPlayers        — manager's current squad (id, name, position, club, price, forza_team_id)
 *   playerPool          — all players in the league's tournament, for target search
 *   existingTargets     — target_ids already submitted (ranked, index 0 = top priority)
 *   existingDrops       — drop_ids already submitted
 *   maxTargets, maxDrops — per-league caps
 *   submissionStatus     — null | 'pending' | 'processed' for this round's submission
 *   submit(targetIds, dropIds) — call submit_wishlist_draft RPC
 *   loading, saving, error
 */
export function useWishlistDraft(leagueId) {
  const { user } = useAuth();

  const [status,          setStatus]          = useState(null);
  const [squadPlayers,    setSquadPlayers]    = useState([]);
  const [playerPool,      setPlayerPool]      = useState([]);
  const [existingTargets,   setExistingTargets]   = useState([]);
  const [existingDrops,     setExistingDrops]     = useState([]);
  const [submissionStatus,  setSubmissionStatus]  = useState(null); // null | 'pending' | 'processed'
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState(null);

  const load = useCallback(async () => {
    if (!leagueId || !user?.id) { setLoading(false); return; }
    setLoading(true);
    setError(null);

    try {
      const { data: statusData } = await supabase
        .rpc('get_wishlist_draft_status', { p_league_id: leagueId })
        .single();

      setStatus(statusData ?? null);
      if (!statusData?.available) { setLoading(false); return; }

      const roundNumber = statusData.round_number;

      // Manager's current squad
      const { data: leagueRow } = await supabase
        .from('leagues')
        .select('tournament_id')
        .eq('id', leagueId)
        .maybeSingle();

      const { data: squad } = await supabase
        .from('squads')
        .select('players')
        .eq('league_id', leagueId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const squadIds = squad?.players ?? [];
      if (squadIds.length > 0) {
        const { data: sRows } = await supabase
          .from('players')
          .select('id, name, position, club, price, forza_team_id')
          .in('id', squadIds);
        setSquadPlayers(sRows ?? []);
      } else {
        setSquadPlayers([]);
      }

      // Full player pool for target search (tournament-scoped)
      if (leagueRow?.tournament_id) {
        const { data: pool } = await supabase
          .from('players')
          .select('id, name, position, club, price, forza_team_id')
          .eq('tournament_id', leagueRow.tournament_id);
        setPlayerPool(pool ?? []);
      } else {
        setPlayerPool([]);
      }

      // Existing submission for this round
      const { data: sub } = await supabase
        .from('wishlist_draft_submissions')
        .select('target_ids, drop_ids, status')
        .eq('league_id', leagueId)
        .eq('user_id', user.id)
        .eq('round_number', roundNumber)
        .maybeSingle();

      setExistingTargets(sub?.target_ids ?? []);
      setExistingDrops(sub?.drop_ids ?? []);
      setSubmissionStatus(sub?.status ?? null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [leagueId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const submit = useCallback(async (targetIds, dropIds) => {
    if (!status?.round_number) return { ok: false, error: 'No round currently open for submissions' };
    setSaving(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase
        .rpc('submit_wishlist_draft', {
          p_league_id:    leagueId,
          p_round_number: status.round_number,
          p_target_ids:   targetIds,
          p_drop_ids:     dropIds,
        });
      if (rpcErr) throw new Error(rpcErr.message);
      if (!data?.ok) throw new Error(data?.error ?? 'Submission failed');
      setExistingTargets(targetIds);
      setExistingDrops(dropIds);
      setSubmissionStatus('pending');
      return { ok: true };
    } catch (err) {
      setError(err.message);
      return { ok: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }, [leagueId, status?.round_number]);

  return {
    shouldShow:  !!status?.available,
    roundNumber: status?.round_number ?? null,
    squadPlayers,
    playerPool,
    existingTargets,
    existingDrops,
    maxTargets: status?.max_targets ?? DEFAULT_MAX_TARGETS,
    maxDrops:   status?.max_drops   ?? DEFAULT_MAX_DROPS,
    submissionStatus,
    submit,
    loading,
    saving,
    error,
    reload: load,
  };
}
