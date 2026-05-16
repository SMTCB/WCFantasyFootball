import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

/**
 * Manages league chat messages with realtime updates.
 * Provides messages array, loading state, send function, unread count, typing indicators, and auto-scroll ref.
 */
export function useChatMessages(leagueId) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState({}); // { userId: { name, typingAt } }
  const scrollEndRef = useRef(null);
  const subscriptionRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const typingChannelRef = useRef(null);
  // Cache user display info keyed by user_id — eliminates N+1 on Realtime events.
  // Populated from the initial loadMessages join; fetched on-demand for new authors.
  const userMetaCache = useRef({});

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
          is_deleted,
          edited_at,
          users!inner(id, email, user_metadata)
        `)
        .eq('league_id', leagueId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('useChatMessages: loadMessages failed', error);
        return;
      }

      const formattedMsgs = (msgs || []).map(msg => {
        const displayName = msg.users?.user_metadata?.display_name || msg.users?.email?.split('@')[0] || 'Unknown';
        const rank = msg.users?.user_metadata?.rank || '—';
        // Seed cache from join data so Realtime callbacks don't need to refetch known authors
        if (msg.user_id) userMetaCache.current[msg.user_id] = { displayName, rank };
        return {
          id: msg.id,
          userId: msg.user_id,
          userName: displayName,
          userRank: rank,
          message: msg.message,
          createdAt: msg.created_at,
          isDeleted: msg.is_deleted,
          editedAt: msg.edited_at,
          isOwnMessage: msg.user_id === user?.id,
        };
      });

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

  // Broadcast typing status via Realtime
  const broadcastTyping = useCallback(() => {
    if (!leagueId || !user?.id || !typingChannelRef.current) return;

    try {
      typingChannelRef.current.send({
        type: 'broadcast',
        event: 'typing',
        payload: {
          userId: user.id,
          userName: user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
        },
      });

      // Reset typing timeout
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        if (typingChannelRef.current) {
          typingChannelRef.current.send({
            type: 'broadcast',
            event: 'typing_stop',
            payload: { userId: user.id },
          });
        }
      }, 3000); // Clear after 3 seconds of inactivity
    } catch (err) {
      console.error('useChatMessages: broadcastTyping error', err);
    }
  }, [leagueId, user?.id, user?.email, user?.user_metadata]);

  // Setup realtime subscription on mount
  useEffect(() => {
    loadMessages();
    fetchUnreadCount();

    if (!leagueId) return;

    // Subscribe to new messages and typing status
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
          const newMsg = payload.new;

          // Check cache first — eliminates N+1 for known authors
          let meta = userMetaCache.current[newMsg.user_id];
          if (!meta) {
            const { data: userData } = await supabase
              .from('users')
              .select('user_metadata, email')
              .eq('id', newMsg.user_id)
              .single()
              .catch(() => ({ data: null }));
            meta = {
              displayName: userData?.user_metadata?.display_name || userData?.email?.split('@')[0] || 'Unknown',
              rank: userData?.user_metadata?.rank || '—',
            };
            if (newMsg.user_id) userMetaCache.current[newMsg.user_id] = meta;
          }

          const userName = meta.displayName;
          const userRank = meta.rank;

          setMessages(prev => [...prev, {
            id: newMsg.id,
            userId: newMsg.user_id,
            userName,
            userRank,
            message: newMsg.message,
            createdAt: newMsg.created_at,
            isDeleted: newMsg.is_deleted,
            editedAt: newMsg.edited_at,
            isOwnMessage: newMsg.user_id === user?.id,
          }]);
        }
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        const { userId, userName } = payload.payload;
        if (userId === user?.id) return; // Don't show own typing
        setTypingUsers(prev => ({
          ...prev,
          [userId]: { name: userName, typingAt: Date.now() },
        }));
      })
      .on('broadcast', { event: 'typing_stop' }, (payload) => {
        const { userId } = payload.payload;
        setTypingUsers(prev => {
          const updated = { ...prev };
          delete updated[userId];
          return updated;
        });
      })
      .subscribe();

    subscriptionRef.current = channel;
    typingChannelRef.current = channel;

    return () => {
      if (subscriptionRef.current) {
        supabase.removeChannel(subscriptionRef.current);
      }
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [leagueId, loadMessages, user?.id, fetchUnreadCount]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Send a message
  const sendMessage = useCallback(async (messageText, mentionedUserIds = []) => {
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
          mentioned_user_ids: mentionedUserIds.length > 0 ? mentionedUserIds : [],
        }])
        .select()
        .single();

      if (error) {
        console.error('useChatMessages: sendMessage failed', error);
        return { ok: false, error: error.message };
      }

      return { ok: true };
    } catch (err) {
      console.error('useChatMessages: sendMessage exception', err);
      return { ok: false, error: err.message };
    }
  }, [leagueId, user?.id]);

  // Edit a message
  const editMessage = useCallback(async (messageId, newText) => {
    if (!newText.trim()) return { ok: false, error: 'Message cannot be empty' };

    try {
      const { error } = await supabase.rpc('edit_chat_message', {
        p_message_id: messageId,
        p_new_text: newText.trim(),
      });

      if (error) {
        console.error('useChatMessages: editMessage failed', error);
        return { ok: false, error: error.message };
      }

      // Update local message state
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, message: newText.trim(), editedAt: new Date().toISOString() } : m
      ));

      return { ok: true };
    } catch (err) {
      console.error('useChatMessages: editMessage exception', err);
      return { ok: false, error: err.message };
    }
  }, []);

  // Delete a message
  const deleteMessage = useCallback(async (messageId) => {
    try {
      const { error } = await supabase.rpc('delete_chat_message', {
        p_message_id: messageId,
      });

      if (error) {
        console.error('useChatMessages: deleteMessage failed', error);
        return { ok: false, error: error.message };
      }

      // Update local message state to show as deleted
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, isDeleted: true } : m
      ));

      return { ok: true };
    } catch (err) {
      console.error('useChatMessages: deleteMessage exception', err);
      return { ok: false, error: err.message };
    }
  }, []);

  return {
    messages,
    loading,
    unreadCount,
    typingUsers,
    sendMessage,
    editMessage,
    deleteMessage,
    broadcastTyping,
    markChatAsRead,
    scrollEndRef,
  };
}
