import { supabase } from './supabase';

// "Here now" for a clubhouse (MD-5): Supabase Realtime Presence on one channel per
// clubhouse, `clubhouse-presence:<circleId>`. Everyone in the clubhouse must join the
// same topic, so unlike every other channel in the app this name has no per-mount
// suffix. That makes a second supabase.channel() call with the same name dangerous
// (it returns the live channel and .on() throws), so every caller goes through this
// module, which keeps one shared channel per clubhouse and counts who is using it.
//
// Presence only says who has the clubhouse screen open. It says nothing stronger.

const LINGER_MS = 3000; // keep the channel briefly after the last watcher leaves, so a route change reuses it
const entries = new Map();

function topicFor(circleId) {
  return `clubhouse-presence:${circleId}`;
}

function idsFrom(channel) {
  return new Set(Object.keys(channel.presenceState() ?? {}));
}

function syncTracking(entry) {
  if (!entry.subscribed) return;
  const want = entry.trackers > 0;
  if (want && !entry.tracking) {
    entry.tracking = true;
    entry.channel.track({ user_id: entry.userId, at: new Date().toISOString() });
  } else if (!want && entry.tracking) {
    entry.tracking = false;
    entry.channel.untrack();
  }
}

function openEntry(circleId, userId) {
  const entry = { userId, listeners: new Set(), trackers: 0, tracking: false, subscribed: false, ids: new Set(), closeTimer: null, channel: null };
  entry.channel = supabase
    .channel(topicFor(circleId), { config: { presence: { key: userId } } })
    .on('presence', { event: 'sync' }, () => {
      entry.ids = idsFrom(entry.channel);
      entry.listeners.forEach(fn => fn(entry.ids));
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') {
        entry.subscribed = true;
        entry.tracking = false;
        syncTracking(entry);
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        entry.subscribed = false;
        entry.tracking = false;
      }
    });
  entries.set(circleId, entry);
  return entry;
}

// Watch who is here now in a clubhouse. `track: true` also marks this user as here
// (only the clubhouse screen does that). Returns a function that stops watching.
export function watchPresence(circleId, userId, { track = false } = {}, onChange) {
  if (!circleId || !userId) return () => {};
  let entry = entries.get(circleId);
  if (entry && entry.userId !== userId) {
    // a different signed-in user on this client: start over with their key
    clearTimeout(entry.closeTimer);
    supabase.removeChannel(entry.channel);
    entries.delete(circleId);
    entry = null;
  }
  if (!entry) entry = openEntry(circleId, userId);
  clearTimeout(entry.closeTimer);
  entry.closeTimer = null;

  entry.listeners.add(onChange);
  if (track) entry.trackers += 1;
  syncTracking(entry);
  onChange(entry.ids);

  return () => {
    entry.listeners.delete(onChange);
    if (track) entry.trackers = Math.max(0, entry.trackers - 1);
    syncTracking(entry);
    if (entry.listeners.size === 0) {
      entry.closeTimer = setTimeout(() => {
        if (entry.listeners.size > 0 || entries.get(circleId) !== entry) return;
        entries.delete(circleId);
        supabase.removeChannel(entry.channel);
      }, LINGER_MS);
    }
  };
}
