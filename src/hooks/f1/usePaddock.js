import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useSport } from '../../context/SportContext';

export function usePaddock() {
  const { activePaddockId, setActivePaddockId } = useSport();
  const [myPaddocks, setMyPaddocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMyPaddocks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_my_paddocks');
      if (err) throw err;
      setMyPaddocks(data ?? []);
      // Auto-select first paddock if active one is gone
      if (data?.length > 0) {
        const stillExists = data.some(p => p.paddock_id === activePaddockId);
        if (!stillExists) setActivePaddockId(data[0].paddock_id);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activePaddockId, setActivePaddockId]);

  useEffect(() => { fetchMyPaddocks(); }, [fetchMyPaddocks]);

  const createPaddock = useCallback(async (name, circleId = null) => {
    const { data, error: err } = await supabase.rpc('create_paddock', {
      p_name: name,
      p_circle_id: circleId,
    });
    if (err) throw err;
    setActivePaddockId(data);
    await fetchMyPaddocks();
    return data;
  }, [fetchMyPaddocks, setActivePaddockId]);

  const joinPaddockByCode = useCallback(async (code) => {
    const { data, error: err } = await supabase.rpc('join_paddock_by_code', { p_code: code.trim().toUpperCase() });
    if (err) throw err;
    setActivePaddockId(data);
    await fetchMyPaddocks();
    return data;
  }, [fetchMyPaddocks, setActivePaddockId]);

  const activePaddock = myPaddocks.find(p => p.paddock_id === activePaddockId) ?? null;

  return {
    myPaddocks,
    activePaddock,
    activePaddockId,
    setActivePaddockId,
    createPaddock,
    joinPaddockByCode,
    loading,
    error,
    refresh: fetchMyPaddocks,
  };
}
