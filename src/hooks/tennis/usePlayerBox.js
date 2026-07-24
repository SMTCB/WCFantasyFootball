import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useSport } from '../../context/SportContext';

const CURRENT_SEASON = 2026;

export function usePlayerBox() {
  const { activePlayerBoxId, setActivePlayerBoxId } = useSport();
  const [myBoxes, setMyBoxes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchMyBoxes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase.rpc('get_my_player_boxes', {
        p_season_year: CURRENT_SEASON,
      });
      if (err) throw err;
      const boxes = data ?? [];
      setMyBoxes(boxes);
      if (boxes.length > 0) {
        const stillExists = boxes.some(b => b.player_box_id === activePlayerBoxId);
        if (!stillExists) setActivePlayerBoxId(boxes[0].player_box_id);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activePlayerBoxId, setActivePlayerBoxId]);

  useEffect(() => { fetchMyBoxes(); }, [fetchMyBoxes]);

  const createPlayerBox = useCallback(async (name, circleId = null) => {
    const { data, error: err } = await supabase.rpc('create_player_box', {
      p_name: name,
      p_season_year: CURRENT_SEASON,
      p_circle_id: circleId,
    });
    if (err) throw err;
    const newId = data?.player_box_id ?? data;
    setActivePlayerBoxId(newId);
    await fetchMyBoxes();
    return newId;
  }, [fetchMyBoxes, setActivePlayerBoxId]);

  const joinByCode = useCallback(async (code) => {
    const { data, error: err } = await supabase.rpc('join_player_box_by_code', {
      p_invite_code: code.trim().toUpperCase(),
    });
    if (err) throw err;
    const newId = data?.player_box_id ?? data;
    setActivePlayerBoxId(newId);
    await fetchMyBoxes();
    return newId;
  }, [fetchMyBoxes, setActivePlayerBoxId]);

  const activeBox = myBoxes.find(b => b.player_box_id === activePlayerBoxId) ?? null;

  return {
    myBoxes,
    activeBox,
    activePlayerBoxId,
    setActivePlayerBoxId,
    createPlayerBox,
    joinByCode,
    loading,
    error,
    refresh: fetchMyBoxes,
  };
}
