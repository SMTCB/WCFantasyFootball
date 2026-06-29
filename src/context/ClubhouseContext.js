import { createContext, useContext } from 'react';

export const ClubhouseContext = createContext(null);

export function useClubhouseContext() {
  const ctx = useContext(ClubhouseContext);
  if (!ctx) throw new Error('useClubhouseContext must be used inside ClubhouseProvider');
  return ctx;
}
