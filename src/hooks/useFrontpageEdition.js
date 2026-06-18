import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export const FT_EMOJIS = ['🔥', '💀', '😂', '👑', '😤'];

export function useFrontpageEdition(leagueId) {
  const { user } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  const [edition,     setEdition]     = useState(null);
  const [reactions,   setReactions]   = useState([]);
  const [comments,    setComments]    = useState([]);
  const [pinnedQuote, setPinnedQuote] = useState({ text: null, author: null });

  useEffect(() => {
    if (!leagueId) return;

    supabase
      .from('frontpage_editions')
      .select('*')
      .eq('league_id', leagueId)
      .eq('edition_date', today)
      .maybeSingle()
      .then(({ data }) => setEdition(data ?? null));

    supabase
      .from('frontpage_reactions')
      .select('id, section_key, user_id, emoji')
      .eq('league_id', leagueId)
      .eq('edition_date', today)
      .then(({ data }) => setReactions(data ?? []));

    supabase
      .from('frontpage_comments')
      .select('id, section_key, user_id, text, created_at')
      .eq('league_id', leagueId)
      .eq('edition_date', today)
      .order('created_at', { ascending: true })
      .then(({ data }) => setComments(data ?? []));

    supabase
      .from('league_config')
      .select('config_key, config_value')
      .eq('league_id', leagueId)
      .in('config_key', ['frontpage_pinned_quote', 'frontpage_pinned_quote_author'])
      .then(({ data }) => {
        if (data) {
          const text   = data.find(r => r.config_key === 'frontpage_pinned_quote')?.config_value;
          const author = data.find(r => r.config_key === 'frontpage_pinned_quote_author')?.config_value;
          setPinnedQuote({ text: text ?? null, author: author ?? null });
        }
      });
  }, [leagueId, today]);

  const toggleReaction = useCallback(async (sectionKey, emoji) => {
    if (!user || !leagueId || !edition) return;
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
        .insert({ league_id: leagueId, edition_date: today, section_key: sectionKey, user_id: user.id, emoji })
        .select('id')
        .single();
      if (error) {
        setReactions(prev => prev.filter(r => r.id !== tempId));
      } else if (data) {
        setReactions(prev => prev.map(r => r.id === tempId ? { ...r, id: data.id } : r));
      }
    }
  }, [user, leagueId, today, edition, reactions]);

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
    if (!user || !leagueId || !edition) return { error: 'not_ready' };
    const { data, error } = await supabase
      .from('frontpage_comments')
      .insert({ league_id: leagueId, edition_date: today, section_key: sectionKey, user_id: user.id, text })
      .select('id, section_key, user_id, text, created_at')
      .single();
    if (!error && data) setComments(prev => [...prev, data]);
    return { error };
  }, [user, leagueId, today, edition]);

  const deleteComment = useCallback(async (commentId) => {
    await supabase.from('frontpage_comments').delete().eq('id', commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
  }, []);

  const getComments = useCallback((sectionKey) => {
    return comments.filter(c => c.section_key === sectionKey);
  }, [comments]);

  const commentCount = useCallback((sectionKey) => {
    return comments.filter(c => c.section_key === sectionKey).length;
  }, [comments]);

  return {
    edition,
    pinnedQuote,
    toggleReaction,
    getReactionCounts,
    isMyReaction,
    addComment,
    deleteComment,
    getComments,
    commentCount,
    EMOJIS: FT_EMOJIS,
  };
}
