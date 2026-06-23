import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useDirectMessages(circleId, toUserId) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const scrollEndRef = useRef(null);

  const fetchMessages = useCallback(async () => {
    if (!circleId || !toUserId || !user?.id) { setMessages([]); return; }
    setLoading(true);
    try {
      // RLS limits to rows where auth.uid() is a participant.
      // Additional filter: the other party in this conversation is toUserId.
      const { data, error } = await supabase
        .from('direct_messages')
        .select('id, from_user_id, to_user_id, content, created_at, read_at')
        .eq('circle_id', circleId)
        .or(`from_user_id.eq.${toUserId},to_user_id.eq.${toUserId}`)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;

      setMessages((data ?? []).map(m => ({
        id: m.id,
        content: m.content,
        createdAt: m.created_at,
        isOwn: m.from_user_id === user.id,
        readAt: m.read_at,
      })));

      // Mark unread incoming messages as read
      const unread = (data ?? []).filter(m => m.to_user_id === user.id && !m.read_at);
      if (unread.length > 0) {
        supabase
          .from('direct_messages')
          .update({ read_at: new Date().toISOString() })
          .in('id', unread.map(m => m.id))
          .then(null, () => {});
      }
    } catch (err) {
      console.error('useDirectMessages: fetchMessages failed', err);
    } finally {
      setLoading(false);
    }
  }, [circleId, toUserId, user?.id]);

  useEffect(() => {
    fetchMessages();
    if (!circleId || !toUserId || !user?.id) return;

    // Channel key is deterministic regardless of who initiated the DM
    const dmKey = `dm-${circleId}-${[user.id, toUserId].sort().join('-')}`;
    const ch = supabase
      .channel(dmKey)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `circle_id=eq.${circleId}`,
      }, (payload) => {
        const msg = payload.new;
        const isRelevant =
          (msg.from_user_id === user.id && msg.to_user_id === toUserId) ||
          (msg.from_user_id === toUserId && msg.to_user_id === user.id);
        if (!isRelevant) return;

        setMessages(prev => [...prev, {
          id: msg.id,
          content: msg.content,
          createdAt: msg.created_at,
          isOwn: msg.from_user_id === user.id,
          readAt: msg.read_at,
        }]);

        // Auto-mark incoming as read
        if (msg.to_user_id === user.id) {
          supabase
            .from('direct_messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', msg.id)
            .then(null, () => {});
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [circleId, toUserId, fetchMessages, user?.id]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (content) => {
    if (!circleId || !toUserId || !content.trim() || !user?.id) return;
    const { error } = await supabase
      .from('direct_messages')
      .insert({ circle_id: circleId, from_user_id: user.id, to_user_id: toUserId, content: content.trim() });
    if (error) throw error;
  }, [circleId, toUserId, user?.id]);

  return { messages, loading, sendMessage, scrollEndRef };
}
