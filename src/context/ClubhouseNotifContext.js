import { createContext } from 'react';

// Lightweight context — just the count + a reset callback.
// Provider lives in ClubhouseNotifProvider.jsx (keeps supabase/auth out of
// this file so AppLayout can import the context object without TDZ risk).
export const ClubhouseNotifContext = createContext({ unreadCount: 0, resetBadge: () => {} });
