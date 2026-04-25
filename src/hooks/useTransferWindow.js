import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Returns the current transfer window status for a league.
// Re-polls every 60s and on demand via refresh().
//
// status values:
//   'loading'    — initial fetch in progress
//   'open'       — window is open, transfers allowed
//   'upcoming'   — window exists but hasn't opened yet
//   'no_window'  — no window configured for this league

export function useTransferWindow(leagueId) {
  const [state, setState] = useState({
    status:              'loading',
    closesAt:            null,
    opensAt:             null,
    transfersRemaining:  null,  // null = unlimited
    windowType:          null,
  });

  const fetch = useCallback(async () => {
    if (!leagueId) return;
    try {
      const { data } = await supabase
        .rpc('get_transfer_window_status', { p_league_id: leagueId })
        .single();

      if (!data) { setState(s => ({ ...s, status: 'no_window' })); return; }

      setState({
        status:             data.status,
        closesAt:           data.closes_at   ?? null,
        opensAt:            data.opens_at    ?? null,
        transfersRemaining: data.transfers_remaining ?? null,
        windowType:         data.window_type ?? null,
      });
    } catch {
      setState(s => ({ ...s, status: 'no_window' }));
    }
  }, [leagueId]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, 60_000);
    return () => clearInterval(id);
  }, [fetch]);

  const isOpen     = state.status === 'open';
  const isUnlimited = state.transfersRemaining === null;

  return { ...state, isOpen, isUnlimited, refresh: fetch };
}
