import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { ClubhouseNotifContext } from './ClubhouseNotifContext';

export function ClubhouseNotifProvider({ children }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) { setUnreadCount(0); return; }

    supabase
      .from('clubhouse_notifications')
      .select('id', { count: 'exact', head: true })
      .is('read_at', null)
      .then(({ count }) => setUnreadCount(count ?? 0));

    const channel = supabase
      .channel('global-clubhouse-notif')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'clubhouse_notifications',
        filter: `user_id=eq.${userId}`,
      }, () => {
        setUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  return (
    <ClubhouseNotifContext.Provider value={{ unreadCount }}>
      {children}
    </ClubhouseNotifContext.Provider>
  );
}
