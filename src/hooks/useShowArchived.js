import { useState, useEffect } from 'react';

const KEY = 'ffl_show_archived_leagues';

// Shared, localStorage-backed "show archived leagues" toggle (B-13).
// Default OFF — archived leagues stay hidden from lists/pickers until the
// user explicitly opts in, and the choice persists across screens/sessions.
export function useShowArchived() {
  const [showArchived, setShowArchived] = useState(() => localStorage.getItem(KEY) === 'true');

  useEffect(() => {
    localStorage.setItem(KEY, String(showArchived));
  }, [showArchived]);

  return [showArchived, setShowArchived];
}
