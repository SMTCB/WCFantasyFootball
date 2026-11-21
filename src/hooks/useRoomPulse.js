import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uniqueChannelName } from '../lib/livePoints';

// Light reads of the Room (the default channel of a clubhouse) for places that only
// show its latest lines: the members table on a clubhouse (MD-4) and the
// "Across your clubhouses" rail on Home (MD-10). The Room itself keeps useClubhouseChat.

const COLUMNS = 'id, user_id, content, created_at, kind, bet_ref, clubhouse_channels!inner(circle_id, is_default)';

const nameCache = new Map();

async function withNames(rows) {
  const missing = [...new Set(rows.map(r => r.user_id).filter(id => id && !nameCache.has(id)))];
  if (missing.length) {
    const { data } = await supabase.from('users').select('id, username').in('id', missing);
    (data ?? []).forEach(u => nameCache.set(u.id, u.username ?? 'Member'));
  }
  return rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    username: nameCache.get(r.user_id) ?? 'Member',
    content: r.bet_ref?.question ?? r.content,
    kind: r.kind,
    createdAt: r.created_at,
    circleId: r.clubhouse_channels?.circle_id ?? null,
  }));
}

// Latest Room messages in one clubhouse, newest first, plus `fresh`: the message
// that just arrived over realtime (cleared after `freshMs`), for a speech bubble.
export function useRoomPulse(circleId, { limit = 6, freshMs = 6000 } = {}) {
  const [state, setState] = useState({ circleId: null, messages: [], fresh: null });
  const timer = useRef(null);

  useEffect(() => {
    if (!circleId) return undefined;
    let cancelled = false;
    let channel = null;

    (async () => {
      const { data: chans } = await supabase
        .from('clubhouse_channels')
        .select('id, is_default, created_at')
        .eq('circle_id', circleId)
        .order('created_at', { ascending: true });
      if (cancelled || !chans?.length) return;
      const channelId = (chans.find(c => c.is_default) ?? chans[0]).id;

      const { data, error } = await supabase
        .from('clubhouse_messages')
        .select(COLUMNS)
        .eq('channel_id', channelId)
        .is('thread_id', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) { console.error('useRoomPulse: fetch failed', error); return; }
      const messages = await withNames(data ?? []);
      if (cancelled) return;
      setState({ circleId, messages, fresh: null });

      channel = supabase
        .channel(uniqueChannelName(`room-pulse:${channelId}`))
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'clubhouse_messages', filter: `channel_id=eq.${channelId}`,
        }, async ({ new: row }) => {
          if (row.thread_id) return;
          const [msg] = await withNames([{ ...row, clubhouse_channels: { circle_id: circleId } }]);
          if (cancelled) return;
          setState(prev => ({ circleId, messages: [msg, ...prev.messages].slice(0, limit), fresh: msg }));
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setState(prev => ({ ...prev, fresh: null })), freshMs);
        })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      clearTimeout(timer.current);
      if (channel) supabase.removeChannel(channel);
    };
  }, [circleId, limit, freshMs]);

  return state.circleId === circleId ? state : { circleId, messages: [], fresh: null };
}

// Latest Room lines across several clubhouses, newest first, each tagged with its
// clubhouse id. Read once on mount; `refresh` reads again.
export function useRoomAcross(circleIds, { limit = 6 } = {}) {
  const key = (circleIds ?? []).filter(Boolean).sort().join(',');
  const [state, setState] = useState({ key: '', items: [], loading: false });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    (async () => {
      setState(prev => ({ ...prev, loading: true }));
      const { data, error } = await supabase
        .from('clubhouse_messages')
        .select(COLUMNS)
        .in('clubhouse_channels.circle_id', key.split(','))
        .eq('clubhouse_channels.is_default', true)
        .is('thread_id', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) console.error('useRoomAcross: fetch failed', error);
      const items = await withNames(data ?? []);
      if (!cancelled) setState({ key, items, loading: false });
    })();
    return () => { cancelled = true; };
  }, [key, limit, tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  return {
    items: state.key === key ? state.items : [],
    loading: state.loading,
    refresh,
  };
}

// The newest Room line in each of several clubhouses, for the Home clubhouse cards.
// Returns { byCircle: Map circleId -> message, refresh }. Clubhouses with no line are absent.
export function useRoomLatestByCircle(circleIds) {
  const key = [...new Set((circleIds ?? []).filter(Boolean))].sort().join(',');
  const [state, setState] = useState({ key: '', byCircle: new Map() });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    (async () => {
      const ids = key.split(',');
      const results = await Promise.all(ids.map(id => supabase
        .from('clubhouse_messages')
        .select(COLUMNS)
        .eq('clubhouse_channels.circle_id', id)
        .eq('clubhouse_channels.is_default', true)
        .is('thread_id', null)
        .order('created_at', { ascending: false })
        .limit(1)));
      const rows = results.flatMap(r => {
        if (r.error) console.error('useRoomLatestByCircle: fetch failed', r.error);
        return r.data ?? [];
      });
      const messages = await withNames(rows);
      if (!cancelled) setState({ key, byCircle: new Map(messages.map(m => [m.circleId, m])) });
    })();
    return () => { cancelled = true; };
  }, [key, tick]);

  const refresh = useCallback(() => setTick(t => t + 1), []);
  return { byCircle: state.key === key ? state.byCircle : new Map(), refresh };
}

// Usernames for a set of user ids (shares the cache above). Returns a Map id -> name.
export function useUserNames(userIds) {
  const key = [...new Set((userIds ?? []).filter(Boolean))].sort().join(',');
  const [names, setNames] = useState(() => new Map());
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    (async () => {
      const ids = key.split(',');
      await withNames(ids.map(id => ({ user_id: id })));
      if (!cancelled) setNames(new Map(ids.map(id => [id, nameCache.get(id) ?? 'Member'])));
    })();
    return () => { cancelled = true; };
  }, [key]);
  return names;
}
