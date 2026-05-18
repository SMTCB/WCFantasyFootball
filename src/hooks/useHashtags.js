import { useMemo } from 'react';

/**
 * Extract and rank hashtags from chat messages.
 * Returns sorted list of trending hashtags by frequency.
 */
export function useHashtags(messages) {
  return useMemo(() => {
    const hashtagMap = {};

    messages.forEach(msg => {
      if (msg.isDeleted || !msg.message) return;

      // Extract all hashtags (#word)
      const matches = msg.message.match(/#\w+/g);
      if (matches) {
        matches.forEach(tag => {
          hashtagMap[tag] = (hashtagMap[tag] || 0) + 1;
        });
      }
    });

    // Sort by frequency (descending), then alphabetically
    return Object.entries(hashtagMap)
      .sort(([tagA, countA], [tagB, countB]) => countB - countA || tagA.localeCompare(tagB))
      .map(([tag, count]) => ({ tag, count }));
  }, [messages]);
}
