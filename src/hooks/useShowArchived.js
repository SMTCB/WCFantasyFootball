import { useState, useEffect } from 'react';

const DEFAULT_KEY = 'ffl_show_archived_leagues';

// Shared, localStorage-backed "show archived" toggle (B-13 / B-13-F1 / B-13-TENNIS).
// Default OFF — archived competitions stay hidden from lists/pickers until the
// user explicitly opts in, and the choice persists across screens/sessions.
// Pass a distinct `key` per competition type (leagues/paddocks/player boxes)
// so each sport remembers its own show/hide preference independently.
export function useShowArchived(key = DEFAULT_KEY) {
  const [showArchived, setShowArchived] = useState(() => localStorage.getItem(key) === 'true');

  useEffect(() => {
    localStorage.setItem(key, String(showArchived));
  }, [key, showArchived]);

  return [showArchived, setShowArchived];
}
