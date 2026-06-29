import { ClubhouseContext } from './ClubhouseContext';
import { useClubhouse } from '../hooks/useClubhouse';

export function ClubhouseProvider({ children }) {
  const clubhouse = useClubhouse();
  return (
    <ClubhouseContext.Provider value={clubhouse}>
      {children}
    </ClubhouseContext.Provider>
  );
}
