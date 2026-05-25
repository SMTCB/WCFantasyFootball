import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useNotifications(leagueId) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch unread count via RPC
  const fetchUnreadCount = useCallback(async () => {
    if (!leagueId) return;
    try {
      const { data, error: err } = await supabase.rpc('get_unread_notification_count', {
        p_league_id: leagueId,
      });
      if (err) throw err;
      setUnreadCount(data || 0);
    } catch (err) {
      console.error('useNotifications: fetch unread count failed', err);
      setError(err);
    }
  }, [leagueId]);

  // Fetch notifications from table
  const fetchNotifications = useCallback(async () => {
    if (!leagueId) return;
    try {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('league_notifications')
        .select('*')
        .eq('league_id', leagueId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (err) throw err;
      setNotifications(data || []);
      await fetchUnreadCount();
    } catch (err) {
      console.error('useNotifications: fetch notifications failed', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [leagueId, fetchUnreadCount]);

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Realtime subscription to new notifications
  useEffect(() => {
    if (!leagueId) return;

    const subscription = supabase
      .channel(`notifications:${leagueId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'league_notifications',
          filter: `league_id=eq.${leagueId}`,
        },
        (payload) => {
          // Add new notification to list
          setNotifications((prev) => [payload.new, ...prev]);
          // If it's for current user, increment unread count
          if (!payload.new.is_read) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'league_notifications',
          filter: `league_id=eq.${leagueId}`,
        },
        (payload) => {
          // Update notification in list
          setNotifications((prev) =>
            prev.map((n) => (n.id === payload.new.id ? payload.new : n))
          );
          // Update unread count if is_read changed
          if (payload.old.is_read !== payload.new.is_read) {
            setUnreadCount((prev) =>
              payload.new.is_read ? Math.max(0, prev - 1) : prev + 1
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [leagueId]);

  // Mark single notification as read
  const markAsRead = useCallback(
    async (notificationId) => {
      try {
        const { error: err } = await supabase.rpc('mark_notification_read', {
          p_notification_id: notificationId,
        });
        if (err) throw err;
        // Update local state
        setNotifications((prev) =>
          prev.map((n) => (n.id === notificationId ? { ...n, is_read: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      } catch (err) {
        console.error('useNotifications: mark as read failed', err);
        setError(err);
      }
    },
    []
  );

  // Mark all notifications as read for this league
  const clearAll = useCallback(async () => {
    if (!leagueId) return;
    try {
      const { error: err } = await supabase.rpc('mark_all_notifications_read', {
        p_league_id: leagueId,
      });
      if (err) throw err;
      // Update local state
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error('useNotifications: clear all failed', err);
      setError(err);
    }
  }, [leagueId]);

  // Mark all unread notifications of a given type as read (without touching other types)
  const clearByType = useCallback(async (type) => {
    const targets = notifications.filter(n => n.notification_type === type && !n.is_read);
    for (const n of targets) await markAsRead(n.id);
  }, [notifications, markAsRead]);

  return {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
    clearAll,
    clearByType,
    refetch: fetchNotifications,
  };
}
