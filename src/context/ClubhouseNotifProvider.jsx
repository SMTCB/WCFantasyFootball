import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { ClubhouseNotifContext } from './ClubhouseNotifContext';

export function ClubhouseNotifProvider({ children }) {
  const [userId, setUserId]       = useState(null);
  const [unreadCount, setCount]   = useState(0);

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

  const fetchCount = useCallback(async () => {
    if (!userId) { setCount(0); return; }
    const { count } = await supabase
      .from('clubhouse_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);
    setCount(count ?? 0);
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
      }, () => setCount(n => n + 1))
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'clubhouse_notifications',
        filter: `user_id=eq.${userId}`,
      }, () => fetchCount())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, fetchCount]);

  return (
    <ClubhouseNotifContext value={{ unreadCount, resetBadge: fetchCount }}>
      {children}
    </ClubhouseNotifContext>
  );
}
