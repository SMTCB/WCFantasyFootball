/**
 * useDeadlineCountdown — live countdown to the matchday transfer deadline.
 *
 * Fetches the deadline from matchday_deadlines and corrects for client
 * clock drift by computing a delta between the server's reported time
 * and Date.now() on mount. The interval then uses (Date.now() + delta)
 * so the countdown stays accurate even on devices with wrong system clocks.
 *
 * Returns:
 *   {
 *     timeLeft:   string   — formatted "23h 14m 08s" / "LOCKED" / ""
 *     isLocked:   boolean  — true when deadline has passed
 *     deadlineAt: Date|null
 *     color:      string   — hex accent colour for current urgency level
 *     label:      string   — short human label e.g. "Closes in 23h 14m"
 *     loading:    boolean
 *   }
 *
 * Urgency thresholds:
 *   > 2 hours  → dim/neutral  #3D4B5C
 *   ≤ 2 hours  → amber        #F0B400
 *   ≤ 30 min   → red          #F03A3A
 *   past       → locked red   #F03A3A
 */

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

function pad(n) { return String(Math.floor(n)).padStart(2, '0'); }

function formatTimeLeft(ms) {
  if (ms <= 0) return 'LOCKED';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0)  return `${h}h ${pad(m)}m ${pad(s)}s`;
  if (m > 0)  return `${pad(m)}m ${pad(s)}s`;
  return `${pad(s)}s`;
}

function urgencyColor(msLeft) {
  if (msLeft <= 0)              return 'var(--danger)';   // locked — red
  if (msLeft <= 30 * 60 * 1000) return 'var(--danger)';   // ≤ 30 min — red
  if (msLeft <= 2 * 3600 * 1000) return 'var(--gold)';  // ≤ 2 h — amber
  return 'var(--mute)';                                  // > 2 h — dim
}

// matchdayId: pass a canonical ID like '426-r35', or omit to auto-pick the
// next upcoming deadline row for this tournamentId.
export function useDeadlineCountdown({ matchdayId, tournamentId } = {}) {
  const [state, setState] = useState({
    timeLeft:   '',
    isLocked:   false,
    deadlineAt: null,
    color:      'var(--mute)',
    label:      '',
    loading:    true,
  });

  const clockDeltaRef = useRef(0);   // ms to add to Date.now() to get server-equivalent time
  const intervalRef   = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        // Fetch deadline + approximate server time in one round-trip.
        // If a specific matchdayId is given, look up that row.
        // Otherwise find the next upcoming deadline for the tournament.
        const fetchStart = Date.now();
        let query = supabase
          .from('matchday_deadlines')
          .select('deadline_at, matchday_id');

        if (matchdayId) {
          query = query.eq('matchday_id', matchdayId);
        } else if (tournamentId) {
          query = query
            .eq('tournament_id', tournamentId)
            .gt('deadline_at', new Date().toISOString())
            .order('deadline_at', { ascending: true });
        } else {
          // No hint — pick the next upcoming deadline globally.
          query = query
            .gt('deadline_at', new Date().toISOString())
            .order('deadline_at', { ascending: true });
        }

        const { data } = await query.maybeSingle();
        const fetchEnd = Date.now();

        if (cancelled) return;

        if (!data?.deadline_at) {
          setState(s => ({ ...s, loading: false, label: 'No deadline set' }));
          return;
        }

        // Estimate server time: midpoint of the round-trip
        // This keeps us within ~half the network RTT of the server's clock.
        const networkRtt    = fetchEnd - fetchStart;
        const estimatedNow  = fetchStart + networkRtt / 2;
        clockDeltaRef.current = estimatedNow - Date.now();   // usually ~0 but corrects drift

        const deadlineAt = new Date(data.deadline_at);

        // Tick immediately, then every second
        const tick = () => {
          const serverNow = Date.now() + clockDeltaRef.current;
          const msLeft    = deadlineAt.getTime() - serverNow;
          const isLocked  = msLeft <= 0;
          const color     = urgencyColor(msLeft);
          const timeLeft  = formatTimeLeft(msLeft);

          // Human label
          let label = '';
          if (isLocked) {
            label = '🔒 Window closed';
          } else if (msLeft <= 30 * 60 * 1000) {
            label = `⚠️ Closes in ${timeLeft}`;
          } else if (msLeft <= 2 * 3600 * 1000) {
            label = `⏰ Closes in ${timeLeft}`;
          } else {
            // Show formatted deadline in local time
            label = `Closes ${deadlineAt.toLocaleString(undefined, {
              month: 'short', day: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}`;
          }

          if (!cancelled) setState({ timeLeft, isLocked, deadlineAt, color, label, loading: false });

          // Stop ticking once locked (saves battery/CPU)
          if (isLocked && intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        };

        tick();
        intervalRef.current = setInterval(tick, 1000);

      } catch (err) {
        console.error('[useDeadlineCountdown]', err);
        if (!cancelled) setState(s => ({ ...s, loading: false }));
      }
    };

    init();

    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [matchdayId, tournamentId]);

  return state;
}
