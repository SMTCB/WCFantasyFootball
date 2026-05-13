import { useState, useMemo } from 'react';

/**
 * Filters chat messages by search term (case-insensitive substring match).
 * Highlights matching text in results.
 */
export function useMessageSearch(messages = []) {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredMessages = useMemo(() => {
    if (!searchTerm.trim()) return messages;

    const lowerSearch = searchTerm.toLowerCase();
    return messages.filter(msg =>
      !msg.isDeleted && msg.message.toLowerCase().includes(lowerSearch)
    );
  }, [messages, searchTerm]);

  const clearSearch = () => setSearchTerm('');

  return {
    searchTerm,
    setSearchTerm,
    filteredMessages,
    clearSearch,
    resultCount: filteredMessages.length,
  };
}
