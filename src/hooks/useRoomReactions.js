import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export const REACTION_EMOJI = ['👍', '🔥', '😂', '😮'];

// Reactions for every message in one Room channel. One load, then realtime changes
// are applied in place, so a reaction from a friend appears without a refresh.
export function useRoomReactions(channelId, userId) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    if (!channelId) { setRows([]); return; }
    let alive = true;
    supabase
      .from('clubhouse_reactions')
      .select('id, message_id, user_id, emoji, clubhouse_messages!inner(channel_id)')
      .eq('clubhouse_messages.channel_id', channelId)
      .limit(2000)
      .then(({ data }) => {
        if (alive) setRows((data ?? []).map(({ id, message_id, user_id, emoji }) => ({ id, message_id, user_id, emoji })));
      });

    const ch = supabase
      .channel(`room-reactions:${channelId}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'clubhouse_reactions' }, ({ new: r }) => {
        setRows(prev => (prev.some(x => x.id === r.id) ? prev : [...prev, { id: r.id, message_id: r.message_id, user_id: r.user_id, emoji: r.emoji }]));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'clubhouse_reactions' }, ({ old }) => {
        setRows(prev => prev.filter(x => x.id !== old.id));
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [channelId]);

  // message id -> [{ emoji, count, mine }], in the order of REACTION_EMOJI
  const byMessage = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      const list = map.get(r.message_id) ?? [];
      let entry = list.find(e => e.emoji === r.emoji);
      if (!entry) { entry = { emoji: r.emoji, count: 0, mine: false }; list.push(entry); }
      entry.count += 1;
      if (r.user_id === userId) entry.mine = true;
      map.set(r.message_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => REACTION_EMOJI.indexOf(a.emoji) - REACTION_EMOJI.indexOf(b.emoji));
    }
    return map;
  }, [rows, userId]);

  const toggle = useCallback(async (messageId, emoji) => {
    if (!userId) return;
    const mine = rows.find(r => r.message_id === messageId && r.user_id === userId && r.emoji === emoji);
    if (mine) {
      const { error } = await supabase.from('clubhouse_reactions').delete().eq('id', mine.id);
      if (error) throw error;
      setRows(prev => prev.filter(x => x.id !== mine.id));
      return;
    }
    const { data, error } = await supabase
      .from('clubhouse_reactions')
      .insert({ message_id: messageId, user_id: userId, emoji })
      .select('id, message_id, user_id, emoji')
      .single();
    if (error) throw error;
    setRows(prev => (prev.some(x => x.id === data.id) ? prev : [...prev, data]));
  }, [rows, userId]);

  return { byMessage, toggle };
}
