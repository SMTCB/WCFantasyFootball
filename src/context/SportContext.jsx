import { createContext, useContext, useState, useCallback } from 'react';

const SportContext = createContext(null);

export function SportProvider({ children }) {
  const [activeSport, setActiveSportState] = useState(
    () => localStorage.getItem('activeSport') ?? 'football'
  );
  const [activePaddockId, setActivePaddockIdState] = useState(
    () => localStorage.getItem('activePaddockId') ?? null
  );

  const setActiveSport = useCallback((sport) => {
    localStorage.setItem('activeSport', sport);
    setActiveSportState(sport);
  }, []);

  const setActivePaddockId = useCallback((id) => {
    if (id) localStorage.setItem('activePaddockId', id);
    else localStorage.removeItem('activePaddockId');
    setActivePaddockIdState(id);
  }, []);

  return (
    <SportContext.Provider value={{ activeSport, setActiveSport, activePaddockId, setActivePaddockId }}>
      {children}
    </SportContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSport() {
  const ctx = useContext(SportContext);
  if (!ctx) throw new Error('useSport must be used inside SportProvider');
  return ctx;
}
