import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

let cachePromise = null;

function fetchClubLogos() {
  if (!cachePromise) {
    cachePromise = supabase
      .from('club_logos')
      .select('name, logo_url')
      .then(({ data, error }) => {
        if (error || !data) return {};
        return Object.fromEntries(data.map(r => [r.name, r.logo_url]));
      });
  }
  return cachePromise;
}

/**
 * Resolves club/country name -> badge image URL from the club_logos table.
 * Fetched once per session (84 rows, rarely changes) and shared across callers.
 * Returns null while loading, then a { [name]: logo_url } map.
 */
export function useClubLogos() {
  const [map, setMap] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchClubLogos().then(m => { if (alive) setMap(m); });
    return () => { alive = false; };
  }, []);

  return map;
}
