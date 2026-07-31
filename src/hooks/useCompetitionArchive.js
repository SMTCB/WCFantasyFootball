import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Shared archive/unarchive hook for paddocks and player boxes (B-13-F1 / B-13-TENNIS).
// Table-agnostic counterpart to useCommissioner's archiveLeague/unarchiveLeague —
// both sports go through the same set_competition_archived RPC (migration 251)
// since neither paddocks nor player_boxes have a direct-update RLS path that
// recognizes circle-owner admin rights the way leagues do.
export function useCompetitionArchive(competitionType, competitionId, onUpdated) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const run = useCallback((archived) => async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.rpc('set_competition_archived', {
        p_competition_type: competitionType,
        p_competition_id:   competitionId,
        p_archived:         archived,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      setMessage({ type: 'ok', text: archived ? 'Archived.' : 'Reactivated.' });
      onUpdated?.();
    } catch (e) {
      setMessage({ type: 'err', text: e.message || 'Action failed' });
    } finally {
      setBusy(false);
    }
  }, [competitionType, competitionId, onUpdated]);

  return { archive: run(true), unarchive: run(false), busy, message };
}
