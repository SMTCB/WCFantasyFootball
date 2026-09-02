import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useClubhouse() {
  const { user } = useAuth();
  const [myCircles, setMyCircles] = useState([]);
  const [activeCircleId, setActiveCircleIdState] = useState(
    () => localStorage.getItem('activeCircleId') ?? null
  );
  const [competitions, setCompetitions] = useState({ football: [], f1: [], tennis: [] });
  const [feed, setFeed] = useState([]);
  const [members, setMembers] = useState([]);
  const [metaStandings, setMetaStandings] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showNewCompFlow, setShowNewCompFlow] = useState(false);

  const openNewCompetitionFlow = useCallback(() => setShowNewCompFlow(true), []);
  const closeNewCompetitionFlow = useCallback(() => setShowNewCompFlow(false), []);

  const setActiveCircleId = useCallback((id) => {
    if (id) localStorage.setItem('activeCircleId', id);
    else localStorage.removeItem('activeCircleId');
    setActiveCircleIdState(id);
  }, []);

  const fetchMyCircles = useCallback(async () => {
    if (!user?.id) {
      setMyCircles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('circle_members')
        .select('role, circles(id, name, invite_code, is_public, p2p_betting_enabled, created_by, created_at)')
        .eq('user_id', user.id);
      if (err) throw err;
      const circles = (data ?? [])
        .map(row => ({ ...row.circles, role: row.role }))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      setMyCircles(circles);
      if (circles.length > 0) {
        const stillExists = circles.some(c => c.id === activeCircleId);
        if (!stillExists) setActiveCircleId(circles[0].id);
      }
      // Don't clear activeCircleId when circles returns empty — the row may not
      // be RLS-visible yet immediately after creation (race with optimistic update).
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeCircleId, setActiveCircleId, user?.id]);

  useEffect(() => { fetchMyCircles(); }, [fetchMyCircles]);

  // Tracks the most recently requested circleId so a slower, stale request
  // (e.g. from the previously active Clubhouse) can't overwrite state after
  // the user has already switched to a different Clubhouse.
  const latestCircleIdRef = useRef(null);

  const fetchCircleData = useCallback(async (circleId) => {
    latestCircleIdRef.current = circleId;
    // Reset immediately — not just on the !circleId branch — so switching
    // between two real Clubhouses can't leave the previous one's data on
    // screen while the new one's request is still in flight.
    setCompetitions({ football: [], f1: [], tennis: [] });
    setFeed([]);
    setMembers([]);
    setMetaStandings([]);
    setNotifications([]);
    if (!circleId) return;
    const [compRes, feedRes, membersRes, notifRes, metaRes] = await Promise.all([
      supabase.rpc('get_clubhouse_competitions', { p_circle_id: circleId }),
      supabase.rpc('get_circle_feed', { p_circle_id: circleId, p_limit: 30 }),
      supabase
        .from('circle_members')
        .select('user_id, role, joined_at, users(username)')
        .eq('circle_id', circleId),
      supabase
        .from('clubhouse_notifications')
        .select('*')
        .eq('circle_id', circleId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase.rpc('get_circle_meta_standings', { p_circle_id: circleId }),
    ]);
    // A newer fetchCircleData call has since started (user switched Clubhouses
    // again while this one was still in flight) — discard this stale result.
    if (latestCircleIdRef.current !== circleId) return;
    // get_clubhouse_competitions returns { error: 'NOT_MEMBER' } in-band (200 OK) when the
    // membership check fails server-side — that shape lacks football/f1/tennis keys and will
    // crash any consumer that reads competitions.<sport>.length without a fallback. Treat it
    // the same as a failed request rather than let it corrupt state.
    if (!compRes.error && !compRes.data?.error) {
      setCompetitions(compRes.data ?? { football: [], f1: [], tennis: [] });
    } else if (compRes.error) {
      console.error('fetchCircleData: get_clubhouse_competitions failed', compRes.error);
    }
    if (!feedRes.error) {
      setFeed(feedRes.data ?? []);
    } else {
      console.error('fetchCircleData: get_circle_feed failed', feedRes.error);
    }
    if (!membersRes.error) {
      setMembers(
        (membersRes.data ?? []).map(row => ({
          user_id: row.user_id,
          role: row.role,
          username: row.users?.username ?? '?',
          joined_at: row.joined_at,
        }))
      );
    } else {
      console.error('fetchCircleData: circle_members fetch failed', membersRes.error);
    }
    if (!notifRes.error) setNotifications(notifRes.data ?? []);
    if (!metaRes.error) setMetaStandings(metaRes.data ?? []);
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
    // Optimistic update — add the new circle to state immediately so the UI
    // transitions without a loading flash (which unmounts/remounts the form).
    const optimistic = {
      id: data.circle_id,
      name: name.trim(),
      invite_code: data.invite_code,
      is_public: false,
      p2p_betting_enabled: false,
      created_by: null,
      created_at: new Date().toISOString(),
      role: 'owner',
    };
    setMyCircles(prev => [optimistic, ...prev]);
    setActiveCircleId(data.circle_id);
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

  const getCircleCompetitionAdmins = useCallback(async (circleId) => {
    const { data, error: err } = await supabase.rpc('get_circle_competition_admins', {
      p_circle_id: circleId,
    });
    if (err) throw err;
    if (data?.error) throw new Error(data.error);
    return data ?? { leagues: [], f1: [], tennis: [] };
  }, []);

  const setCompetitionAdmin = useCallback(async (circleId, competitionType, competitionId, userId) => {
    const { data, error: err } = await supabase.rpc('set_competition_admin', {
      p_circle_id: circleId,
      p_competition_type: competitionType,
      p_competition_id: competitionId,
      p_user_id: userId,
    });
    if (err) throw err;
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const removeCompetitionAdmin = useCallback(async (circleId, competitionType, competitionId, userId) => {
    const { data, error: err } = await supabase.rpc('remove_competition_admin', {
      p_circle_id: circleId,
      p_competition_type: competitionType,
      p_competition_id: competitionId,
      p_user_id: userId,
    });
    if (err) throw err;
    if (data?.error) throw new Error(data.error);
    return data;
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

  const refreshCompetitions = useCallback(
    () => fetchCircleData(activeCircleId),
    [fetchCircleData, activeCircleId]
  );

  return {
    myCircles,
    activeCircle,
    activeCircleId,
    setActiveCircleId,
    competitions,
    feed,
    members,
    metaStandings,
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
    getCircleCompetitionAdmins,
    setCompetitionAdmin,
    removeCompetitionAdmin,
    markRead,
    markAllRead,
    refresh: fetchMyCircles,
    refreshCompetitions,
    showNewCompFlow,
    openNewCompetitionFlow,
    closeNewCompetitionFlow,
  };
}
