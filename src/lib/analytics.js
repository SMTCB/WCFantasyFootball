import { supabase } from './supabase';

/**
 * track(event, props): the one place product events go through (J-09, CODE-5).
 * Writes a row to product_events for the signed-in user. Fire and forget: a failure
 * (signed out, table not there yet) must never break the screen the user is on.
 */
export function track(event, props = {}) {
  console.info('[event]', event, props);
  supabase.from('product_events').insert({ event, props })
    .then(({ error }) => { if (error) console.info('[event] not stored:', error.message); },
          () => {});
}

/** One app_open per device per calendar day, so day-1/7/30 return can be counted. */
export function trackAppOpenOncePerDay() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('clubhouse_last_open') === today) return;
    localStorage.setItem('clubhouse_last_open', today);
    track('app_open');
  } catch { /* storage unavailable: skip */ }
}
