import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useChatMessages } from '../hooks/useChatMessages';
import { useMentions } from '../hooks/useMentions';
import { useMessageSearch } from '../hooks/useMessageSearch';
import { useNotifications } from '../hooks/useNotifications';
import { useToast } from '../hooks/useToast';
import { useAuctions } from '../hooks/useAuctions';
import { useLeagueStats } from '../hooks/useLeagueStats';
import { useBettingLeaderboard } from '../hooks/useBettingLeaderboard';
import SectionHeader from '../components/SectionHeader';
import LeagueInviteCard from '../components/LeagueInviteCard';
import H2HSheet from '../components/H2HSheet';
import GazetteDraftReport from '../components/GazetteDraftReport';
import TransferWindowBanner from '../components/TransferWindowBanner';
import BetsSection from '../components/BetsSection';

import NotificationPanel from '../components/NotificationPanel';
import { useTransferWindow } from '../hooks/useTransferWindow';
import { useCommissioner }   from '../hooks/useCommissioner';
import { useOnboarding } from '../hooks/useOnboarding';
import OnboardingTour from '../components/OnboardingTour';
import {
  HubTopbar, HubActionBar, HubTabs,
  HubLeagueHeader, HubTabPills,
  MgrTag, TrendPill, FormDots, Spark, HubSectionLabel,
} from '../components/league/HubShared';
import { MONO, DISPLAY } from '../components/league/HubConstants';
import BetsTabHub             from '../components/league/BetsTabHub';
import LeagueDetailView       from '../components/league/LeagueDetailView';
import BettingLeaderboardView from '../components/league/BettingLeaderboardView';
import AuctionsView           from '../components/league/AuctionsView';
import StatsView              from '../components/league/StatsView';
import ChatView               from '../components/league/ChatView';
import CommissionerPanel      from '../components/league/CommissionerPanel';

const LEAGUE_TOUR_STEPS = [
  {
    target: 'league-standings',
    title:  'League Standings',
    body:   'See every manager\'s rank and total points. Tap a name to view their squad, propose a trade, or check your head-to-head record.',
  },
  {
    target: 'league-tabs',
    title:  'League Tabs',
    body:   'Switch between Standings, Front Page, Bets, Auctions, Chat, and Stats. Commissioners also see an Admin tab.',
  },
  {
    target: 'league-invite',
    title:  'Invite Your Mates',
    body:   'Share your league\'s invite code to bring new managers in. Once they join, the draft order is set automatically.',
  },
];

const BETS_TOUR_STEPS = [
  {
    target: 'bets-header',
    title:  'Bets & Predictions',
    body:   'The Commissioner posts weekly challenges here — predict outcomes to earn bonus points. Picks lock at the deadline.',
  },
  {
    target: 'bets-list',
    title:  'Open Bets',
    body:   'Each card shows the question, the options, and how many points you\'ll win. Tap an option to submit your pick.',
  },
];

const COMMISSIONER_TOUR_STEPS = [
  {
    target: 'comm-transfer-window',
    title:  'Transfer Window',
    body:   'Set when the window opens and closes, and cap the number of transfers allowed per manager this matchday.',
  },
  {
    target: 'comm-draft-deadline',
    title:  'Draft Deadline',
    body:   'Managers must submit their draft before this date. After it passes, the lottery runs automatically.',
  },
  {
    target: 'comm-score-recalc',
    title:  'Score Recalculation',
    body:   'Re-run the scoring engine for any fixture by ID. Use this if a match result was corrected after the fact.',
  },
  {
    target: 'comm-bets',
    title:  'Create Bets',
    body:   'Post prediction challenges for your league. Choose a template or write a custom question, then set options and a deadline.',
  },
];

