import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Returns the current transfer window status for a league.
// Re-polls every 5 minutes and on demand via refresh().
// Module-level cache avoids redundant API calls when the user navigates
// between League and Squad screens — both mount this hook independently.
//
// status values:
//   'loading'    — initial fetch in progress
//   'open'       — window is open, transfers allowed
//   'upcoming'   — window exists but hasn't opened yet
//   'no_window'  — no window configured for this league

const POLL_INTERVAL = 300_000; // 5 min — window status changes rarely
const CACHE_TTL     = 60_000;  // 1 min — remounts within this window skip the API call
const _cache        = new Map(); // leagueId → { data, fetchedAt }

export function useTransferWindow(leagueId) {
  const [state, setState] = useState(() => {
    // Seed state from cache on mount to avoid loading flash on remount
    const cached = leagueId ? _cache.get(leagueId) : null;
    if (cached) return cached.data;
    return {
      status:              'loading',
      closesAt:            null,
      opensAt:             null,
      transfersRemaining:  null,  // null = unlimited
      windowType:          null,
    };
  });

  const fetch = useCallback(async (force = false) => {
    if (!leagueId) return;
    const cached = _cache.get(leagueId);
    if (!force && cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
      setState(cached.data);
      return;
    }
    try {
      const { data } = await supabase
        .rpc('get_transfer_window_status', { p_league_id: leagueId })
        .single();

      if (!data) {
        const next = { status: 'no_window', closesAt: null, opensAt: null, transfersRemaining: null, windowType: null };
        _cache.set(leagueId, { data: next, fetchedAt: Date.now() });
        setState(next);
        return;
      }

      const next = {
        status:             data.status,
        closesAt:           data.closes_at            ?? null,
        opensAt:            data.opens_at             ?? null,
        transfersRemaining: data.transfers_remaining  ?? null,
        windowType:         data.window_type          ?? null,
      };
      _cache.set(leagueId, { data: next, fetchedAt: Date.now() });
      setState(next);
    } catch {
      setState(s => ({ ...s, status: 'no_window' }));
    }
  }, [leagueId]);

  const refresh = useCallback(() => fetch(true), [fetch]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetch]);

  const isOpen      = state.status === 'open';
  const isUnlimited = state.transfersRemaining === null;

  return { ...state, isOpen, isUnlimited, refresh };
}
