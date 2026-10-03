import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';
import { normalizeIntelligence } from '../lib/intelligence';

const DEFAULT_MAX_TARGETS = 10;
const DEFAULT_MAX_DROPS   = 5;

/**
 * Manages wishlist draft submissions for a draft-mode league.
 *
 * Show condition: get_wishlist_draft_status() reports `available: true` —
 * league is draft-mode and a round exists (at least one finished fixture).
 * Since migration 294 each round's draft has a mode (manual | auto |
 * disabled) and a phase:
 *   pre_draft      — draft pending, market locked (trades still allowed)
 *   running        — allocation in progress, wishlists locked for a minute
 *   free_market    — draft disabled this round; wishlist is kept for later
 *   awaiting_round — previous round's draft already ran; this list is for
 *                    the next round (whose mode will be the league default)
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
 *   draft               — schedule/mode fields from get_wishlist_draft_status
 *   otherOwners         — { [playerId]: [managerName] } for players rostered by
 *                         someone else (targets carried over may now be owned)
 *   setMode(scope, mode, scheduledAt) — commissioner: set_wishlist_draft_mode
 *   runNow()            — commissioner: run the pending draft immediately
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
  const [otherOwners,     setOtherOwners]     = useState({});
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

      // Who owns what — a carried-over wishlist can name players someone
      // bought in the meantime; the screen greys those out as "Owned by X".
      const { data: leagueSquads } = await supabase
        .from('squads')
        .select('user_id, players, created_at')
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false });
      const latestByUser = new Map();
      for (const s of leagueSquads ?? []) if (!latestByUser.has(s.user_id)) latestByUser.set(s.user_id, s);
      latestByUser.delete(user.id);
      const otherIds = [...latestByUser.keys()];
      const { data: profiles } = otherIds.length
        ? await supabase.from('users').select('id, username').in('id', otherIds)
        : { data: [] };
      const nameOf = Object.fromEntries((profiles ?? []).map(p => [p.id, p.username]));
      const owners = {};
      for (const [uid, s] of latestByUser) {
        for (const pid of s.players ?? []) (owners[pid] ??= []).push(nameOf[uid] ?? 'another manager');
      }
      setOtherOwners(owners);

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

      // Full player pool for target search (tournament-scoped), with fitness
      // intel attached (mirrors MarketScreen's players+player_status join) so
      // the target list can show the same availability dot/warning as Market.
      if (leagueRow?.tournament_id) {
        const [{ data: pool }, { data: intelData }] = await Promise.all([
          supabase
            .from('players')
            .select('id, name, position, club, price, forza_team_id')
            .eq('tournament_id', leagueRow.tournament_id)
            .eq('is_active', true),
          supabase.from('player_status').select('*'),
        ]);
        const poolWithIntel = (pool ?? []).map(p => ({
          ...p,
          intel: normalizeIntelligence(intelData?.find(i => i.player_id === p.id)),
        }));
        setPlayerPool(poolWithIntel);
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
      if (!data?.ok) {
        const e = new Error(data?.error ?? 'Submission failed');
        e.code = data?.code;
        throw e;
      }
      setExistingTargets(targetIds);
      setExistingDrops(dropIds);
      setSubmissionStatus('pending');
      return { ok: true };
    } catch (err) {
      setError(err.message);
      // The round resolved (or is resolving) under us — refresh so the
      // screen shows the new phase instead of retrying a dead submission.
      if (err.code === 'WINDOW_CLOSED') load();
      return { ok: false, error: err.message, code: err.code };
    } finally {
      setSaving(false);
    }
  }, [leagueId, status?.round_number, load]);

  // Commissioner: change this round's mode (scope 'round') or the league
  // default for future rounds (scope 'default'). All rules — 6h notice,
  // kickoff − 8h deadline, running-draft lock — are enforced in SQL; the
  // returned { ok, code, error } is surfaced as-is.
  const setMode = useCallback(async (scope, mode, scheduledAt = null) => {
    const { data, error: rpcErr } = await supabase.rpc('set_wishlist_draft_mode', {
      p_league_id:    leagueId,
      p_scope:        scope,
      p_mode:         mode,
      p_scheduled_at: scheduledAt,
    });
    if (rpcErr) return { ok: false, error: rpcErr.message };
    if (data?.ok) await load();
    return data ?? { ok: false, error: 'No response' };
  }, [leagueId, load]);

  // Commissioner: "Run draft now". The Edge Function flags the round and
  // allocates immediately; if the call dies the flag is picked up by cron.
  const runNow = useCallback(async () => {
    const { data, error: fnErr } = await supabase.functions.invoke('run-wishlist-draft', {
      body: { league_id: leagueId },
    });
    let result = data;
    if (fnErr) {
      // Non-2xx: the body carries { ok:false, code, error }.
      try { result = await fnErr.context?.json?.(); } catch { result = null; }
      result = result ?? { ok: false, error: fnErr.message };
    }
    await load();
    return result ?? { ok: false, error: 'No response' };
  }, [leagueId, load]);

  const draft = {
    phase:             status?.phase ?? null,
    mode:              status?.mode ?? null,
    defaultMode:       status?.default_mode ?? null,
    scheduledAt:       status?.scheduled_at ?? null,
    hardDeadlineAt:    status?.hard_deadline_at ?? null,
    firstKickoffAt:    status?.first_kickoff_at ?? null,
    roundEndedAt:      status?.round_ended_at ?? null,
    runRequestedAt:    status?.run_requested_at ?? null,
    carriedOverFrom:   status?.carried_over_from ?? null,
    isCommissioner:    !!status?.is_commissioner,
    transfersInWindow: status?.transfers_in_window ?? 0,
  };

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
    draft,
    otherOwners,
    setMode,
    runNow,
    loading,
    saving,
    error,
    reload: load,
  };
}
