import { createContext, useContext, useState, useCallback } from 'react';

const SportContext = createContext(null);

export function SportProvider({ children }) {
  const [activePaddockId, setActivePaddockIdState] = useState(
    () => localStorage.getItem('activePaddockId') ?? null
  );
  const [activePlayerBoxId, setActivePlayerBoxIdState] = useState(
    () => localStorage.getItem('activePlayerBoxId') ?? null
  );

  const setActivePaddockId = useCallback((id) => {
    if (id) localStorage.setItem('activePaddockId', id);
    else localStorage.removeItem('activePaddockId');
    setActivePaddockIdState(id);
  }, []);

  const setActivePlayerBoxId = useCallback((id) => {
    if (id) localStorage.setItem('activePlayerBoxId', id);
    else localStorage.removeItem('activePlayerBoxId');
    setActivePlayerBoxIdState(id);
  }, []);

  return (
    <SportContext.Provider value={{
      activePaddockId, setActivePaddockId,
      activePlayerBoxId, setActivePlayerBoxId,
    }}>
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
