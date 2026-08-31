import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// Lifetime P2P win streak across both schemas (1:1 challenges + group bets),
// via get_my_p2p_streak() — no 30-day cutoff, unlike get_my_challenges().
// Reduce mirrors the current-streak walk in H2HSheet.jsx: rows arrive
// oldest-first, the run resets on any non-matching outcome, and the count
// left after the last row is the current streak.
export function useP2PStreak(userId) {
  const [streak, setStreak] = useState({ type: 'none', count: 0 });
  const [loading, setLoading] = useState(true);

  const fetchStreak = useCallback(async () => {
    if (!userId) { setStreak({ type: 'none', count: 0 }); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc('get_my_p2p_streak');
    if (error || !Array.isArray(data)) {
      setStreak({ type: 'none', count: 0 });
      setLoading(false);
      return;
    }

    let type = 'none';
    let count = 0;
    data.forEach(row => {
      if (row.outcome === 'win') {
        if (type === 'win') count++;
        else { type = 'win'; count = 1; }
      } else {
        type = 'none';
        count = 0;
      }
    });

    setStreak({ type, count });
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchStreak(); }, [fetchStreak]);

  return { streak, loading, refetch: fetchStreak };
}
