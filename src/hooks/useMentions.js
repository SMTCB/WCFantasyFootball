import { useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Handles @mention parsing, autocomplete, and formatting.
 * Detects @username patterns, searches league members, and tracks mentioned user IDs.
 */
export function useMentions(leagueId) {
  const [mentionSearch, setMentionSearch] = useState('');
  const [mentionMatches, setMentionMatches] = useState([]);
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(-1);
  const [mentionedUserIds, setMentionedUserIds] = useState(new Set());
  const [leagueMembers, setLeagueMembers] = useState([]);

  // Load league members for mention autocomplete
  const loadLeagueMembers = useCallback(async () => {
    if (!leagueId) return;
    try {
      const { data, error } = await supabase
        .from('league_members')
        .select(`
          user_id,
          users!inner(id, email, user_metadata)
        `)
        .eq('league_id', leagueId);

      if (error) {
        console.error('useMentions: loadLeagueMembers failed', error);
        return;
      }

      const members = (data || []).map(m => ({
        id: m.user_id,
        name: m.users?.user_metadata?.display_name || m.users?.email?.split('@')[0] || 'User',
        email: m.users?.email,
      }));

      setLeagueMembers(members);
    } catch (err) {
      console.error('useMentions: loadLeagueMembers exception', err);
    }
  }, [leagueId]);

  // Parse message text for @mention pattern
  const parseMentionPattern = useCallback((text) => {
    const mentionMatch = text.match(/@(\w*)$/);
    if (mentionMatch) {
      const searchTerm = mentionMatch[1].toLowerCase();
      setMentionSearch(searchTerm);

      // Filter members by search term
      const matches = leagueMembers.filter(m =>
        m.name.toLowerCase().startsWith(searchTerm) ||
        m.email?.toLowerCase().startsWith(searchTerm)
      );

      setMentionMatches(matches);
      setSelectedMentionIndex(-1);
    } else {
      setMentionSearch('');
      setMentionMatches([]);
    }
  }, [leagueMembers]);

  // Insert selected mention into text
  const insertMention = useCallback((text, member) => {
    if (!member) return text;

    // Replace @search with @username
    const newText = text.replace(/@\w*$/, `@${member.name}`);

    // Add to mentioned users set
    setMentionedUserIds(prev => new Set([...prev, member.id]));

    // Clear mention state
    setMentionSearch('');
    setMentionMatches([]);
    setSelectedMentionIndex(-1);

    return newText;
  }, []);

  // Navigate through mention matches with arrow keys
  const handleMentionNavigate = useCallback((direction) => {
    if (mentionMatches.length === 0) return;

    let newIndex = selectedMentionIndex + direction;
    if (newIndex < -1) newIndex = mentionMatches.length - 1;
    if (newIndex >= mentionMatches.length) newIndex = -1;

    setSelectedMentionIndex(newIndex);
  }, [selectedMentionIndex, mentionMatches.length]);

  // Get selected mention
  const selectedMention = useMemo(() => {
    if (selectedMentionIndex < 0 || selectedMentionIndex >= mentionMatches.length) {
      return null;
    }
    return mentionMatches[selectedMentionIndex];
  }, [selectedMentionIndex, mentionMatches]);

  // Reset mentions after sending
  const resetMentions = useCallback(() => {
    setMentionSearch('');
    setMentionMatches([]);
    setSelectedMentionIndex(-1);
    setMentionedUserIds(new Set());
  }, []);

  return {
    mentionSearch,
    mentionMatches,
    selectedMentionIndex,
    selectedMention,
    mentionedUserIds: Array.from(mentionedUserIds),
    loadLeagueMembers,
    parseMentionPattern,
    insertMention,
    handleMentionNavigate,
    resetMentions,
  };
}
