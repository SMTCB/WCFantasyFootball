import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export const FT_EMOJIS = ['🔥', '💀', '😂', '👑', '😤'];

export function useClubhouseFrontpage(circleId) {
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const [edition,      setEdition]      = useState(null);
  const [reactions,    setReactions]    = useState([]);
  const [comments,     setComments]     = useState([]);
  const [loading,      setLoading]      = useState(false);
  const [refreshTick,  setRefreshTick]  = useState(0);

  useEffect(() => {
    if (!circleId) { setEdition(null); setReactions([]); setComments([]); return; }
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from('frontpage_editions').select('*').eq('circle_id', circleId).eq('edition_date', today).maybeSingle(),
      supabase.from('frontpage_reactions').select('id, section_key, user_id, emoji').eq('circle_id', circleId).eq('edition_date', today),
      supabase.from('frontpage_comments').select('id, section_key, user_id, text, created_at').eq('circle_id', circleId).eq('edition_date', today).order('created_at', { ascending: true }),
    ]).then(([{ data: ed }, { data: rx }, { data: cm }]) => {
      if (cancelled) return;
      setEdition(ed ?? null);
      setReactions(rx ?? []);
      setComments(cm ?? []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [circleId, today, refreshTick]);

  const refresh = useCallback(() => {
    setRefreshTick(t => t + 1);
  }, []);

  const toggleReaction = useCallback(async (sectionKey, emoji) => {
    if (!user || !circleId || !edition) return;
    const existing = reactions.find(
      r => r.section_key === sectionKey && r.user_id === user.id && r.emoji === emoji
    );
    if (existing) {
      setReactions(prev => prev.filter(r => r.id !== existing.id));
      await supabase.from('frontpage_reactions').delete().eq('id', existing.id);
    } else {
      const tempId = `temp-${Date.now()}`;
      setReactions(prev => [...prev, { id: tempId, section_key: sectionKey, user_id: user.id, emoji }]);
      const { data, error } = await supabase
        .from('frontpage_reactions')
        .insert({ circle_id: circleId, edition_date: today, section_key: sectionKey, user_id: user.id, emoji })
        .select('id')
        .single();
      if (error) {
        setReactions(prev => prev.filter(r => r.id !== tempId));
      } else if (data) {
        setReactions(prev => prev.map(r => r.id === tempId ? { ...r, id: data.id } : r));
      }
    }
  }, [user, circleId, today, edition, reactions]);

  const getReactionCounts = useCallback((sectionKey) => {
    const counts = {};
    FT_EMOJIS.forEach(e => { counts[e] = 0; });
    reactions.filter(r => r.section_key === sectionKey).forEach(r => {
      counts[r.emoji] = (counts[r.emoji] ?? 0) + 1;
    });
    return counts;
  }, [reactions]);

  const isMyReaction = useCallback((sectionKey, emoji) => {
    if (!user) return false;
    return reactions.some(r => r.section_key === sectionKey && r.user_id === user.id && r.emoji === emoji);
  }, [user, reactions]);

  const addComment = useCallback(async (sectionKey, text) => {
    if (!user || !circleId || !edition) return { error: 'not_ready' };
    const { data, error } = await supabase
      .from('frontpage_comments')
      .insert({ circle_id: circleId, edition_date: today, section_key: sectionKey, user_id: user.id, text })
      .select('id, section_key, user_id, text, created_at')
      .single();
    if (!error && data) setComments(prev => [...prev, data]);
    return { error };
  }, [user, circleId, today, edition]);

  const deleteComment = useCallback(async (commentId) => {
    await supabase.from('frontpage_comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }, []);

  const getComments = useCallback((sectionKey) => {
    return comments.filter(c => c.section_key === sectionKey);
  }, [comments]);

  return {
    edition,
    loading,
    refresh,
    toggleReaction,
    getReactionCounts,
    isMyReaction,
    addComment,
    deleteComment,
    getComments,
    EMOJIS: FT_EMOJIS,
  };
}
