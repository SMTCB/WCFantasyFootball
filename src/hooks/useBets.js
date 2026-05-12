import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Fetches all open/resolved bet instances for a league, with the current
 * squad's submission joined in (if any). Re-fetches when leagueId changes.
 */
export function useBets(leagueId, squadId) {
  const [bets, setBets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchBets = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch instances with their template metadata
      const { data: instances, error: instErr } = await supabase
        .from('bet_instances')
        .select(`
          *,
          template:bet_templates(slug, answer_type, scope_type)
        `)
        .eq('league_id', leagueId)
        .in('status', ['open', 'closed', 'resolved'])
        .order('created_at', { ascending: false });

      if (instErr) throw instErr;
      if (!instances?.length) { setBets([]); return; }

      // Fetch this squad's submissions for all these instances
      let submissionMap = {};
      if (squadId) {
        const instanceIds = instances.map(i => i.id);
        const { data: subs } = await supabase
          .from('bet_submissions')
          .select('bet_instance_id, answer, is_correct, reward_awarded, submitted_at')
          .eq('squad_id', squadId)
          .in('bet_instance_id', instanceIds);

        (subs ?? []).forEach(s => {
          submissionMap[s.bet_instance_id] = s;
        });
      }

      setBets(instances.map(inst => ({
        ...inst,
        mySubmission: submissionMap[inst.id] ?? null,
      })));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [leagueId, squadId]);

  useEffect(() => { fetchBets(); }, [fetchBets]);

  return { bets, loading, error, refetch: fetchBets };
}
