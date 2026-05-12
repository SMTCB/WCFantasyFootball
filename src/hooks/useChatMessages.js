import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Manages league chat messages with realtime updates.
 * Provides messages array, loading state, send function, unread count, and auto-scroll ref.
 */
export function useChatMessages(leagueId) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const scrollEndRef = useRef(null);
  const subscriptionRef = useRef(null);

  // Scroll to latest message
  const scrollToBottom = useCallback(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Fetch unread message count
  const fetchUnreadCount = useCallback(async () => {
    if (!leagueId) return;
    try {
      const { data, error } = await supabase.rpc('get_unread_chat_count', {
        p_league_id: leagueId,
      });

      if (error) {
        console.error('useChatMessages: fetchUnreadCount failed', error);
        return;
      }

      setUnreadCount(data || 0);
    } catch (err) {
      console.error('useChatMessages: fetchUnreadCount exception', err);
    }
  }, [leagueId]);

  // Load initial chat history
  const loadMessages = useCallback(async () => {
    if (!leagueId) return;
    setLoading(true);
    try {
      const { data: msgs, error } = await supabase
        .from('chat_messages')
        .select(`
          id,
          league_id,
          user_id,
          message,
          created_at,
          users!inner(id, email, user_metadata)
        `)
        .eq('league_id', leagueId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('useChatMessages: loadMessages failed', error);
        return;
      }

      const formattedMsgs = (msgs || []).map(msg => ({
        id: msg.id,
        userId: msg.user_id,
        userName: msg.users?.user_metadata?.display_name || msg.users?.email?.split('@')[0] || 'Unknown',
        userRank: msg.users?.user_metadata?.rank || '—',
        message: msg.message,
        createdAt: msg.created_at,
        isOwnMessage: msg.user_id === user?.id,
      }));

      setMessages(formattedMsgs);
    } catch (err) {
      console.error('useChatMessages: loadMessages exception', err);
    } finally {
      setLoading(false);
    }
  }, [leagueId, user?.id]);

  // Mark chat as read
  const markChatAsRead = useCallback(async () => {
    if (!leagueId) return;
    try {
      const { error } = await supabase.rpc('mark_league_chat_read', {
        p_league_id: leagueId,
      });

      if (error) {
        console.error('useChatMessages: markChatAsRead failed', error);
        return;
      }

      setUnreadCount(0);
    } catch (err) {
      console.error('useChatMessages: markChatAsRead exception', err);
    }
  }, [leagueId]);

  // Setup realtime subscription on mount
  useEffect(() => {
    loadMessages();
    fetchUnreadCount();

    if (!leagueId) return;

    // Subscribe to new messages
    const channel = supabase
      .channel(`chat:${leagueId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `league_id=eq.${leagueId}`,
        },
        async (payload) => {
          // New message arrived — fetch full user data for this message
          const newMsg = payload.new;

          // Fetch user metadata for this message
          const { data: userData } = await supabase
            .from('users')
            .select('user_metadata')
            .eq('id', newMsg.user_id)
            .single()
            .catch(() => ({ data: null }));

          const userName = userData?.user_metadata?.display_name || 'Unknown';
          const userRank = userData?.user_metadata?.rank || '—';

          setMessages(prev => [...prev, {
            id: newMsg.id,
            userId: newMsg.user_id,
            userName,
            userRank,
            message: newMsg.message,
            createdAt: newMsg.created_at,
            isOwnMessage: newMsg.user_id === user?.id,
          }]);
        }
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
    };
  }, [leagueId, loadMessages, user?.id, fetchUnreadCount]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Send a message
  const sendMessage = useCallback(async (messageText) => {
    if (!leagueId || !user?.id || !messageText.trim()) {
      return { ok: false, error: 'Invalid input' };
    }

    try {
      const { error } = await supabase
        .from('chat_messages')
        .insert([{
          league_id: leagueId,
          user_id: user.id,
          message: messageText.trim(),
        }])
        .select()
        .single();

      if (error) {
        console.error('useChatMessages: sendMessage failed', error);
        return { ok: false, error: error.message };
      }

      // Message will be added via realtime subscription
      return { ok: true };
    } catch (err) {
      console.error('useChatMessages: sendMessage exception', err);
      return { ok: false, error: err.message };
    }
  }, [leagueId, user?.id]);

  return {
    messages,
    loading,
    unreadCount,
    sendMessage,
    markChatAsRead,
    scrollEndRef,
  };
}