export default function LeagueScreen() {
  const { user } = useAuth();
  const { show: showToast } = useToast();
  const navigate = useNavigate();
  const { leagueId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    showLeagueTour, completeLeagueTour, replayLeagueTour,
    showCommissionerTour, completeCommissionerTour, replayCommissionerTour,
    showBetsTour, completeBetsTour, replayBetsTour,
  } = useOnboarding();

  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); 
  const [activeLeague, setActiveLeague] = useState(null);
  const [_activeEmojiPickerId, _setActiveEmojiPickerId] = useState(null);
  const [showTradeBuilder, setShowTradeBuilder] = useState(false);
  
  const [managerTeamView, setManagerTeamView] = useState(null); // { id, name }
  const [tradeMyPlayer, setTradeMyPlayer] = useState(null);
  const [tradeTheirPlayer, setTradeTheirPlayer] = useState(null);
  const [tradeCash, setTradeCash] = useState(5.0);
  const [tradePoints, setTradePoints] = useState(0);
  
  const [tradeTarget,    setTradeTarget]    = useState(null);
  const [tradeError,     setTradeError]     = useState(null);
  const [myListings,     setMyListings]     = useState(new Set()); // player_ids I've listed
  const [_leagueListings, setLeagueListings] = useState([]);        // all listings in league
  const [h2hTarget, setH2hTarget] = useState(null);
  const [mySquadId, setMySquadId] = useState(null);
  const [mySquadBudget, setMySquadBudget] = useState(null);

  // Real squad data for trade builder
  const [mySquadPlayers,   setMySquadPlayers]   = useState([]);
  const [theirSquadPlayers,setTheirSquadPlayers] = useState([]);
  const [managerRoster,    setManagerRoster]    = useState([]);
  
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [draftGaps, setDraftGaps] = useState(0); // unresolved_slots for current user
  const [draftOpen, setDraftOpen] = useState(false); // deadline in future + no submission yet
  const [draftDeadlineDate, setDraftDeadlineDate] = useState(null); // for countdown banner
  const [currentGW, setCurrentGW] = useState('—'); // current GW label for league header
  const transferWindow = useTransferWindow(activeLeague?.league_id);
  const { auctions, loading: auctionsLoading, placeBid, cancelListing, sellNow } = useAuctions(activeLeague?.league_id, mySquadId);
  const { topScorers, teamMetrics, loading: statsLoading } = useLeagueStats(activeLeague?.league_id);
  const { leaderboard, loading: betLoading } = useBettingLeaderboard(activeLeague?.league_id);

  // Commissioner state + handlers consolidated into a single hook.
  // The whole object is passed as a prop to CommissionerPanel.
  // fetchOpenBets is also called inline when the admin tab becomes active.
  const commissioner = useCommissioner(activeLeague?.league_id, activeLeague?.tournament_id);
  const { fetchOpenBets } = commissioner;

  // Create form state
  const [leagueName,       setLeagueName]       = useState('');
  const [leagueFormat,     setLeagueFormat]     = useState('classic');
  const [leagueTournament, setLeagueTournament] = useState('426');
  const [tournaments,      setTournaments]      = useState([]);
  const [formLoading,      setFormLoading]      = useState(false);
  const [newLeague,        setNewLeague]        = useState(null);   // set after creation → shows invite card

  // Join-by-code state — U3: seed from ?joinCode= URL param (written by JoinRoute in App.jsx)
  const [joinCode,     setJoinCode]     = useState(() => searchParams.get('joinCode') ?? '');
  const [joinLoading,  setJoinLoading]  = useState(false);
  const [joinError,    setJoinError]    = useState('');

  // Chat input state lives in ChatView — not needed here
  const { messages, loading: chatLoading, unreadCount, typingUsers, sendMessage, editMessage, deleteMessage, broadcastTyping, markChatAsRead, scrollEndRef } = useChatMessages(activeLeague?.league_id);
  const { notifications, unreadCount: notificationCount, markAsRead: markNotificationAsRead, clearAll: clearAllNotifications, clearByType: clearNotificationsByType } = useNotifications(activeLeague?.league_id);
  const { mentionSearch, mentionMatches, selectedMention, mentionedUserIds, loadLeagueMembers, parseMentionPattern, insertMention, handleMentionNavigate, resetMentions } = useMentions(activeLeague?.league_id);
  const { searchTerm, setSearchTerm, filteredMessages, clearSearch, resultCount } = useMessageSearch(messages);

  const toggleListing = async (playerId) => {
    const leagueId = activeLeague?.league_id;
    if (!leagueId) return;
    if (myListings.has(playerId)) {
      await supabase.from('trade_listings').delete()
        .eq('league_id', leagueId).eq('user_id', user?.id).eq('player_id', playerId);
      setMyListings(prev => { const s = new Set(prev); s.delete(playerId); return s; });
      setLeagueListings(prev => prev.filter(l => !(l.user_id === user?.id && l.player_id === playerId)));
    } else {
      await supabase.from('trade_listings').upsert(
        { league_id: leagueId, user_id: user?.id, player_id: playerId },
        { onConflict: 'league_id,user_id,player_id' }
      );
      setMyListings(prev => new Set([...prev, playerId]));
      setLeagueListings(prev => [...prev, { user_id: user?.id, player_id: playerId }]);
    }
  };

  const loadTradeSquads = async (targetUserId) => {
    const lid = activeLeague?.league_id;
    if (!lid || !user?.id) return;
    setMySquadPlayers([]);
    setTheirSquadPlayers([]);
    const [{ data: myAlloc }, { data: theirAlloc }] = await Promise.all([
      supabase.from('draft_allocations').select('allocated_players').eq('league_id', lid).eq('user_id', user.id).maybeSingle(),
      supabase.from('draft_allocations').select('allocated_players').eq('league_id', lid).eq('user_id', targetUserId).maybeSingle(),
    ]);
    const myIds    = myAlloc?.allocated_players    ?? [];
    const theirIds = theirAlloc?.allocated_players ?? [];
    const allIds   = [...new Set([...myIds, ...theirIds])];
    if (!allIds.length) return;
    const { data: playerRows } = await supabase.from('players').select('id,name,position,club,price').in('id', allIds);
    const byId = Object.fromEntries((playerRows ?? []).map(p => [p.id, p]));
    setMySquadPlayers(myIds.map(id => byId[id]).filter(Boolean));
    setTheirSquadPlayers(theirIds.map(id => byId[id]).filter(Boolean));
  };

  const loadManagerRoster = async (targetUserId) => {
    const lid = activeLeague?.league_id;
    if (!lid || !targetUserId) return;
    setManagerRoster([]);
    const { data: alloc } = await supabase.from('draft_allocations').select('allocated_players').eq('league_id', lid).eq('user_id', targetUserId).maybeSingle();
    const ids = alloc?.allocated_players ?? [];
    if (!ids.length) return;
    const { data: rows } = await supabase.from('players').select('id,name,position,club,price').in('id', ids);
    setManagerRoster(rows ?? []);
  };

  const validateAndSendProposal = () => {
    // U8: Trade proposals backend not yet wired — show "coming soon" instead of a phantom toast.
    showToast('Trade proposals coming soon — this feature is in development.', 'info');
    setShowTradeBuilder(false);
    setTradeError(null);
  };

  const isCommissioner = activeLeague?.leagues?.created_by === currentUser?.id
    || activeLeague?.role === 'commissioner';

  // commAction, openTransferWindow, closeTransferWindow, triggerScores,
  // setLeagueDraftDeadline, createBetInstance, autoGenerateBetOptions,
  // fetchOpenBets, fetchBetSubmissions, resolveBet — all from useCommissioner above.
  const viewToTab = (v) => {
    if (v === 'detail') return 'leaderboard';
    if (v === 'betting_leaderboard') return 'betting';
    if (v === 'commissioner') return 'admin';
    return v;
  };
  const tabToView = (t) => {
    if (t === 'leaderboard') return 'detail';
    if (t === 'betting') return 'betting_leaderboard';
    if (t === 'admin') return 'commissioner';
    return t;
  };
  // U32: set tab + sync to URL query param so ?tab=chat deep-links work
  // setSearchParams MUST be in deps: React Router v7 recreates it whenever
  // the location changes (it closes over navigate which closes over locationPathname).
  // Both /league and /league/:leagueId render the same component instance (no
  // remount), so without this dep setTab would hold a stale setSearchParams from
  // the /league render, causing tab clicks to navigate to /league?tab=X instead
  // of /league/:leagueId?tab=X.
  const setTab = useCallback((t) => {
    setView(tabToView(t));
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('tab', t);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const fetchTournaments = useCallback(async () => {
    const { data } = await supabase
      .from('tournaments')
      .select('forza_id, name')
      .eq('available_for_league_creation', true)
      .order('name');
    if (data?.length) {
      setTournaments(data);
      setLeagueTournament(data[0].forza_id);
    }
  }, []);

  const fetchLeagues = useCallback(async () => {
    try {
      setLoading(true);
      const userId = user?.id;

      const { data, error } = await supabase
        .from('league_members')
        .select(`
          league_id, rank, total_points, role,
          leagues ( id, name, format, tournament_id, created_by )
        `)
        .eq('user_id', userId);

      if (error) throw error;

      if (!data || data.length === 0) {
        setLeagues([]);
        return;
      }
      setLeagues(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      setCurrentUser(user);
      fetchLeagues();
      fetchTournaments();
    }
  // user.id is the stable identity; user object reference changes on token refresh
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, fetchLeagues, fetchTournaments]);

  // IMP-01: Fetch current GW for the active league's tournament.
  // Tries the next upcoming deadline first; falls back to the most recent completed round.
  useEffect(() => {
    const tournamentId = activeLeague?.leagues?.tournament_id;
    if (!tournamentId) { setCurrentGW('—'); return; }
    let cancelled = false;
    (async () => {
      const { data: upcoming } = await supabase
        .from('matchday_deadlines').select('matchday_id')
        .eq('tournament_id', tournamentId)
        .gt('deadline_at', new Date().toISOString())
        .order('deadline_at', { ascending: true }).limit(1).maybeSingle();
      if (upcoming?.matchday_id) {
        if (!cancelled) setCurrentGW(String(upcoming.matchday_id).replace(/^.*-r/, ''));
        return;
      }
      const { data: past } = await supabase
        .from('matchday_deadlines').select('matchday_id')
        .eq('tournament_id', tournamentId)
        .lte('deadline_at', new Date().toISOString())
        .order('deadline_at', { ascending: false }).limit(1).maybeSingle();
      if (!cancelled) setCurrentGW(past?.matchday_id ? String(past.matchday_id).replace(/^.*-r/, '') : '—');
    })();
    return () => { cancelled = true; };
  }, [activeLeague?.leagues?.tournament_id]);

  // U3: If a joinCode was passed via URL (?joinCode=XXX from /join?code=XXX),
  // clear the query param from the address bar (keep the code in state for the form).
  useEffect(() => {
    const code = searchParams.get('joinCode');
    if (code) {
      setSearchParams({}, { replace: true });
    }
  // Only run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLeagueById = useCallback(async (id) => {
    if (!id || !user?.id) return;
    try {
      setMembersLoading(true);
      setView(v => v === 'list' ? 'detail' : v);
      const { data: lData } = await supabase.from('leagues').select('*').eq('id', id).single();
      if (!lData) {
        // League doesn't exist or RLS denied — redirect to list view.
        setView('list');
        setMembersLoading(false);
        return;
      }
      setActiveLeague({ league_id: id, leagues: lData });
      const { data: mData } = await supabase.from('league_members').select('rank, total_points, user_id, users(username)').eq('league_id', id).order('total_points', { ascending: false });

      // Check if current user has an incomplete draft allocation
      const { data: alloc } = await supabase
        .from('draft_allocations')
        .select('unresolved_slots')
        .eq('league_id', id)
        .eq('user_id', user?.id)
        .maybeSingle();
      setDraftGaps(alloc?.unresolved_slots ?? 0);

      // Check if draft is open and manager hasn't submitted yet
      const deadline = lData?.draft_deadline;
      const deadlineDate = deadline ? new Date(deadline) : null;
      if (deadlineDate && deadlineDate > new Date()) {
        setDraftDeadlineDate(deadlineDate);
        const { data: sub } = await supabase
          .from('draft_submissions')
          .select('id')
          .eq('league_id', id)
          .eq('user_id', user?.id)
          .maybeSingle();
        setDraftOpen(!sub);
      } else {
        setDraftDeadlineDate(null);
        setDraftOpen(false);
      }

      // Fetch current user's squadId + budget in this league
      const { data: squadRow } = await supabase
        .from('squads')
        .select('id, budget_remaining')
        .eq('league_id', id)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setMySquadId(squadRow?.id ?? null);
      setMySquadBudget(squadRow?.budget_remaining ?? null);

      // Load trade listings for the league
      const { data: listings } = await supabase
        .from('trade_listings')
        .select('player_id, user_id')
        .eq('league_id', id);
      setLeagueListings(listings ?? []);
      setMyListings(new Set((listings ?? []).filter(l => l.user_id === user?.id).map(l => l.player_id)));

      setMembers(mData || []);
    } finally {
      setMembersLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (leagueId && user?.id) {
      // Reset league-scoped state before loading new league to avoid stale display (U29)
      setMembers([]);
      setMySquadId(null);
      setMySquadBudget(null);
      setDraftGaps(0);
      setDraftOpen(false);
      loadLeagueById(leagueId);
    } else if (!leagueId) {
      setActiveLeague(null);
      setMembers([]);
    }
  }, [leagueId, user?.id, loadLeagueById]);

  useEffect(() => {
    if (view === 'commissioner' && activeLeague?.league_id) {
      fetchOpenBets();
    }
  }, [view, activeLeague?.league_id]);

  useEffect(() => {
    if (view === 'chat' && activeLeague?.league_id) {
      markChatAsRead();
      loadLeagueMembers();
    }
  }, [view, activeLeague?.league_id, markChatAsRead, loadLeagueMembers]);

  // U32: Apply ?tab= URL param when a league loads
  useEffect(() => {
    if (!activeLeague?.league_id) return;
    const tabParam = searchParams.get('tab');
    if (tabParam) setView(tabToView(tabParam));
  // Only apply on initial league load (activeLeague change), not on every searchParam change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLeague?.league_id]);

  // U42: Auto-clear only bet-type notification badge when viewing bets tab
  useEffect(() => {
    if (view === 'bets' && activeLeague?.league_id && notificationCount > 0) {
      clearNotificationsByType('bet');
    }
  }, [view, activeLeague?.league_id, notificationCount, clearNotificationsByType]);

  // Realtime subscription: league standings — handles UPDATE (points change) and INSERT (new member joins)
  useEffect(() => {
    if (!activeLeague?.league_id) return;

    const leagueId = activeLeague.league_id;
    const membersSub = supabase
      .channel(`league_members:league_id=eq.${leagueId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` },
        (payload) => {
          setMembers(prev => {
            const idx = prev.findIndex(m => m.user_id === payload.new.user_id);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], total_points: payload.new.total_points };
              return updated.sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
            }
            return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'league_members', filter: `league_id=eq.${leagueId}` },
        async (payload) => {
          // Fetch the new member's username then append to the list (U30)
          const { data: userRow } = await supabase
            .from('users')
            .select('username')
            .eq('id', payload.new.user_id)
            .maybeSingle();
          const newMember = {
            user_id:      payload.new.user_id,
            rank:         payload.new.rank ?? null,
            total_points: payload.new.total_points ?? 0,
            users:        { username: userRow?.username ?? 'New Manager' },
          };
          setMembers(prev => {
            if (prev.some(m => m.user_id === newMember.user_id)) return prev;
            return [...prev, newMember].sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(membersSub); };
  }, [activeLeague?.league_id]);

  // FB-025: atomic league creation via RPC (league + commissioner in one transaction)
  const handleCreateLeague = async (e) => {
    e.preventDefault();
    if (!leagueName.trim()) return;
    try {
      setFormLoading(true);
      const { data, error } = await supabase.rpc('create_league', {
        p_name:          leagueName.trim(),
        p_format:        leagueFormat,
        p_user_id:       user?.id,
        p_tournament_id: leagueTournament,
      });
      if (error) throw error;
      setLeagueName('');
      setNewLeague(data);   // triggers invite card view
      fetchLeagues();
    } catch (err) {
      console.error('[createLeague]', err);
      showToast('Could not create league: ' + (err.message || 'Unknown error'), 'error');
    } finally {
      setFormLoading(false);
    }
  };

  // FB-025: join a league by code
  const handleJoinByCode = async (e) => {
    e.preventDefault();
    const code = joinCode.trim().toUpperCase();
    if (!code || code.length < 4) return;
    try {
      setJoinLoading(true);
      setJoinError('');
      const { data, error } = await supabase.rpc('join_league_by_code', {
        p_code:    code,
        p_user_id: user?.id,
      });
      if (error) {
        const msg = error.message || '';
        if (msg.includes('LEAGUE_NOT_FOUND'))  setJoinError('No league found with that code — check the spelling.');
        else if (msg.includes('ALREADY_MEMBER')) setJoinError('You\'re already in this league.');
        else if (msg.includes('LEAGUE_FULL'))    setJoinError('This league is full.');
        else setJoinError('Something went wrong — please try again.');
        return;
      }
      setJoinCode('');
      fetchLeagues();
      // Navigate to the newly joined league
      if (data?.id) navigate(`/league/${data.id}`);
    } catch (err) {
      console.error('[joinLeague]', err);
      setJoinError('Something went wrong — please try again.');
    } finally {
      setJoinLoading(false);
    }
  };

  // FB-025/026: Show invite card immediately after league creation
  if (newLeague) {
    return (
      <LeagueInviteCard
        league={newLeague}
        onDone={() => {
          setNewLeague(null);
          setView('list');
          if (newLeague.id) navigate(`/league/${newLeague.id}`);
        }}
      />
    );
  }

  if (view === 'create') {
    return (
      <div className="pb-16 min-h-screen bg-bg">
        <div className="flex items-center p-4 border-b border-border bg-surface sticky top-0 z-10">
          <button onClick={() => setView('list')} className="text-xl mr-4 text-text-secondary">←</button>
          <h1 className="fz-display text-white text-[18px]">Initialize Campaign</h1>
        </div>
        <form onSubmit={handleCreateLeague} className="p-4 flex flex-col gap-6 mt-4">
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">League Name</label>
            <div className="bg-surface border border-border p-1">
              <input
                type="text"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                className="w-full bg-transparent px-3 py-3 text-[15px] font-medium outline-none text-white"
                placeholder="e.g. Champions Draft League"
                maxLength={40}
                required
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Competition</label>
            {tournaments.length > 0 ? (
              <div className="flex flex-col gap-2">
                {tournaments.map(t => (
                  <button
                    key={t.forza_id}
                    type="button"
                    onClick={() => setLeagueTournament(t.forza_id)}
                    className={`flex items-center justify-between p-3 border text-left transition-colors ${
                      leagueTournament === t.forza_id
                        ? 'border-cyan bg-cyan/5'
                        : 'border-border bg-surface hover:border-cyan/40'
                    }`}
                  >
                    <span className="text-[13px] font-bold uppercase tracking-wider text-white">{t.name}</span>
                    {leagueTournament === t.forza_id && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-cyan border border-cyan/40 px-1 py-[1px] leading-none">Selected</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-text-secondary">Loading competitions…</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Format</label>
            <div className="grid grid-cols-2 gap-3">
              {/* Classic */}
              <button
                type="button"
                onClick={() => setLeagueFormat('classic')}
                className={`flex flex-col items-start gap-2 p-3 border rounded text-left transition-colors ${
                  leagueFormat === 'classic'
                    ? 'border-white bg-white/5'
                    : 'border-border bg-surface hover:border-white/30'
                }`}
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-white">Classic</span>
                <span className="text-[11px] leading-snug" style={{ color: 'var(--paper)' }}>Everyone builds freely — no player restrictions across squads.</span>
                <ul className="flex flex-col gap-[3px]">
                  <li className="text-[10px]" style={{ color: 'var(--mute)' }}>• Any player, any manager</li>
                  <li className="text-[10px]" style={{ color: 'var(--mute)' }}>• 5 transfers per round</li>
                  <li className="text-[10px]" style={{ color: 'var(--mute)' }}>• Quick to set up</li>
                </ul>
              </button>

              {/* Draft (noduplicate) */}
              <button
                type="button"
                onClick={() => setLeagueFormat('noduplicate')}
                className={`flex flex-col items-start gap-2 p-3 border rounded text-left transition-colors ${
                  leagueFormat === 'noduplicate'
                    ? 'border-cyan bg-cyan/5'
                    : 'border-border bg-surface hover:border-cyan/40'
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white">Draft</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-cyan border border-cyan/40 rounded px-1 py-[1px] leading-none">Recommended</span>
                </div>
                <span className="text-[11px] leading-snug" style={{ color: 'var(--paper)' }}>No two managers can own the same player.</span>
                <ul className="flex flex-col gap-[3px]">
                  <li className="text-[10px]" style={{ color: 'var(--mute)' }}>• Submit ranked wishlist pre-season</li>
                  <li className="text-[10px]" style={{ color: 'var(--mute)' }}>• Lottery resolves contested picks</li>
                  <li className="text-[10px]" style={{ color: 'var(--mute)' }}>• 5 transfers/round · unlimited at halfway</li>
                </ul>
              </button>
            </div>
          </div>
          <button type="submit" disabled={formLoading || !leagueName.trim()} className="w-full mt-4 bg-cyan text-black font-bold py-4 uppercase tracking-wider disabled:opacity-50">
            {formLoading ? 'Creating…' : 'Start Season'}
          </button>
        </form>
      </div>
    );
  }

  if (leagueId) {
    const name = activeLeague?.leagues?.name || activeLeague?.name || 'SYNCING...';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--ink)', color: 'var(--paper)', minHeight: '100vh', fontFamily: "'Archivo', sans-serif" }}>

        {/* â”€â”€ Guided tours â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        {showLeagueTour && !loading && view === 'detail' && (
          <OnboardingTour
            steps={LEAGUE_TOUR_STEPS}
            onComplete={completeLeagueTour}
            onSkip={completeLeagueTour}
          />
        )}
        {showBetsTour && view === 'bets' && (
          <OnboardingTour
            steps={BETS_TOUR_STEPS}
            onComplete={completeBetsTour}
            onSkip={completeBetsTour}
          />
        )}
        {showCommissionerTour && view === 'commissioner' && isCommissioner && (
          <OnboardingTour
            steps={COMMISSIONER_TOUR_STEPS}
            onComplete={completeCommissionerTour}
            onSkip={completeCommissionerTour}
          />
        )}
        {/* â”€â”€ Desktop chrome (hidden on mobile) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="hidden lg:block">
          <HubTopbar
            leagueName={name}
            memberCount={members.length}
            gw={currentGW}
            isLive={false}
            onBack={() => navigate('/league')}
            rightSlot={
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <NotificationPanel
                  notifications={notifications}
                  unreadCount={notificationCount}
                  onMarkAsRead={markNotificationAsRead}
                  onClearAll={clearAllNotifications}
                  onNavigate={(link) => link && navigate(link)}
                />
                <button
                  onClick={() => setNewLeague(activeLeague?.leagues || activeLeague)}
                  data-tour="league-invite"
                  style={{ background: 'transparent', border: '1px solid rgba(0,180,216,.4)', color: 'var(--cyan)', padding: '6px 12px', fontFamily: MONO, fontSize: 10, letterSpacing: '.2em', cursor: 'pointer' }}
                >+ INVITE</button>
                <button
                  onClick={replayLeagueTour}
                  style={{ width: 20, height: 20, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >?</button>
              </div>
            }
          />
          <HubActionBar
            onManageSquad={() => navigate(`/squad?leagueId=${activeLeague?.league_id}`)}
            onMarket={() => navigate(`/market?leagueId=${activeLeague?.league_id}`)}
          />
        </div>

        {/* â”€â”€ Mobile chrome (hidden on desktop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="lg:hidden">
          <HubLeagueHeader
            leagueName={name}
            memberCount={members.length}
            gw={currentGW}
            onBack={() => navigate('/league')}
            rightSlot={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <NotificationPanel
                  notifications={notifications}
                  unreadCount={notificationCount}
                  onMarkAsRead={markNotificationAsRead}
                  onClearAll={clearAllNotifications}
                  onNavigate={(link) => link && navigate(link)}
                />
                <button
                  onClick={() => setNewLeague(activeLeague?.leagues || activeLeague)}
                  data-tour="league-invite"
                  style={{ background: 'transparent', border: '1px solid rgba(0,180,216,.4)', color: 'var(--cyan)', padding: '4px 8px', fontFamily: MONO, fontSize: 9, letterSpacing: '.2em', cursor: 'pointer' }}
                >+ INVITE</button>
              </div>
            }
          />
        </div>

        <TransferWindowBanner {...transferWindow} />

        {draftOpen && (() => {
          const msLeft = draftDeadlineDate ? draftDeadlineDate.getTime() - Date.now() : Infinity;
          const hoursLeft = msLeft / 3_600_000;
          const isCritical = hoursLeft < 24;
          const isWarning = hoursLeft < 48;
          const bg = isCritical ? '#B71C1C' : isWarning ? '#E65100' : '#1B5E20';
          return (
            <div onClick={() => navigate(`/league/${activeLeague?.league_id}/draft`)} style={{ background: bg, color: 'white', padding: '10px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', flexShrink: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em' }}>
                {isCritical ? '🔴' : isWarning ? '🟡' : '🟢'} DRAFT {isCritical ? `${Math.max(0, Math.floor(hoursLeft))}H LEFT — SUBMIT NOW` : isWarning ? `${Math.floor(hoursLeft)}H LEFT` : 'IS OPEN'} — SUBMIT YOUR RANKED LIST
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em' }}>→</span>
            </div>
          );
        })()}

        {draftGaps > 0 && (
          <div onClick={() => navigate(`/league/${activeLeague?.league_id}/draft/recover`)} style={{ background: '#B71C1C', color: 'white', padding: '10px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', flexShrink: 0 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em' }}>⚠  YOUR SQUAD HAS {draftGaps} EMPTY SLOT{draftGaps !== 1 ? 'S' : ''} — TAP TO PICK NOW</span>
            <span style={{ fontFamily: MONO, fontSize: 11 }}>→</span>
          </div>
        )}

                {/* L5.16: Cup phase banner -- shown when cup is active */}
        {activeLeague?.leagues?.cup_phase && activeLeague.leagues.cup_phase !== 'pre_cup' && (
          <div style={{ background: 'var(--gold, #FFD700)', color: '#000', padding: '8px', textAlign: 'center', fontSize: '12px', fontWeight: 'bold', flexShrink: 0 }}>
            CUP PHASE: {activeLeague.leagues.cup_phase.replace(/_/g, ' ').toUpperCase()}
          </div>
        )}

{/* â”€â”€ Desktop tabs (hidden on mobile) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="hidden lg:block" data-tour="league-tabs">
          <HubTabs
            active={viewToTab(view)}
            onTab={setTab}
            isCommissioner={isCommissioner}
            unreadChat={unreadCount}
            notifyBets={notificationCount > 0}
          />
        </div>

        {/* â”€â”€ Mobile tab pills (hidden on desktop) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className="lg:hidden" data-tour="league-tabs">
          <HubTabPills
            active={viewToTab(view)}
            onTab={setTab}
            isCommissioner={isCommissioner}
            unreadChat={unreadCount}
            notifyBets={notificationCount > 0}
          />
        </div>

         {/* â”€â”€ VIEWS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}

         {view === 'detail' && (
           <LeagueDetailView
             leagueId={activeLeague?.league_id}
             members={members}
             currentUser={currentUser}
             membersLoading={membersLoading}
             currentGW={currentGW}
             onH2h={setH2hTarget}
             onViewManager={(mgr) => { setManagerTeamView(mgr); loadManagerRoster(mgr.user_id); }}
           />
         )}
         {view === 'frontpage' && (() => {
           const FT_PAPER = '#F2EEE5', FT_INK = '#0A0E14', FT_RULE = '#D8D2C6', FT_MUTE = '#5A6470', FT_RED = '#B0271E';
           const ftSerif = "'Playfair Display', 'Times New Roman', serif";
           const ftMono = "'JetBrains Mono', monospace";
           const today = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
           return (
             <div style={{ flex: 1, overflow: 'auto', padding: 'clamp(8px, 3vw, 20px) clamp(8px, 3vw, 28px) 40px', background: 'var(--ink)' }}>
               {members && members.length <= 1 ? (
                 /* Empty state */
                 <div style={{ background: FT_PAPER, color: FT_INK, padding: '48px', textAlign: 'center', boxShadow: '0 30px 60px -20px rgba(0,0,0,.5)' }}>
                   <div style={{ fontFamily: ftSerif, fontWeight: 900, fontStyle: 'italic', fontSize: 64, lineHeight: 0.9, color: FT_INK }}>FORZA TIMES</div>
                   <div style={{ fontFamily: ftMono, fontSize: 11, color: FT_MUTE, letterSpacing: '.18em', marginTop: 16 }}>The Official Gazette</div>
                   <div style={{ height: 1, background: FT_INK, margin: '20px 0 6px' }} />
                   <div style={{ height: 4, background: FT_INK, marginBottom: 28 }} />
                   <div style={{ fontFamily: ftSerif, fontSize: 22, color: FT_INK, marginBottom: 12 }}>League Created!</div>
                   <p style={{ fontFamily: ftSerif, fontSize: 14, color: FT_MUTE, lineHeight: 1.6, maxWidth: 480, margin: '0 auto 24px' }}>
                     Your league is ready. Invite friends via the INVITE button above, set up transfer windows in the Admin tab, and your Forza Times will come to life as the season unfolds.
                   </p>
                   <button onClick={() => setNewLeague(activeLeague?.leagues || activeLeague)} style={{ background: FT_INK, color: FT_PAPER, border: 'none', padding: '10px 24px', fontFamily: ftMono, fontSize: 11, letterSpacing: '.2em', cursor: 'pointer' }}>
                     SHOW INVITE CODE →
                   </button>
                 </div>
               ) : (
                 /* Newspaper layout */
                 <div style={{ background: FT_PAPER, color: FT_INK, boxShadow: '0 30px 60px -20px rgba(0,0,0,.5), 0 2px 0 0 #C9C2B3', padding: 'clamp(16px, 5vw, 34px) clamp(14px, 5vw, 44px)' }}>
                   {/* Masthead */}
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontFamily: ftMono, fontSize: 'clamp(8px, 2vw, 11px)', letterSpacing: '.18em', color: FT_INK, flexWrap: 'wrap', gap: 4 }}>
                     <span>VOL · I</span>
                     <span style={{ fontFamily: ftSerif, fontStyle: 'italic', fontSize: 'clamp(10px, 2.5vw, 14px)', letterSpacing: 0 }}>The Official Gazette of {name}</span>
                     <span>EDITION · #1</span>
                   </div>
                   <div style={{ textAlign: 'center', marginTop: 6 }}>
                     <div style={{ fontFamily: ftSerif, fontWeight: 900, fontStyle: 'italic', fontSize: 'clamp(38px, 10vw, 72px)', letterSpacing: '-0.03em', lineHeight: 0.9, color: FT_INK }}>FORZA TIMES</div>
                     <div style={{ fontFamily: ftSerif, fontStyle: 'italic', fontSize: 'clamp(10px, 2vw, 13px)', color: FT_MUTE, marginTop: 6 }}>
                       "All the points that's fit to print" · {today} · £0.00 to subscribers
                     </div>
                   </div>
                   <div style={{ border: 0, height: 1, background: FT_INK, margin: '18px 0 4px' }} />
                   <div style={{ height: 4, background: FT_INK, margin: '0 0 22px' }} />

                   {/* Cover grid — 3-col on desktop, single col on mobile */}
                   <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 28 }}>
                     {/* Lead story — standings snapshot */}
                     <article>
                       <div style={{ fontFamily: ftMono, fontSize: 10, letterSpacing: '.22em', color: FT_RED, marginBottom: 8 }}>LEAGUE STANDINGS · LATEST</div>
                       <h1 style={{ fontFamily: ftSerif, fontWeight: 900, fontSize: 'clamp(24px, 6vw, 44px)', lineHeight: 0.98, letterSpacing: '-0.025em', color: FT_INK, marginBottom: 14 }}>
                         {members[0] ? `${(members[0].users?.username || 'Unknown').toUpperCase()} leads the table.` : 'The season is yet to begin.'}
                       </h1>
                       {/* Placeholder image */}
                       <div style={{ height: 180, background: `repeating-linear-gradient(135deg, ${FT_INK} 0 1px, transparent 1px 12px), #D6CFBF`, border: `1px solid ${FT_INK}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                         <span style={{ fontFamily: ftMono, fontSize: 10, letterSpacing: '.22em', color: FT_INK, background: FT_PAPER, padding: '4px 8px', border: `1px solid ${FT_INK}` }}>LEAGUE PHOTO · MATCHDAY</span>
                       </div>
                       <p style={{ fontFamily: ftSerif, fontSize: 16, lineHeight: 1.5, color: FT_INK, marginTop: 14 }}>
                         <span style={{ float: 'left', fontFamily: ftSerif, fontWeight: 900, fontSize: 52, lineHeight: 0.85, paddingRight: 8, paddingTop: 4, color: FT_INK }}>{members[0] ? (members[0].users?.username?.[0] || 'T').toUpperCase() : 'T'}</span>
                         {members[0] ? `he ${name} is underway with ${members.length} managers fighting for glory. ${members[0].users?.username || 'The leader'} currently tops the table with ${members[0].total_points} points, setting the pace for the rest of the field.` : 'he season hasn\'t started yet. Invite your rivals and prepare for battle.'}
                       </p>
                       <div style={{ fontFamily: ftMono, fontSize: 10, letterSpacing: '.18em', color: FT_MUTE, marginTop: 12, textTransform: 'uppercase' }}>By the Forza Times Desk · {today}</div>
                     </article>

                     {/* Secondary column */}
                     <div style={{ borderLeft: `1px solid ${FT_RULE}`, borderRight: `1px solid ${FT_RULE}`, padding: '0 22px' }}>
                       <div style={{ fontFamily: ftMono, fontSize: 9, letterSpacing: '.22em', color: FT_RED }}>DRAFT REPORT</div>
                       <h2 style={{ fontFamily: ftSerif, fontWeight: 800, fontSize: 22, lineHeight: 1.02, letterSpacing: '-0.02em', color: FT_INK, marginTop: 6 }}>Squad allocations & latest picks</h2>
                       <div style={{ marginTop: 12 }}>
                         <GazetteDraftReport leagueId={activeLeague?.league_id} />
                       </div>
                     </div>

                     {/* Sidebar */}
                     <aside>
                       {/* Standings box */}
                       <div style={{ border: `2px solid ${FT_INK}`, padding: '14px 16px', background: '#EFEAE0' }}>
                         <div style={{ fontFamily: ftMono, fontSize: 9, letterSpacing: '.22em', color: FT_INK }}>STANDINGS · LATEST</div>
                         <div style={{ fontFamily: ftSerif, fontWeight: 900, fontStyle: 'italic', fontSize: 18, color: FT_INK, marginTop: 2 }}>Table at a glance</div>
                         <table style={{ width: '100%', marginTop: 8, borderCollapse: 'collapse', fontFamily: ftMono, fontSize: 11, color: FT_INK }}>
                           <tbody>
                             {members.slice(0, 6).map((m, i) => {
                               const mName = (currentUser && m.user_id === currentUser.id) ? 'You' : (m.users?.username || 'Unknown');
                               return (
                                 <tr key={m.user_id} style={{ borderTop: i === 0 ? 'none' : `1px solid ${FT_RULE}` }}>
                                   <td style={{ padding: '5px 4px', width: 18 }}>{i + 1}</td>
                                   <td style={{ padding: '5px 4px', fontFamily: ftSerif, fontSize: 12 }}>{mName}</td>
                                   <td style={{ padding: '5px 4px', textAlign: 'right', fontWeight: 600 }}>{m.total_points}</td>
                                 </tr>
                               );
                             })}
                           </tbody>
                         </table>
                       </div>
                       {/* Quote */}
                       <div style={{ paddingLeft: 16, borderLeft: `4px solid ${FT_INK}`, marginTop: 18 }}>
                         <div style={{ fontFamily: ftMono, fontSize: 9, letterSpacing: '.22em', color: FT_RED }}>THIS WEEK IN LEAGUE CHAT</div>
                         <blockquote style={{ fontFamily: ftSerif, fontStyle: 'italic', fontSize: 18, lineHeight: 1.2, color: FT_INK, marginTop: 6 }}>
                           "May the best manager win."
                         </blockquote>
                       </div>
                     </aside>
                   </div>

                   <div style={{ height: 1, background: FT_INK, margin: '24px 0 12px' }} />
                   <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: ftMono, fontSize: 9, letterSpacing: '.22em', color: FT_MUTE }}>
                     <span>EDITED BY THE FORZA TIMES DESK · {name.toUpperCase()}</span>
                     <span>P. 01 OF 01</span>
                   </div>
                 </div>
               )}
             </div>
           );
         })()}

         {view === 'bets' && (
           <BetsTabHub
             leagueId={activeLeague?.league_id}
             squadId={mySquadId}
             onReplayTour={replayBetsTour}
           />
         )}

         {view === 'betting_leaderboard' && (
           <BettingLeaderboardView leaderboard={leaderboard} currentUser={currentUser} betLoading={betLoading} />
         )}
         {view === 'auctions' && (
           <AuctionsView
             auctions={auctions}
             auctionsLoading={auctionsLoading}
             name={name}
             mySquadId={mySquadId}
             myBudget={mySquadBudget}
             placeBid={placeBid}
             cancelListing={cancelListing}
             sellNow={sellNow}
             onToast={showToast}
           />
         )}

         {view === 'chat' && (
           <ChatView
             members={members}
             currentUser={currentUser}
             messages={messages}
             chatLoading={chatLoading}
             unreadCount={unreadCount}
             typingUsers={typingUsers}
             sendMessage={sendMessage}
             editMessage={editMessage}
             deleteMessage={deleteMessage}
             broadcastTyping={broadcastTyping}
             scrollEndRef={scrollEndRef}
             mentionSearch={mentionSearch}
             mentionMatches={mentionMatches}
             selectedMention={selectedMention}
             mentionedUserIds={mentionedUserIds}
             parseMentionPattern={parseMentionPattern}
             insertMention={insertMention}
             handleMentionNavigate={handleMentionNavigate}
             resetMentions={resetMentions}
             searchTerm={searchTerm}
             setSearchTerm={setSearchTerm}
             filteredMessages={filteredMessages}
             clearSearch={clearSearch}
             resultCount={resultCount}
           />
         )}

         {view === 'stats' && (
           <StatsView
             topScorers={topScorers}
             teamMetrics={teamMetrics}
             members={members}
             currentUser={currentUser}
             statsLoading={statsLoading}
           />
         )}
         {view === 'commissioner' && isCommissioner && (
           <CommissionerPanel
             commissioner={commissioner}
             leagueId={activeLeague?.league_id}
             tournamentId={activeLeague?.tournament_id ?? commissioner?.tournamentId}
             replayCommissionerTour={replayCommissionerTour}
             memberCount={members.length}
             leagueName={activeLeague?.leagues?.name || activeLeague?.name || 'LEAGUE'}
           />
         )}
         {showTradeBuilder && tradeTarget && (
            <div className="fixed inset-0 z-50 flex items-end outline-none bg-black/80 animate-in fade-in" onClick={() => setShowTradeBuilder(false)}>
               <div className="w-full h-[90vh] bg-[var(--ink)] rounded-t-2xl flex flex-col animate-in slide-in-from-bottom border-t border-[var(--rule)] relative" onClick={e => e.stopPropagation()}>
                  <div className="w-full flex justify-center py-3"><div className="w-12 h-1.5 bg-[#2A2A2A] rounded-full" /></div>
                  <div className="px-6 py-4 border-b border-[var(--rule)] flex justify-between items-center">
                    <div>
                      <div className="text-[10px] text-[#1E88E5] font-black uppercase tracking-[.14em] mb-1">NEGOTIATION TABLE</div>
                      <h2 className="text-xl font-bold text-white">Trade with {tradeTarget.name}</h2>
                    </div>
                    <button onClick={() => setShowTradeBuilder(false)} className="text-[var(--mute)] hover:text-white transition-colors">✕</button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-8 no-scrollbar">
                    <div className="grid grid-cols-[1fr_40px_1fr] items-center gap-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-[9px] font-black text-[var(--mute)] uppercase tracking-widest text-center">MY PLAYER</label>
                        <select value={tradeMyPlayer?.id || ''} onChange={(e) => setTradeMyPlayer(mySquadPlayers.find(p => p.id === e.target.value))} className="bg-[var(--ink)] border border-[var(--rule)] p-3 rounded-sm text-white text-[12px] font-bold outline-none text-center">
                           <option value="">{mySquadPlayers.length ? '(None)' : 'Loading…'}</option>
                           {mySquadPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {tradeMyPlayer && (
                          <button
                            onClick={() => toggleListing(tradeMyPlayer.id)}
                            className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border transition-all ${
                              myListings.has(tradeMyPlayer.id)
                                ? 'border-[#00C853]/40 text-[#00C853] bg-[#00C853]/10'
                                : 'border-[var(--rule)] text-[#555]'
                            }`}
                          >
                            {myListings.has(tradeMyPlayer.id) ? '✓ Listed for trade' : '+ List for trade'}
                          </button>
                        )}
                      </div>
                      <div className="text-[#2A2A2A] text-xl mt-6 flex justify-center">↔</div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[9px] font-black text-[var(--mute)] uppercase tracking-widest text-center">THEIR PLAYER</label>
                        <select value={tradeTheirPlayer?.id || ''} onChange={(e) => setTradeTheirPlayer(theirSquadPlayers.find(p => p.id === e.target.value))} className="bg-[var(--ink)] border border-[var(--rule)] p-3 rounded-sm text-white text-[12px] font-bold outline-none text-center text-ellipsis overflow-hidden">
                           <option value="">{theirSquadPlayers.length ? '(None)' : 'Loading…'}</option>
                           {theirSquadPlayers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.club})</option>)}
                        </select>
                      </div>
                    </div>
                    
                    <div className="space-y-4 pt-6 border-t border-[var(--rule)]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[12px] font-bold text-white">Add Cash Sweetener</span>
                        <span className="text-[14px] font-black text-positive">€{tradeCash.toFixed(1)}M</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] text-[var(--mute)]">€0M</span>
                        <input type="range" min="-10" max="10" step="0.5" value={tradeCash} onChange={e => setTradeCash(parseFloat(e.target.value))} className="flex-1 accent-cyan" />
                        <span className="text-[10px] text-[var(--mute)]">€10M</span>
                      </div>
                      <p className="text-[10px] text-[var(--mute)] italic text-center">Shift budget caps to balance unequal player values.</p>
                    </div>

                    <div className="space-y-4 pt-6 border-t border-[var(--rule)]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[12px] font-bold text-white">Add Points Penalty</span>
                        <span className="text-[14px] font-black text-[#E53935]">{tradePoints} pts</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] text-[var(--mute)]">0</span>
                        <input type="range" min="0" max="50" step="5" value={tradePoints} onChange={e => setTradePoints(parseInt(e.target.value))} className="flex-1 accent-[#E53935]" />
                        <span className="text-[10px] text-[var(--mute)]">50</span>
                      </div>
                      <p className="text-[10px] text-[var(--mute)] italic text-center">Give up raw ranking points to secure a star player.</p>
                    </div>
                  </div>
                  <div className="p-6 border-t border-[var(--rule)] bg-[var(--ink)] space-y-3">
                    {/* Window status inside the builder */}
                    {transferWindow.status === 'upcoming' && tradeMyPlayer && tradeTheirPlayer &&
                      tradeMyPlayer.position?.toUpperCase().replace('FW','FWD') !==
                      tradeTheirPlayer.position?.toUpperCase().replace('FW','FWD') && (
                      <div className="text-[#FFC107] text-[10px] font-bold text-center">
                        🔓 Transfer window opens in{' '}
                        {transferWindow.opensAt
                          ? new Date(transferWindow.opensAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : 'soon'}
                        {' '}— position-change swaps blocked until then
                      </div>
                    )}
                    {tradeError && (
                      <div className="text-[#E53935] text-[10px] font-bold text-center">{tradeError}</div>
                    )}
                    <button
                      onClick={validateAndSendProposal}
                      className="w-full py-4 bg-cyan text-black text-[13px] font-black uppercase tracking-widest rounded active:scale-95 shadow-[0_0_15px_rgba(0,180,216,0.3)]"
                      style={{ backgroundColor: '#00B4D8' }}
                    >
                      Broadcast Proposal
                    </button>
                  </div>
               </div>
            </div>
         )}

         {managerTeamView && (
           <div className="fixed inset-0 z-50 flex items-end bg-black/80" onClick={() => setManagerTeamView(null)}>
             <div className="w-full h-[80vh] bg-[var(--ink)] rounded-t-2xl flex flex-col border-t border-[var(--rule)]" onClick={e => e.stopPropagation()}>
               <div className="p-6 border-b border-[var(--rule)] flex justify-between items-center">
                 <div>
                    <h2 className="text-white font-bold text-lg">{managerTeamView.name}'s Roster</h2>
                    <p className="text-[10px] text-text-tertiary uppercase tracking-widest">Full 11-Man Tactical Squad</p>
                 </div>
                 <button onClick={() => setManagerTeamView(null)} className="text-[#555]">✕</button>
               </div>
               <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar">
                 {!managerRoster.length && (
                   <div className="text-center text-[12px] text-text-tertiary py-8">Loading roster…</div>
                 )}
                 {managerRoster.map((p, i) => (
                   <div key={i} className="flex items-center gap-4 bg-[var(--ink)] p-3 border border-[var(--rule)] rounded-sm relative overflow-hidden group">
                     <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan/20 group-hover:bg-cyan transition-colors" />
                     <div className="w-10 h-10 rounded bg-[var(--ink-2)] flex items-center justify-center text-[10px] font-bold text-[#555] overflow-hidden grayscale"><img src={`https://media.api-sports.io/football/players/${(i % 10) + 600}.png`} className="w-full h-full object-cover" /></div>
                     <div className="flex-1">
                       <div className="text-[10px] font-black text-white/40 uppercase tracking-tighter">{p.club} · {p.position}</div>
                       <div className="text-[15px] font-bold text-white tracking-tight">{p.name}</div>
                     </div>
                     <div className="text-right mr-2">
                        <div className="text-[12px] font-black text-white">€{p.price}M</div>
                        <div className="text-[9px] text-positive font-bold">READY</div>
                     </div>
                     <button onClick={() => { const t = { ...managerTeamView, name: managerTeamView.name }; setTradeTarget(t); setTradeTheirPlayer(p); loadTradeSquads(managerTeamView.user_id); setManagerTeamView(null); setShowTradeBuilder(true); }} className="w-9 h-9 rounded-full bg-cyan text-black flex items-center justify-center font-bold active:scale-90 transition-transform shadow-[0_4px_10px_rgba(0,180,216,0.3)]">🔄</button>
                   </div>
                 ))}
               </div>
             </div>
           </div>
         )}

         {h2hTarget && (
           <H2HSheet
             leagueId={activeLeague.league_id}
             myId={currentUser?.id || '0'}
             rival={h2hTarget}
             myName="You"
             onClose={() => setH2hTarget(null)}
           />
         )}

      </div>
    );
  }

  return (
    <div className="pb-24 min-h-screen bg-bg">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-[15px] font-bold uppercase tracking-wide">My Leagues</h1>
        <button onClick={() => setView('create')} className="text-white text-2xl active:scale-95" title="Create league">+</button>
      </div>

      {/* League list */}
      {loading ? (
        <div className="p-8 text-center text-xs font-bold uppercase tracking-widest opacity-50">Syncing...</div>
      ) : leagues.length === 0 ? (
        <div className="p-8 text-center">
          <div className="fk-display" style={{ fontSize: 24, color: 'var(--gold)', marginBottom: '12px' }}>FFL</div>
          <div className="text-[13px] font-bold uppercase tracking-wide text-white mb-2">No leagues yet</div>
          <div className="text-[11px] text-text-secondary mb-6">Create a league or enter a friend's invite code below.</div>
          <button onClick={() => setView('create')} className="px-6 py-3 bg-cyan text-black text-[11px] font-bold uppercase tracking-wider">
            Create a League
          </button>
        </div>
      ) : (
        leagues.map(l => (
          <div key={l.league_id} onClick={() => navigate(`/league/${l.league_id}`)} className="p-4 bg-surface border-b border-border active:bg-surface-elevated flex justify-between items-center cursor-pointer">
            <div>
              <div className="font-bold uppercase tracking-tight text-[15px]">{l.leagues?.name || l.name}</div>
              <div className="text-[10px] text-text-secondary uppercase mt-1">Rank #{l.rank || '-'}</div>
            </div>
            <div className="font-black text-positive">{l.total_points || 0} pts</div>
          </div>
        ))
      )}

      {/* FB-025: Join by code */}
      <div className="mx-4 mt-6 p-5 rounded-sm" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="text-[11px] font-black uppercase tracking-widest mb-1" style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--mute)' }}>
          Have an invite code?
        </div>
        <div className="text-[13px] font-bold text-white mb-4">Enter it below to join a friend's league</div>
        <form onSubmit={handleJoinByCode} className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={e => {
              const val = e.target.value.toUpperCase();
              setJoinCode(val);
              setJoinError(val.trim().length > 0 && val.trim().length < 4 ? 'Codes are 6+ characters' : '');
            }}
            placeholder="XXXXXX"
            maxLength={8}
            style={{
              flex:          1,
              padding:       '10px 14px',
              background:    'rgba(255,255,255,0.05)',
              border:        `1px solid ${joinError ? 'rgba(240,58,58,0.5)' : 'rgba(255,255,255,0.10)'}`,
              borderRadius:  '8px',
              color:         'var(--paper)',
              fontSize:      '16px',
              fontFamily:    'Archivo Black, sans-serif',
              fontWeight:    800,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              outline:       'none',
            }}
          />
          <button
            type="submit"
            disabled={joinLoading || joinCode.trim().length < 4}
            style={{
              padding:       '10px 20px',
              background:    'var(--gold)',
              color:         'var(--ink-2)',
              fontSize:      '12px',
              fontFamily:    'Archivo Black, sans-serif',
              fontWeight:    800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              border:        'none',
              borderRadius:  '8px',
              cursor:        joinLoading ? 'wait' : 'pointer',
              opacity:       (joinLoading || joinCode.trim().length < 4) ? 0.5 : 1,
              whiteSpace:    'nowrap',
            }}
          >
            {joinLoading ? '…' : 'Join →'}
          </button>
        </form>
        {joinError && (
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--danger)', fontFamily: 'Archivo Black, sans-serif' }}>
            {joinError}
          </div>
        )}
      </div>
    </div>
  );
}
