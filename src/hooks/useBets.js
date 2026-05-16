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

  useEffect(() => {
    fetchBets();
  }, [fetchBets]);

  // Subscribe to realtime changes
  useEffect(() => {
    if (!leagueId) return;

    // Bet instance changes: merge UPDATEs in place; full refetch only on INSERT
    // (INSERT needs the template join which Realtime payload doesn't include)
    const instanceSub = supabase
      .channel(`bet_instances:league_id=eq.${leagueId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bet_instances', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            fetchBets(); // needs template join — full fetch required
          } else if (payload.eventType === 'UPDATE' && payload.new) {
            setBets(prev => prev.map(b =>
              b.id === payload.new.id ? { ...b, ...payload.new } : b
            ));
          }
        }
      )
      .subscribe();

    // Bet submissions: filter by squad_id server-side so only this squad's events
    // arrive. Merge the new submission into state without a full refetch.
    const submissionSub = squadId
      ? supabase
          .channel(`bet_submissions:squad_id=eq.${squadId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'bet_submissions',
              filter: `squad_id=eq.${squadId}`,
            },
            (payload) => {
              const sub = payload.new;
              if (!sub) return;
              setBets(prev => prev.map(bet =>
                bet.id === sub.bet_instance_id
                  ? {
                      ...bet,
                      mySubmission: {
                        bet_instance_id: sub.bet_instance_id,
                        answer:          sub.answer,
                        is_correct:      sub.is_correct,
                        reward_awarded:  sub.reward_awarded,
                        submitted_at:    sub.submitted_at,
                      },
                    }
                  : bet
              ));
            }
          )
          .subscribe()
      : null;

    return () => {
      instanceSub.unsubscribe();
      submissionSub?.unsubscribe();
    };
  }, [leagueId, squadId, fetchBets]);

  return { bets, loading, error, refetch: fetchBets };
}
