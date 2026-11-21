import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { watchPresence } from '../lib/presence';

const EMPTY = new Set();

// Who has this clubhouse open right now (MD-5). The clubhouse screen passes
// track: true so the user shows as here; everything else only listens.
export function useHereNow(circleId, { track = false } = {}) {
  const { user } = useAuth();
  const [state, setState] = useState({ circleId: null, ids: EMPTY });
  useEffect(() => {
    if (!circleId || !user?.id) return undefined;
    return watchPresence(circleId, user.id, { track }, ids => setState({ circleId, ids }));
  }, [circleId, user?.id, track]);
  return state.circleId === circleId ? state.ids : EMPTY;
}

// Listen (without being counted) to several clubhouses at once, for Home.
// Returns a Map of circleId -> Set of user ids here now.
export function useHereNowAcross(circleIds) {
  const { user } = useAuth();
  const key = (circleIds ?? []).filter(Boolean).sort().join(',');
  const [byCircle, setByCircle] = useState(() => new Map());
  useEffect(() => {
    if (!key || !user?.id) return undefined;
    const stops = key.split(',').map(id => watchPresence(id, user.id, { track: false }, ids => {
      setByCircle(prev => {
        const next = new Map(prev);
        next.set(id, ids);
        return next;
      });
    }));
    return () => {
      stops.forEach(stop => stop());
      setByCircle(new Map());
    };
  }, [key, user?.id]);
  return byCircle;
}
