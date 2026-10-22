import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ClubhouseNotifContext } from './ClubhouseNotifContext';

export function ClubhouseNotifProvider({ children }) {
  const [userId, setUserId]       = useState(null);
  const [byCircle, setByCircle]   = useState({});

  // Resolve auth.uid() without importing useAuth (avoids TDZ in AppLayout chain)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Unread rows are tallied per clubhouse so the nav can show only the active one.
  const fetchCount = useCallback(async () => {
    if (!userId) { setByCircle({}); return; }
    const { data } = await supabase
      .from('clubhouse_notifications')
      .select('circle_id')
      .eq('user_id', userId)
      .is('read_at', null)
      .limit(1000);
    const tally = {};
    for (const r of data ?? []) tally[r.circle_id] = (tally[r.circle_id] ?? 0) + 1;
    setByCircle(tally);
  }, [userId]);

  useEffect(() => { fetchCount(); }, [fetchCount]);

  // Realtime: +1 on new insert, re-fetch on update (mark-read events)
  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`notif-badge-${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'clubhouse_notifications',
        filter: `user_id=eq.${userId}`,
      }, (payload) => setByCircle(m => ({ ...m, [payload.new.circle_id]: (m[payload.new.circle_id] ?? 0) + 1 })))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'clubhouse_notifications',
        filter: `user_id=eq.${userId}`,
      }, () => fetchCount())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, fetchCount]);

  const unreadCount = Object.values(byCircle).reduce((a, b) => a + b, 0);

  return (
    <ClubhouseNotifContext value={{ unreadCount, unreadByCircle: byCircle, resetBadge: fetchCount }}>
      {children}
    </ClubhouseNotifContext>
  );
}
