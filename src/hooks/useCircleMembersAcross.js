import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// Members of several clubhouses at once, for the members table on each Home
// clubhouse card. Returns { byCircle: Map circleId -> [{ user_id, username }], refresh }.
// Inside a clubhouse, useClubhouse keeps loading the active one's members itself.
export function useCircleMembersAcross(circleIds) {
  const key = [...new Set((circleIds ?? []).filter(Boolean))].sort().join(',');
  const [state, setState] = useState({ key: '', byCircle: new Map() });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('circle_members')
        .select('circle_id, user_id, joined_at, users(username)')
        .in('circle_id', key.split(','))
        .order('joined_at', { ascending: true });
      if (error) { console.error('useCircleMembersAcross: fetch failed', error); return; }
      const byCircle = new Map();
      for (const row of data ?? []) {
        if (!byCircle.has(row.circle_id)) byCircle.set(row.circle_id, []);
        byCircle.get(row.circle_id).push({ user_id: row.user_id, username: row.users?.username ?? '?' });
      }
      if (!cancelled) setState({ key, byCircle });
    })();
    return () => { cancelled = true; };
  }, [key, tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  return { byCircle: state.key === key ? state.byCircle : null, refresh };
}
