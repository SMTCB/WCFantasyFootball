import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useClubhouse() {
  const [myCircles, setMyCircles] = useState([]);
  const [activeCircleId, setActiveCircleIdState] = useState(
    () => localStorage.getItem('activeCircleId') ?? null
  );
  const [competitions, setCompetitions] = useState({ football: [], f1: [], tennis: [] });
  const [feed, setFeed] = useState([]);
  const [members, setMembers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const setActiveCircleId = useCallback((id) => {
    if (id) localStorage.setItem('activeCircleId', id);
    else localStorage.removeItem('activeCircleId');
    setActiveCircleIdState(id);
  }, []);

  const fetchMyCircles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('circle_members')
        .select('role, circles(id, name, invite_code, is_public, p2p_betting_enabled, created_by, created_at)');
      if (err) throw err;
      const circles = (data ?? [])
        .map(row => ({ ...row.circles, role: row.role }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setMyCircles(circles);
      if (circles.length > 0) {
        const stillExists = circles.some(c => c.id === activeCircleId);
        if (!stillExists) setActiveCircleId(circles[0].id);
      } else {
        setActiveCircleId(null);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeCircleId, setActiveCircleId]);

  useEffect(() => { fetchMyCircles(); }, [fetchMyCircles]);

  const fetchCircleData = useCallback(async (circleId) => {
    if (!circleId) {
      setCompetitions({ football: [], f1: [], tennis: [] });
      setFeed([]);
      setMembers([]);
      setNotifications([]);
      return;
    }
    const [compRes, feedRes, membersRes, notifRes] = await Promise.all([
      supabase.rpc('get_clubhouse_competitions', { p_circle_id: circleId }),
      supabase.rpc('get_circle_feed', { p_circle_id: circleId, p_limit: 30 }),
      supabase
        .from('circle_members')
        .select('user_id, role, users(username)')
        .eq('circle_id', circleId),
      supabase
        .from('clubhouse_notifications')
        .select('*')
        .eq('circle_id', circleId)
        .order('created_at', { ascending: false })
        .limit(50),
    ]);
    if (!compRes.error) setCompetitions(compRes.data ?? { football: [], f1: [], tennis: [] });
    if (!feedRes.error) setFeed(feedRes.data ?? []);
    if (!membersRes.error) {
      setMembers(
        (membersRes.data ?? []).map(row => ({
          user_id: row.user_id,
          role: row.role,
          username: row.users?.username ?? '?',
        }))
      );
    }
    if (!notifRes.error) setNotifications(notifRes.data ?? []);
  }, []);

  useEffect(() => { fetchCircleData(activeCircleId); }, [activeCircleId, fetchCircleData]);

  // Realtime: refresh feed when a new gazette entry arrives for any league in the circle
  useEffect(() => {
    if (!activeCircleId) return;
    const channel = supabase
      .channel(`clubhouse-feed-${activeCircleId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'gazette_entries' }, () => {
        fetchCircleData(activeCircleId);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeCircleId, fetchCircleData]);

  // Realtime: prepend new notifications as they arrive
  useEffect(() => {
    if (!activeCircleId) return;
    const channel = supabase
      .channel(`clubhouse-notif-${activeCircleId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'clubhouse_notifications',
        filter: `circle_id=eq.${activeCircleId}`,
      }, (payload) => {
        setNotifications(prev => [payload.new, ...prev].slice(0, 50));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeCircleId]);

  const createCircle = useCallback(async (name) => {
    const { data, error: err } = await supabase.rpc('create_circle', { p_name: name.trim() });
    if (err) throw err;
    if (data?.error) throw new Error(data.error);
    setActiveCircleId(data.circle_id);
    await fetchMyCircles();
    return data;
  }, [fetchMyCircles, setActiveCircleId]);

  const joinCircleByCode = useCallback(async (code) => {
    const { data, error: err } = await supabase.rpc('join_circle_by_code', {
      p_code: code.trim().toUpperCase(),
    });
    if (err) throw err;
    if (data?.error) throw new Error(data.error);
    setActiveCircleId(data.circle_id);
    await fetchMyCircles();
    return data.circle_id;
  }, [fetchMyCircles, setActiveCircleId]);

  const searchClubhouses = useCallback(async (query) => {
    const { data, error: err } = await supabase.rpc('search_clubhouses', { p_query: query.trim() });
    if (err) throw err;
    if (data?.error) throw new Error(data.error);
    return Array.isArray(data) ? data : [];
  }, []);

  const updateSettings = useCallback(async (circleId, { name, isPublic, p2pEnabled }) => {
    const { data, error: err } = await supabase.rpc('update_circle_settings', {
      p_circle_id:   circleId,
      p_name:        name        ?? null,
      p_is_public:   isPublic    ?? null,
      p_p2p_enabled: p2pEnabled  ?? null,
    });
    if (err) throw err;
    if (data?.error) throw new Error(data.error);
    await fetchMyCircles();
    return data;
  }, [fetchMyCircles]);

  const kickMember = useCallback(async (circleId, userId) => {
    const { data, error: err } = await supabase.rpc('kick_circle_member', {
      p_circle_id: circleId,
      p_user_id:   userId,
    });
    if (err) throw err;
    if (data?.error) throw new Error(data.error);
    await fetchCircleData(circleId);
    return data;
  }, [fetchCircleData]);

  const linkLeague = useCallback(async (circleId, leagueId) => {
    const { data, error: err } = await supabase.rpc('link_league_to_circle', {
      p_circle_id: circleId,
      p_league_id: leagueId,
    });
    if (err) throw err;
    if (data?.error) throw new Error(data.error);
    await fetchCircleData(circleId);
    return data;
  }, [fetchCircleData]);

  const getOwnerLinkableLeagues = useCallback(async (circleId) => {
    const { data, error: err } = await supabase.rpc('get_owner_linkable_leagues', {
      p_circle_id: circleId,
    });
    if (err) throw err;
    if (data?.error) throw new Error(data.error);
    return Array.isArray(data) ? data : [];
  }, []);

  const markRead = useCallback(async (notifId) => {
    const now = new Date().toISOString();
    setNotifications(prev =>
      prev.map(n => n.id === notifId ? { ...n, read_at: now } : n)
    );
    await supabase
      .from('clubhouse_notifications')
      .update({ read_at: now })
      .eq('id', notifId);
  }, []);

  const markAllRead = useCallback(async (circleId) => {
    const now = new Date().toISOString();
    setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? now })));
    await supabase
      .from('clubhouse_notifications')
      .update({ read_at: now })
      .eq('circle_id', circleId)
      .is('read_at', null);
  }, []);

  const unreadCount = notifications.filter(n => !n.read_at).length;

  const activeCircle = myCircles.find(c => c.id === activeCircleId) ?? null;

  return {
    myCircles,
    activeCircle,
    activeCircleId,
    setActiveCircleId,
    competitions,
    feed,
    members,
    notifications,
    unreadCount,
    loading,
    error,
    createCircle,
    joinCircleByCode,
    searchClubhouses,
    updateSettings,
    kickMember,
    linkLeague,
    getOwnerLinkableLeagues,
    markRead,
    markAllRead,
    refresh: fetchMyCircles,
  };
}
