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
    console.log('[useChatMessages] loadMessages called for league:', leagueId);
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
          users!inner(id, username)
        `)
        .eq('league_id', leagueId)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('useChatMessages: loadMessages failed', error);
        return;
      }

      console.log('[useChatMessages] Loaded', (msgs || []).length, 'messages from database');
      const formattedMsgs = (msgs || []).map(msg => {
        const displayName = msg.users?.username || 'Unknown';
        // Seed cache from join data so Realtime callbacks don't need to refetch known authors
        if (msg.user_id) userMetaCache.current[msg.user_id] = { displayName };
        return {
          id: msg.id,
          userId: msg.user_id,
          userName: displayName,
          message: msg.message,
          createdAt: msg.created_at,
          isDeleted: msg.is_deleted,
          editedAt: msg.edited_at,
          isOwnMessage: msg.user_id === user?.id,
        };
      });

      console.log('[useChatMessages] Setting messages state with', formattedMsgs.length, 'formatted messages');
      console.log('[useChatMessages] Message IDs:', formattedMsgs.map(m => m.id).join(', '));
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
          userName: user.user_metadata?.display_name || user.username || 'User',
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
  }, [leagueId, user?.id, user?.username, user?.user_metadata]);

  // Setup realtime subscription on mount
  useEffect(() => {
    console.log('[useChatMessages] useEffect: Setting up chat for league:', leagueId);
    loadMessages();
    fetchUnreadCount();

    if (!leagueId) return;

    // Subscribe to new messages and typing status
    console.log('[useChatMessages] Creating Realtime channel for league:', leagueId);
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
          console.log('[useChatMessages] Realtime INSERT event received:', payload.new);
          const newMsg = payload.new;

          // Check cache first — eliminates N+1 for known authors
          let meta = userMetaCache.current[newMsg.user_id];
          if (!meta) {
            console.log('[useChatMessages] Fetching user metadata for user:', newMsg.user_id);
            const { data: userData } = await supabase
              .from('users')
              .select('username')
              .eq('id', newMsg.user_id)
              .single()
              .catch(() => ({ data: null }));
            meta = {
              displayName: userData?.username || 'Unknown',
            };
            if (newMsg.user_id) userMetaCache.current[newMsg.user_id] = meta;
          }

          const userName = meta.displayName;

          console.log('[useChatMessages] Adding new message to state:', { id: newMsg.id, userName, message: newMsg.message });
          setMessages(prev => {
            const updated = [...prev, {
              id: newMsg.id,
              userId: newMsg.user_id,
              userName,
              message: newMsg.message,
              createdAt: newMsg.created_at,
              isDeleted: newMsg.is_deleted,
              editedAt: newMsg.edited_at,
              isOwnMessage: newMsg.user_id === user?.id,
            }];
            console.log('[useChatMessages] Messages state updated, total count:', updated.length);
            return updated;
          });
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
      .subscribe((status, err) => {
        console.log('[useChatMessages] Realtime subscription status:', status, 'error:', err);
        if (status === 'SUBSCRIBED') {
          console.log('[useChatMessages] ✓ Successfully subscribed to chat channel for league:', leagueId);
        } else {
          console.warn('[useChatMessages] ✗ Subscription failed or closed for league:', leagueId);
        }
      });

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

  // Fallback: Periodically requery messages if Realtime fails (poll every 3 seconds)
  useEffect(() => {
    if (!leagueId) return;
    console.log('[useChatMessages] Setting up polling interval (3s)');
    const pollInterval = setInterval(() => {
      console.log('[useChatMessages] Polling: calling loadMessages');
      loadMessages();
    }, 3000);
    return () => clearInterval(pollInterval);
  }, [leagueId, loadMessages]);

  // Send a message
  const sendMessage = useCallback(async (messageText, mentionedUserIds = []) => {
    if (!leagueId || !user?.id || !messageText.trim()) {
      console.warn('[useChatMessages] sendMessage: Invalid input', { leagueId, userId: user?.id, msgLength: messageText?.trim?.()?.length });
      return { ok: false, error: 'Invalid input' };
    }

    try {
      console.log('[useChatMessages] Sending message:', { leagueId, userId: user.id, message: messageText.trim() });
      const { data, error } = await supabase
        .from('chat_messages')
        .insert([{
          league_id: leagueId,
          user_id: user.id,
          message: messageText.trim(),
          mentioned_user_ids: mentionedUserIds.length > 0 ? mentionedUserIds : [],
        }]);

      if (error) {
        console.error('[useChatMessages] sendMessage failed - Supabase error:', { code: error.code, message: error.message, details: error.details, hint: error.hint });
        return { ok: false, error: error.message };
      }

      console.log('[useChatMessages] Message sent successfully, data:', data);
      console.log('[useChatMessages] Current messages count:', messages.length);
      return { ok: true };
    } catch (err) {
      console.error('[useChatMessages] sendMessage exception:', err);
      return { ok: false, error: err.message };
    }
  }, [leagueId, user?.id, messages.length]);

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
