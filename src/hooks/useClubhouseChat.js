import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useClubhouseChat(channelId) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const userMetaCache = useRef({});
  const scrollEndRef = useRef(null);

  const resolveUsername = useCallback(async (userId) => {
    if (userMetaCache.current[userId]) return userMetaCache.current[userId];
    const { data } = await supabase.from('users').select('username').eq('id', userId).maybeSingle();
    const name = data?.username ?? '?';
    if (userId) userMetaCache.current[userId] = name;
    return name;
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!channelId) { setMessages([]); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clubhouse_messages')
        .select('id, user_id, content, created_at')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: true })
        .limit(100);
      if (error) throw error;

      const uncachedIds = [...new Set((data ?? []).map(m => m.user_id).filter(id => id && !userMetaCache.current[id]))];
      if (uncachedIds.length > 0) {
        const { data: users } = await supabase.from('users').select('id, username').in('id', uncachedIds);
        (users ?? []).forEach(u => { userMetaCache.current[u.id] = u.username ?? '?'; });
      }

      setMessages((data ?? []).map(m => ({
        id: m.id,
        userId: m.user_id,
        username: userMetaCache.current[m.user_id] ?? '?',
        content: m.content,
        createdAt: m.created_at,
        isOwn: m.user_id === user?.id,
      })));
    } catch (err) {
      console.error('useClubhouseChat: fetchMessages failed', err);
    } finally {
      setLoading(false);
    }
  }, [channelId, user?.id]);

  useEffect(() => {
    fetchMessages();
    if (!channelId) return;

    const ch = supabase
      .channel(`clubhouse-msgs-${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'clubhouse_messages',
        filter: `channel_id=eq.${channelId}`,
      }, async (payload) => {
        const msg = payload.new;
        const username = await resolveUsername(msg.user_id);
        setMessages(prev => [...prev, {
          id: msg.id,
          userId: msg.user_id,
          username,
          content: msg.content,
          createdAt: msg.created_at,
          isOwn: msg.user_id === user?.id,
        }]);
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [channelId, fetchMessages, resolveUsername, user?.id]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (content) => {
    if (!channelId || !content.trim() || !user?.id) return;
    const { error } = await supabase
      .from('clubhouse_messages')
      .insert({ channel_id: channelId, user_id: user.id, content: content.trim() });
    if (error) throw error;
  }, [channelId, user?.id]);

  const deleteMessage = useCallback(async (messageId) => {
    const { error } = await supabase.from('clubhouse_messages').delete().eq('id', messageId);
    if (error) throw error;
    setMessages(prev => prev.filter(m => m.id !== messageId));
  }, []);

  return { messages, loading, sendMessage, deleteMessage, scrollEndRef };
}
