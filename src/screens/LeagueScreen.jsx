import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useChatMessages } from '../hooks/useChatMessages';
import { useMentions } from '../hooks/useMentions';
import { useToast } from '../hooks/useToast';
import { useAuctions } from '../hooks/useAuctions';
import SectionHeader from '../components/SectionHeader';
import LeagueInviteCard from '../components/LeagueInviteCard';
import H2HSheet from '../components/H2HSheet';
import GazetteDraftReport from '../components/GazetteDraftReport';
import TransferWindowBanner from '../components/TransferWindowBanner';
import AuctionCard from '../components/AuctionCard';
import BetsSection from '../components/BetsSection';
import { useTransferWindow } from '../hooks/useTransferWindow';


export default function LeagueScreen() {
  const { user } = useAuth();
  const { show: showToast } = useToast();
  const navigate = useNavigate();
  const { leagueId } = useParams();

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
  const transferWindow = useTransferWindow(activeLeague?.league_id);
  const { auctions, loading: auctionsLoading, placeBid, cancelListing } = useAuctions(activeLeague?.league_id, mySquadId);

  // Commissioner panel state
  const [commLoading,   setCommLoading]   = useState(false);
  const [commMsg,       setCommMsg]       = useState(null); // { type: 'ok'|'err', text }
  const [windowOpensAt, setWindowOpensAt] = useState('');
  const [windowClosesAt,setWindowClosesAt]= useState('');
  const [windowTransfers,setWindowTransfers]=useState('');
  const [draftDeadline, setDraftDeadline] = useState('');
  const [scoreFixtureId,setScoreFixtureId]=useState('test-live');

  // Bet instance creation state
  const [betTemplateId, setBetTemplateId] = useState('');
  const [betTitle, setBetTitle] = useState('');
  const [betPrompt, setBetPrompt] = useState('');
  const [betDeadline, setBetDeadline] = useState('');
  const [betRewardValue, setBetRewardValue] = useState('5');
  const [betScopeType, setBetScopeType] = useState('matchday');
  const [betScopeRef, setBetScopeRef] = useState('');

  // Bet resolution state
  const [openBets, setOpenBets] = useState([]);
  const [resolutionBetsLoading, setResolutionBetsLoading] = useState(false);
  const [selectedBetForResolution, setSelectedBetForResolution] = useState(null);
  const [betResolutionAnswer, setBetResolutionAnswer] = useState('');
  const [betSubmissions, setBetSubmissions] = useState([]);
  const [answerGrouped, setAnswerGrouped] = useState({});

  // Create form state
  const [leagueName,   setLeagueName]   = useState('');
  const [leagueFormat, setLeagueFormat] = useState('classic');
  const [formLoading,  setFormLoading]  = useState(false);
  const [newLeague,    setNewLeague]    = useState(null);   // set after creation → shows invite card

  // Join-by-code state
  const [joinCode,     setJoinCode]     = useState('');
  const [joinLoading,  setJoinLoading]  = useState(false);
  const [joinError,    setJoinError]    = useState('');

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const { messages, loading: chatLoading, unreadCount, typingUsers, sendMessage, editMessage, deleteMessage, broadcastTyping, markChatAsRead, scrollEndRef } = useChatMessages(activeLeague?.league_id);
  const { mentionSearch, mentionMatches, selectedMention, mentionedUserIds, loadLeagueMembers, parseMentionPattern, insertMention, handleMentionNavigate, resetMentions } = useMentions(activeLeague?.league_id);

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

  const validateAndSendProposal = async () => {
    setTradeError(null);
    if (!tradeMyPlayer || !tradeTheirPlayer) {
      setTradeError('Select both players before sending.');
      return;
    }
    const myPos    = tradeMyPlayer.position?.toUpperCase().replace('FW','FWD');
    const theirPos = tradeTheirPlayer.position?.toUpperCase().replace('FW','FWD');
    const positionChange = myPos !== theirPos;

    // Position-change swaps require an open transfer window
    if (positionChange && !transferWindow.isOpen) {
      setTradeError('Position-change swaps require an open transfer window.');
      return;
    }
    // TODO: deeper position-cap check will use live squad data once real squads are wired
    showToast('Proposal sent!', 'success');
    setShowTradeBuilder(false);
    setTradeError(null);
  };

  const isCommissioner = activeLeague?.leagues?.created_by === currentUser?.id;

  const commAction = async (fn) => {
    setCommLoading(true);
    setCommMsg(null);
    try {
      await fn();
    } catch (e) {
      setCommMsg({ type: 'err', text: e.message || 'Action failed' });
    } finally {
      setCommLoading(false);
    }
  };

  const openTransferWindow = () => commAction(async () => {
    const lid = activeLeague?.league_id;
    const opens  = windowOpensAt  || new Date().toISOString();
    const closes = windowClosesAt || new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const { error } = await supabase.from('transfer_windows').insert({
      league_id: lid,
      opens_at:  opens,
      closes_at: closes,
      transfers_remaining: windowTransfers ? Number(windowTransfers) : null,
    });
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: 'Transfer window opened.' });
  });

  const closeTransferWindow = () => commAction(async () => {
    const lid = activeLeague?.league_id;
    const { error } = await supabase.from('transfer_windows')
      .update({ closes_at: new Date().toISOString() })
      .eq('league_id', lid)
      .gt('closes_at', new Date().toISOString());
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: 'Transfer window closed.' });
  });

  const triggerScores = () => commAction(async () => {
    const { data, error } = await supabase.functions.invoke('calculate-scores', {
      body: { fixture_id: scoreFixtureId },
    });
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: `Scores updated — ${data?.updated_squads ?? 0} squads, ${data?.player_stats ?? 0} player stats.` });
  });

  const setLeagueDraftDeadline = () => commAction(async () => {
    if (!draftDeadline) throw new Error('Enter a deadline date/time.');
    const { error } = await supabase.from('leagues')
      .update({ draft_deadline: draftDeadline })
      .eq('id', activeLeague?.league_id);
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: 'Draft deadline set.' });
  });

  const createBetInstance = () => commAction(async () => {
    if (!betTitle) throw new Error('Enter a bet title.');
    if (!betPrompt) throw new Error('Enter a bet prompt/question.');
    if (!betDeadline) throw new Error('Set a deadline.');
    const { error } = await supabase.from('bet_instances').insert({
      league_id: activeLeague?.league_id,
      template_id: betTemplateId || null,
      title: betTitle,
      prompt: betPrompt,
      options: [],
      deadline_at: betDeadline,
      reward_value: Number(betRewardValue) || 5,
      scope_type: betScopeType,
      scope_ref: betScopeRef || null,
    });
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: 'Bet instance created.' });
    setBetTitle('');
    setBetPrompt('');
    setBetDeadline('');
    setBetRewardValue('5');
    setBetScopeType('matchday');
    setBetScopeRef('');
    setBetTemplateId('');
    await fetchOpenBets();
  });

  const fetchOpenBets = async () => {
    if (!activeLeague?.league_id) return;
    setResolutionBetsLoading(true);
    try {
      const { data, error } = await supabase
        .from('bet_instances')
        .select('*')
        .eq('league_id', activeLeague.league_id)
        .neq('status', 'resolved')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setOpenBets(data || []);
    } catch (err) {
      console.error('Failed to fetch open bets:', err);
    } finally {
      setResolutionBetsLoading(false);
    }
  };

  const fetchBetSubmissions = async (betId) => {
    if (!betId) {
      setBetSubmissions([]);
      setAnswerGrouped({});
      return;
    }
    try {
      const { data, error } = await supabase
        .from('bet_submissions')
        .select('answer, user_id, users(username)')
        .eq('bet_instance_id', betId);
      if (error) throw error;

      setBetSubmissions(data || []);

      // Group by answer with counts
      const grouped = {};
      (data || []).forEach(sub => {
        if (!grouped[sub.answer]) {
          grouped[sub.answer] = [];
        }
        grouped[sub.answer].push(sub.users?.username || 'Unknown');
      });
      setAnswerGrouped(grouped);
    } catch (err) {
      console.error('Failed to fetch submissions:', err);
    }
  };

  const resolveBet = () => commAction(async () => {
    if (!selectedBetForResolution) throw new Error('Select a bet to resolve.');
    if (!betResolutionAnswer) throw new Error('Select the correct answer.');
    const { data, error } = await supabase.rpc('resolve_bet', {
      p_instance_id: selectedBetForResolution.id,
      p_correct_answer: betResolutionAnswer,
    });
    if (error) throw new Error(error.message);
    setCommMsg({ type: 'ok', text: `Bet resolved — ${data?.submissions_updated ?? 0} submissions graded.` });
    setBetResolutionAnswer('');
    setSelectedBetForResolution(null);
    setBetSubmissions([]);
    setAnswerGrouped({});
    await fetchOpenBets();
  });

  const renderTabs = () => (
    <div className="flex bg-[var(--ink-2)] border-b border-[var(--rule)] sticky top-[60px] z-20">
      {['leaderboard', 'frontpage', 'bets', 'auctions', 'chat', 'stats', ...(isCommissioner ? ['commissioner'] : [])].map((t) => (
        <button
          key={t}
          onClick={() => setView(t === 'leaderboard' ? 'detail' : t)}
          className={`flex-1 py-3 text-[10px] font-black uppercase tracking-[.15em] transition-all relative ${
            (view === 'detail' && t === 'leaderboard') || view === t
              ? 'text-white'
              : 'text-[#555] hover:text-[var(--mute)]'
          }`}
        >
          {t === 'leaderboard' ? 'Leaderboard' : t === 'commissioner' ? '⚙ Admin' : t}
          {t === 'chat' && unreadCount > 0 && (
            <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
              {unreadCount}
            </span>
          )}
          {((view === 'detail' && t === 'leaderboard') || view === t) && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-cyan" />
          )}
        </button>
      ))}
    </div>
  );

  useEffect(() => {
    setCurrentUser(user);
    fetchLeagues();
  }, [user]);

  useEffect(() => {
    if (leagueId) {
      loadLeagueById(leagueId);
    } else {
      setActiveLeague(null);
      setMembers([]);
    }
  }, [leagueId]);

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

  // Realtime subscription: league standings (total_points updates from bet rewards)
  useEffect(() => {
    if (!activeLeague?.league_id) return;

    const membersSub = supabase
      .channel(`league_members:league_id=eq.${activeLeague.league_id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'league_members', filter: `league_id=eq.${activeLeague.league_id}` },
        (payload) => {
          // Update the specific member in the members list with new total_points
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
      .subscribe();

    return () => { membersSub.unsubscribe(); };
  }, [activeLeague?.league_id]);

  const loadLeagueById = async (id) => {
    try {
      setMembersLoading(true);
      if (view === 'list') setView('detail');
      const { data: lData } = await supabase.from('leagues').select('*').eq('id', id).single();
      if (lData) setActiveLeague({ league_id: id, leagues: lData });
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

      // Fetch current user's squadId in this league
      const { data: squadRow } = await supabase
        .from('squads')
        .select('id')
        .eq('league_id', id)
        .eq('user_id', user?.id)
        .maybeSingle();
      setMySquadId(squadRow?.id ?? null);

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
  };

  const fetchLeagues = async () => {
    try {
      setLoading(true);
      const userId = user?.id;
      
      const { data, error } = await supabase
        .from('league_members')
        .select(`
          league_id, rank, total_points,
          leagues ( id, name, format )
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
  };

  // FB-025: atomic league creation via RPC (league + commissioner in one transaction)
  const handleCreateLeague = async (e) => {
    e.preventDefault();
    if (!leagueName.trim()) return;
    try {
      setFormLoading(true);
      const { data, error } = await supabase.rpc('create_league', {
        p_name:    leagueName.trim(),
        p_format:  leagueFormat,
        p_user_id: user?.id,
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
       <div className="pb-0 min-h-screen bg-bg">
        <div className="flex justify-between items-center px-5 py-3 border-b border-border bg-surface sticky top-0 z-20">
          <div className="flex flex-col">
            <button onClick={() => navigate('/league')} className="fz-label text-text-tertiary mb-0.5 text-left hover:text-cyan transition-colors group">
              <span className="group-hover:-translate-x-1 transition-transform inline-block mr-1">←</span> Back
            </button>
            <div>
              <div className="fz-label text-text-tertiary">Competitive Center</div>
              <h1 className={`${activeLeague ? '' : 'animate-pulse'} fz-display text-[22px] text-white leading-tight uppercase truncate max-w-[200px]`}>
                {name}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setNewLeague(activeLeague?.leagues || activeLeague)}
              className="fz-label text-cyan hover:text-cyan/80 transition-colors"
              title="Show invite code"
            >
              📤 INVITE
            </button>
            <div className="w-2 h-2 rounded-full bg-positive animate-live-pulse" />
            <div className="fz-label text-text-secondary">LIVE</div>
          </div>
        </div>

         <TransferWindowBanner {...transferWindow} />

         {/* Draft open banner — urgency colour shifts at 48h and 24h */}
         {draftOpen && (() => {
           const msLeft = draftDeadlineDate ? draftDeadlineDate.getTime() - Date.now() : Infinity;
           const hoursLeft = msLeft / 3_600_000;
           const isCritical = hoursLeft < 24;
           const isWarning  = hoursLeft < 48;
           const bg    = isCritical ? '#B71C1C' : isWarning ? '#E65100' : '#1B5E20';
           const icon  = isCritical ? '🔴' : isWarning ? '🟡' : '🟢';
           const label = isCritical
             ? `${Math.max(0, Math.floor(hoursLeft))}h left — submit now!`
             : isWarning
             ? `${Math.floor(hoursLeft)}h left`
             : 'Draft is open';
           return (
             <div
               onClick={() => navigate(`/league/${activeLeague?.league_id}/draft`)}
               className="px-4 py-3 flex items-center justify-between cursor-pointer active:opacity-80"
               style={{ background: bg, color: 'white' }}
             >
               <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                 <span className="text-[13px] font-bold">{icon} {label}</span>
                 <span className="text-[11px] opacity-70" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                   — submit your ranked list before the deadline
                 </span>
               </div>
               <div className="text-[11px] font-black uppercase tracking-widest opacity-80">→</div>
             </div>
           );
         })()}

         {/* Manage Squad shortcut */}
         <div className="px-4 py-2 flex gap-2">
           <button
             onClick={() => navigate(`/squad?leagueId=${activeLeague?.league_id}`)}
             className="flex-1 py-2.5 rounded-sm flex items-center justify-center gap-2 transition-all active:opacity-70"
             style={{ background: 'rgba(0,196,232,0.08)', border: '1px solid rgba(0,196,232,0.2)', color: 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}
           >
             👥 Manage Squad
           </button>
           <button
             onClick={() => navigate(`/market?leagueId=${activeLeague?.league_id}`)}
             className="flex-1 py-2.5 rounded-sm flex items-center justify-center gap-2 transition-all active:opacity-70"
             style={{ background: 'rgba(24,201,107,0.08)', border: '1px solid rgba(24,201,107,0.2)', color: 'var(--positive)', fontFamily: 'Archivo Black, sans-serif', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}
           >
             🛒 Market
           </button>
         </div>

         {/* Draft gap banner — shown only when manager has unresolved slots */}
         {draftGaps > 0 && (
           <div
             onClick={() => navigate(`/league/${activeLeague?.league_id}/draft/recover`)}
             className="bg-[#E53935] text-white px-4 py-3 flex items-center justify-between cursor-pointer active:opacity-80"
           >
             <div className="text-[13px] font-bold">
               ⚠ Your squad has {draftGaps} empty slot{draftGaps !== 1 ? 's' : ''} — tap to pick now
             </div>
             <div className="text-[11px] font-black uppercase tracking-widest opacity-80">→</div>
           </div>
         )}

         {renderTabs()}

         {/* ── VIEWS ──────────────────────────────────────────────────────── */}
         
         {view === 'detail' && (
           <>
             <div className="bg-[var(--ink)] border-b border-[var(--rule)]">
               <div className="flex text-[10px] text-[var(--mute)] font-semibold uppercase tracking-widest px-4 py-2 border-b border-[var(--rule)]">
                 <div className="w-8 text-center shrink-0">#</div>
                 <div className="flex-1 px-3">Manager</div>
                 <div className="w-12 text-right shrink-0">MD</div>
                 <div className="w-12 text-right shrink-0">TOT</div>
               </div>

              {membersLoading && members.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="inline-block w-6 h-6 border-2 border-cyan/30 border-t-cyan rounded-full animate-spin mb-3" />
                  <div className="fz-label text-text-tertiary animate-pulse tracking-[0.2em]">Syncing Standings...</div>
                </div>
              ) : (
                members.map((m) => {
                const isMe = currentUser && m.user_id === currentUser.id;
                const mName = isMe ? 'You' : (m.users?.username || 'Unknown');
                return (
                  <div key={m.user_id} className={`flex items-center px-4 py-3 border-b border-[var(--rule)] relative ${isMe ? 'bg-[var(--ink-2)]' : ''}`}>
                    {isMe && <div className="absolute left-0 top-0 bottom-0 w-1 bg-white" />}
                    <div className="w-8 text-center shrink-0 text-[13px] font-black text-white">{m.rank}</div>
                    <div className="flex-1 px-3 flex items-center gap-2 min-w-0">
                      <div className="fk-mono flex items-center justify-center shrink-0" style={{ width: 24, height: 24, border: '1px solid var(--rule)', color: 'var(--mute)', fontSize: 8 }}>{mName.substring(0,3)}</div>
                      <div className="font-bold text-[14px] text-white flex items-center gap-1.5 min-w-0">
                        <span className="truncate">{mName}</span>
                        {!isMe && (
                          <div className="flex gap-1">
                            <button onClick={() => { const t = {...m, name: mName}; setTradeTarget(t); loadTradeSquads(m.user_id); setShowTradeBuilder(true); }} className="text-[8px] text-[#1E88E5] border border-[#1E88E5]/30 px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">Trade</button>
                            <button onClick={() => setH2hTarget({...m, name: mName})} className="text-[8px] text-text-tertiary border border-white/10 px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">&#x2694; H2H</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="w-12 text-right shrink-0 text-[13px] font-bold text-[var(--mute)]">-</div>
                    <div className="w-12 text-right shrink-0 text-[13px] font-black text-white">{m.total_points}</div>
                    <button onClick={() => { setManagerTeamView({ user_id: m.user_id, name: mName }); loadManagerRoster(m.user_id); }} className="fk-mono ml-3 active:scale-95" style={{ width: 32, height: 32, border: '1px solid var(--rule)', color: 'var(--mute)', fontSize: 8 }}>VIEW</button>
                  </div>
                )
              }))}
             </div>

             <div className="px-4 py-1.5 bg-[var(--ink)] border-b border-[var(--rule)]">
                <span className="text-[11px] font-bold text-[var(--mute)] uppercase tracking-[.14em]">Activity</span>
             </div>
             <div className="bg-[var(--ink)] min-h-[20vh] flex flex-col items-center justify-center gap-2 py-12">
               <div className="text-[28px]">⚽</div>
               <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: 'var(--mute)' }}>No activity yet</div>
               <div className="text-[11px] text-center max-w-xs" style={{ color: 'var(--mute)', opacity: 0.6 }}>Match events, rank changes, and league news will appear here once the season starts.</div>
             </div>
           </>
         )}

         {view === 'frontpage' && (
           <div className="bg-[#f2f2f2] text-[#1a1a1a] min-h-screen">
             {members && members.length <= 1 ? (
               // Empty state for newly created leagues
               <div className="min-h-screen flex items-center justify-center p-8">
                 <div className="text-center">
                   <h1 className="font-serif text-5xl font-black mb-4">⚽</h1>
                   <h2 className="font-serif text-3xl font-black mb-3">League Created!</h2>
                   <p className="text-[15px] leading-relaxed mb-6 max-w-md mx-auto opacity-70">
                     Your league is ready. Invite friends via the INVITE button, set up transfer windows in the COMMISSIONER tab, and activity will appear here as the competition begins.
                   </p>
                   <button
                     onClick={() => setNewLeague(activeLeague?.leagues || activeLeague)}
                     className="bg-black text-white px-6 py-2 rounded text-[13px] font-bold hover:bg-[#1a1a1a] transition"
                   >
                     📤 Show Invite Code
                   </button>
                 </div>
               </div>
             ) : (
               // Active league — show draft report; matchday gazette content coming once season starts
               <div className="bg-[#f2f2f2] text-[#1a1a1a]">
                 <div className="px-6 py-8 border-b-2 border-black flex flex-col items-center text-center">
                    <div className="text-[10px] font-black uppercase tracking-[0.4em] mb-2 font-serif underline decoration-2 underline-offset-4">The Official Gazette</div>
                    <h1 className="font-serif text-4xl font-black italic tracking-tighter leading-none mb-1">FORZA TIMES</h1>
                    <div className="w-full flex justify-between border-t border-b border-black/10 mt-4 py-1 text-[9px] font-bold uppercase tracking-widest">
                       <span>VOL. I</span>
                       <span>{new Date().toLocaleDateString()}</span>
                       <span>EDITION #1</span>
                    </div>
                 </div>
                 {/* Draft report — renders only when a draft_report gazette entry exists */}
                 <div className="p-6">
                   <GazetteDraftReport leagueId={activeLeague?.league_id} />
                 </div>
                 <div className="p-8 text-center border-t-2 border-dashed border-black/20">
                    <div className="w-12 h-1 bg-black mx-auto mb-4" />
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Season hasn't started yet</div>
                    <div className="text-[11px] mt-2 opacity-50">Match recaps, league news, and highlights will appear here once the competition begins.</div>
                 </div>
               </div>
             )}
           </div>
         )}

         {view === 'chat' && (
            <div className="flex-1 min-h-[60vh] flex flex-col bg-[var(--ink)]">
              <div className="bg-[var(--ink)] px-4 py-2 border-b border-[var(--rule)] flex items-center gap-2">
                <span className="text-[10px]">💬</span>
                <span className="text-[11px] font-bold text-[var(--mute)]">League Chat</span>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-5">
                {chatLoading && (
                  <div className="flex justify-center items-center h-20">
                    <span className="text-[12px] text-[var(--mute)]">Loading messages...</span>
                  </div>
                )}
                {!chatLoading && messages.length === 0 && (
                  <div className="flex justify-center items-center h-20">
                    <span className="text-[12px] text-[var(--mute)]">No messages yet. Start the conversation!</span>
                  </div>
                )}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex flex-col gap-1 w-[85%] ${msg.isOwnMessage ? 'self-end items-end' : ''} animate-in ${msg.isOwnMessage ? 'slide-in-from-right' : 'slide-in-from-left'} group`}
                  >
                    <div className={`text-[10px] font-black uppercase tracking-wider mb-1 ${msg.isOwnMessage ? 'text-cyan mr-2 text-right' : 'text-text-tertiary ml-2'}`}>
                      {msg.isOwnMessage ? 'You' : msg.userName} (Rank {msg.userRank})
                    </div>
                    {editingMessageId === msg.id ? (
                      <div className="flex gap-2 items-center w-full">
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          className="flex-1 bg-[var(--ink-2)] border border-cyan rounded px-2 py-1 text-sm text-white"
                          autoFocus
                        />
                        <button
                          onClick={async () => {
                            const result = await editMessage(msg.id, editingText);
                            if (result.ok) setEditingMessageId(null);
                          }}
                          className="px-2 py-1 bg-cyan text-black text-xs font-bold rounded"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingMessageId(null)}
                          className="px-2 py-1 bg-[var(--rule)] text-white text-xs rounded"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className={`text-[14px] px-4 py-2.5 rounded-sm border ${
                          msg.isOwnMessage
                            ? 'bg-cyan/10 text-white border-cyan/20 rounded-tr-sm'
                            : 'bg-[var(--ink-2)] text-white border-[var(--rule)] rounded-tl-sm'
                        } relative group/msg`}>
                          {msg.isDeleted ? (
                            <span className="italic text-[var(--mute)]">[deleted]</span>
                          ) : (
                            <span>
                              {msg.message.split(/(@\w+)/g).map((part, idx) =>
                                part.startsWith('@') ? (
                                  <span key={idx} className="font-semibold text-cyan">{part}</span>
                                ) : (
                                  <span key={idx}>{part}</span>
                                )
                              )}
                            </span>
                          )}
                          {msg.isOwnMessage && !msg.isDeleted && (
                            <div className="absolute -right-20 top-0 flex gap-1 opacity-0 group-hover/msg:opacity-100 transition-opacity">
                              <button
                                onClick={() => {
                                  setEditingMessageId(msg.id);
                                  setEditingText(msg.message);
                                }}
                                className="px-1.5 py-0.5 bg-[var(--rule)] text-white text-xs rounded hover:bg-cyan hover:text-black"
                                title="Edit"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => deleteMessage(msg.id)}
                                className="px-1.5 py-0.5 bg-[var(--rule)] text-white text-xs rounded hover:bg-red-600"
                                title="Delete"
                              >
                                🗑️
                              </button>
                            </div>
                          )}
                        </div>
                        {msg.editedAt && !msg.isDeleted && (
                          <div className="text-[9px] text-[var(--mute)]">
                            (edited)
                          </div>
                        )}
                      </>
                    )}
                    <div className={`text-[9px] text-text-tertiary mt-1 ${msg.isOwnMessage ? 'mr-2 text-right' : 'ml-2'}`}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ))}
                <div ref={scrollEndRef} />
              </div>
              <div className="p-4 bg-[var(--ink)] border-t border-[var(--rule)]">
                {Object.values(typingUsers).length > 0 && (
                  <div className="text-[11px] text-[var(--mute)] mb-2 italic">
                    {Object.values(typingUsers).map(t => t.name).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing...
                  </div>
                )}
                 <form
                   onSubmit={async (e) => {
                     e.preventDefault();
                     if (!chatInput.trim() || chatSending) return;
                     setChatSending(true);
                     const result = await sendMessage(chatInput, mentionedUserIds);
                     if (result.ok) {
                       setChatInput('');
                       resetMentions();
                     } else {
                       console.error('Failed to send message:', result.error);
                     }
                     setChatSending(false);
                   }}
                   className="w-full relative"
                 >
                   <div className="bg-[var(--ink-2)] border border-[var(--rule)] rounded-lg flex items-center px-4 py-1">
                      <input
                        type="text"
                        placeholder="Roast your rivals... (try @username)"
                        value={chatInput}
                        onChange={(e) => {
                          const newVal = e.target.value;
                          setChatInput(newVal);
                          parseMentionPattern(newVal);
                          broadcastTyping();
                        }}
                        onKeyDown={(e) => {
                          if (mentionMatches.length > 0) {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              handleMentionNavigate(1);
                            } else if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              handleMentionNavigate(-1);
                            } else if (e.key === 'Enter' && selectedMention) {
                              e.preventDefault();
                              const newText = insertMention(chatInput, selectedMention);
                              setChatInput(newText);
                            }
                          }
                        }}
                        disabled={chatSending}
                        className="flex-1 bg-transparent py-3 text-sm text-white outline-none placeholder-[var(--mute)] disabled:opacity-50"
                      />
                      <button
                        type="submit"
                        disabled={!chatInput.trim() || chatSending}
                        className="w-8 h-8 rounded-full bg-cyan text-black flex items-center justify-center font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                      >
                        {chatSending ? '...' : '↑'}
                      </button>
                   </div>

                   {/* Mention autocomplete dropdown */}
                   {mentionMatches.length > 0 && mentionSearch && (
                     <div className="absolute bottom-12 left-4 right-4 bg-[var(--ink-3)] border border-[var(--rule)] rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                       {mentionMatches.map((member) => (
                         <button
                           key={member.id}
                           type="button"
                           onClick={() => {
                             const newText = insertMention(chatInput, member);
                             setChatInput(newText);
                           }}
                           className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                             selectedMention?.id === member.id ? 'bg-cyan text-black' : 'hover:bg-[var(--ink-2)] text-white'
                           }`}
                         >
                           <span className="font-semibold">@{member.name}</span>
                           <span className="text-[var(--mute)] text-xs ml-2">{member.email}</span>
                         </button>
                       ))}
                     </div>
                   )}
                 </form>
              </div>
            </div>
          )}

         {view === 'bets' && (
           <div className="bg-[var(--ink)] min-h-[60vh]">
             <div className="px-4 py-3 border-b border-[var(--rule)]">
               <div className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--mute)]">Bets & Predictions</div>
               <div className="text-[12px] text-[var(--mute)] mt-0.5">Make your picks before the deadline</div>
             </div>
             <BetsSection leagueId={activeLeague?.league_id} squadId={mySquadId} />
           </div>
         )}

         {view === 'auctions' && (
           <div className="bg-[var(--ink)] min-h-[60vh]">
             <div className="px-4 py-3 border-b border-[var(--rule)] flex items-center justify-between">
               <div>
                 <div className="text-[11px] font-black uppercase tracking-[0.15em] text-[var(--mute)]">Auction House</div>
                 <div className="text-[12px] text-[var(--mute)] mt-0.5">
                   {auctions.length ? `${auctions.length} active listing${auctions.length !== 1 ? 's' : ''}` : 'No active auctions'}
                 </div>
               </div>
               <div className="text-[9px] font-bold uppercase tracking-widest text-[var(--mute)]">
                 {auctionsLoading ? 'Syncing…' : 'Live'}
               </div>
             </div>
             {auctionsLoading && (
               <div className="flex items-center justify-center py-12">
                 <div className="w-5 h-5 border-2 border-cyan/30 border-t-cyan rounded-full animate-spin" />
               </div>
             )}
             {!auctionsLoading && auctions.length === 0 && (
               <div className="flex flex-col items-center justify-center py-16 px-8 text-center gap-3">
                 <div className="text-[28px]">🔨</div>
                 <div className="text-[11px] font-black uppercase tracking-widest text-[var(--mute)]">No active auctions</div>
                 <div className="text-[11px] text-[var(--mute)] opacity-60 max-w-xs">
                   List a player for auction from your Squad screen to start bidding.
                 </div>
               </div>
             )}
             {auctions.map(auction => (
               <AuctionCard
                 key={auction.id}
                 auction={auction}
                 mySquadId={mySquadId}
                 onBid={async (id, amount) => {
                   const res = await placeBid(id, amount);
                   if (res.ok) showToast('Bid placed!', 'success');
                   return res;
                 }}
                 onCancel={async (id) => {
                   const res = await cancelListing(id);
                   if (res.ok) showToast('Listing cancelled.', 'info');
                   return res;
                 }}
               />
             ))}
           </div>
         )}

         {view === 'stats' && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
              <div className="text-3xl mb-4 opacity-40">📊</div>
              <div className="text-[11px] font-black uppercase tracking-[0.2em] text-text-tertiary mb-2">League Stats</div>
              <p className="text-[13px] text-[var(--mute)] max-w-xs">
                Stats will appear here once the season is underway and matches have been played.
              </p>
            </div>
          )}

         {/* ── COMMISSIONER PANEL ─────────────────────────────────────────── */}
         {view === 'commissioner' && isCommissioner && (
           <div className="p-4 space-y-4 pb-20">
             <div className="text-[9px] font-black uppercase tracking-[0.2em] text-text-tertiary pt-2">Commissioner Controls</div>

             {/* Feedback message */}
             {commMsg && (
               <div className={`px-4 py-3 rounded-sm text-[12px] font-bold flex items-center justify-between ${commMsg.type === 'ok' ? 'bg-positive/10 border border-positive/30 text-positive' : 'bg-negative/10 border border-negative/30 text-negative'}`}>
                 <span>{commMsg.text}</span>
                 <button onClick={() => setCommMsg(null)} className="opacity-60 hover:opacity-100 ml-3">✕</button>
               </div>
             )}

             {/* ── Transfer Window ─────────────────────────────────────────── */}
             <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
               <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Transfer Window</div>
               <div className="grid grid-cols-2 gap-2">
                 <div className="flex flex-col gap-1">
                   <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Opens at</label>
                   <input
                     type="datetime-local"
                     value={windowOpensAt}
                     onChange={e => setWindowOpensAt(e.target.value)}
                     className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                   />
                 </div>
                 <div className="flex flex-col gap-1">
                   <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Closes at</label>
                   <input
                     type="datetime-local"
                     value={windowClosesAt}
                     onChange={e => setWindowClosesAt(e.target.value)}
                     className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                   />
                 </div>
               </div>
               <div className="flex flex-col gap-1">
                 <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Transfers allowed (blank = unlimited)</label>
                 <input
                   type="number"
                   min="1"
                   value={windowTransfers}
                   onChange={e => setWindowTransfers(e.target.value)}
                   placeholder="e.g. 5"
                   className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                 />
               </div>
               <div className="grid grid-cols-2 gap-2">
                 <button
                   onClick={openTransferWindow}
                   disabled={commLoading}
                   className="py-3 bg-positive text-black text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50"
                 >
                   Open Window
                 </button>
                 <button
                   onClick={closeTransferWindow}
                   disabled={commLoading}
                   className="py-3 bg-[#1e1e1e] border border-[#2a2a2a] text-white text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50"
                 >
                   Close Now
                 </button>
               </div>
             </div>

             {/* ── Draft Deadline ───────────────────────────────────────────── */}
             <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
               <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Draft Deadline</div>
               <div className="flex flex-col gap-1">
                 <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Deadline (date & time)</label>
                 <input
                   type="datetime-local"
                   value={draftDeadline}
                   onChange={e => setDraftDeadline(e.target.value)}
                   className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                 />
               </div>
               <button
                 onClick={setLeagueDraftDeadline}
                 disabled={commLoading}
                 className="w-full py-3 bg-[#1B5E20] text-white text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50"
               >
                 Set Draft Deadline
               </button>
             </div>

             {/* ── Score Recalculation ──────────────────────────────────────── */}
             <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
               <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Score Recalculation</div>
               <div className="flex flex-col gap-1">
                 <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Fixture ID</label>
                 <input
                   type="text"
                   value={scoreFixtureId}
                   onChange={e => setScoreFixtureId(e.target.value)}
                   placeholder="e.g. test-live, md1-f1"
                   className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                 />
               </div>
               <button
                 onClick={triggerScores}
                 disabled={commLoading || !scoreFixtureId}
                 className="w-full py-3 bg-yellow-600 text-black text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50"
               >
                 {commLoading ? 'Running…' : 'Recalculate Scores'}
               </button>
             </div>

             {/* ── Cup Phase ───────────────────────────────────────────────── */}
             <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
               <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Cup Phase</div>
               <p className="text-[11px] text-text-tertiary">Seeding cup clubs activates the no-repeat pool. Use after draft allocations are set.</p>
               <button
                 onClick={() => commAction(async () => {
                   const { error } = await supabase.rpc('seed_cup_clubs', { p_league_id: activeLeague?.league_id });
                   if (error) throw new Error(error.message);
                   setCommMsg({ type: 'ok', text: 'Cup clubs seeded.' });
                 })}
                 disabled={commLoading}
                 className="w-full py-3 bg-purple-700 text-white text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50"
               >
                 Seed Cup Clubs
               </button>
             </div>

             {/* ── Create Bet Instance ────────────────────────────────────────── */}
             <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
               <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Create Bet Instance</div>
               <div className="flex flex-col gap-1">
                 <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Template (optional)</label>
                 <select
                   value={betTemplateId}
                   onChange={e => setBetTemplateId(e.target.value)}
                   className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                 >
                   <option value="">None</option>
                   <option value="top_scorer">Matchday Top Scorer</option>
                   <option value="match_result">Match Result</option>
                   <option value="player_block">Player Block</option>
                 </select>
               </div>
               <div className="flex flex-col gap-1">
                 <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Title</label>
                 <input
                   type="text"
                   value={betTitle}
                   onChange={e => setBetTitle(e.target.value)}
                   placeholder="e.g. Who scores first?"
                   className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                 />
               </div>
               <div className="flex flex-col gap-1">
                 <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Prompt/Question</label>
                 <textarea
                   value={betPrompt}
                   onChange={e => setBetPrompt(e.target.value)}
                   placeholder="e.g. Which player will score the most goals?"
                   className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40 resize-none h-[60px]"
                 />
               </div>
               <div className="grid grid-cols-2 gap-2">
                 <div className="flex flex-col gap-1">
                   <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Deadline</label>
                   <input
                     type="datetime-local"
                     value={betDeadline}
                     onChange={e => setBetDeadline(e.target.value)}
                     className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                   />
                 </div>
                 <div className="flex flex-col gap-1">
                   <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Reward Value</label>
                   <input
                     type="number"
                     value={betRewardValue}
                     onChange={e => setBetRewardValue(e.target.value)}
                     min="1"
                     className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                   />
                 </div>
               </div>
               <div className="grid grid-cols-2 gap-2">
                 <div className="flex flex-col gap-1">
                   <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Scope Type</label>
                   <select
                     value={betScopeType}
                     onChange={e => setBetScopeType(e.target.value)}
                     className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                   >
                     <option value="matchday">Matchday</option>
                     <option value="match">Match</option>
                     <option value="season">Season</option>
                   </select>
                 </div>
                 <div className="flex flex-col gap-1">
                   <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Scope Ref (optional)</label>
                   <input
                     type="text"
                     value={betScopeRef}
                     onChange={e => setBetScopeRef(e.target.value)}
                     placeholder="e.g. MD4, f-123"
                     className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                   />
                 </div>
               </div>
               <button
                 onClick={createBetInstance}
                 disabled={commLoading}
                 className="w-full py-3 bg-[#FF6B00] text-black text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50"
               >
                 Create Bet Instance
               </button>
             </div>

             {/* ── Resolve Bet Instance ────────────────────────────────────────── */}
             <div className="bg-[#111] border border-[#1e1e1e] rounded-sm p-4 space-y-3">
               <div className="text-[10px] font-black uppercase tracking-[0.15em] text-text-tertiary">Resolve Bet Instance</div>

               {resolutionBetsLoading ? (
                 <div className="text-[11px] text-text-secondary">Loading open bets...</div>
               ) : openBets.length === 0 ? (
                 <div className="text-[11px] text-text-secondary">No open or closed bets to resolve.</div>
               ) : (
                 <>
                   <div className="flex flex-col gap-1">
                     <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Select Bet</label>
                     <select
                       value={selectedBetForResolution?.id || ''}
                       onChange={e => {
                         const bet = openBets.find(b => b.id === e.target.value);
                         setSelectedBetForResolution(bet);
                         setBetResolutionAnswer('');
                         fetchBetSubmissions(bet?.id || null);
                       }}
                       className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40"
                     >
                       <option value="">None</option>
                       {openBets.map(bet => (
                         <option key={bet.id} value={bet.id}>
                           {bet.title} ({bet.status})
                         </option>
                       ))}
                     </select>
                   </div>

                   {selectedBetForResolution && (
                     <>
                       <div className="bg-[#1a1a1a] p-3 rounded-sm space-y-2 border border-[#2a2a2a]">
                         <div className="text-[10px] font-bold text-text-secondary">Prompt:</div>
                         <div className="text-[11px] text-white">{selectedBetForResolution.prompt}</div>
                         <div className="text-[10px] font-bold text-text-secondary mt-2">Reward:</div>
                         <div className="text-[11px] text-white">
                           {selectedBetForResolution.reward_value} {selectedBetForResolution.reward_type === 'points' ? 'pts' : '£M'}
                         </div>
                       </div>

                       <div className="flex flex-col gap-2">
                         <label className="text-[9px] text-text-tertiary font-bold uppercase tracking-widest">Select Correct Answer</label>

                         {betSubmissions.length === 0 ? (
                           <div className="text-[10px] text-text-secondary italic">No submissions yet</div>
                         ) : (
                           <div className="flex flex-col gap-2">
                             {Object.entries(answerGrouped).map(([answer, users]) => (
                               <button
                                 key={answer}
                                 onClick={() => setBetResolutionAnswer(answer)}
                                 className={`p-2 rounded-sm text-[11px] font-bold uppercase tracking-widest transition-all text-left ${
                                   betResolutionAnswer === answer
                                     ? 'bg-green-700/60 border border-green-600 text-white'
                                     : 'bg-[#1a1a1a] border border-[#2a2a2a] text-text-secondary hover:border-[#3a3a3a]'
                                 }`}
                               >
                                 <div>{answer}</div>
                                 <div className="text-[9px] text-text-tertiary">{users.length} submission{users.length !== 1 ? 's' : ''}</div>
                               </button>
                             ))}
                           </div>
                         )}

                         {/* Fallback: manual entry if answer not in submissions */}
                         {betResolutionAnswer && !answerGrouped[betResolutionAnswer] && (
                           <div className="bg-yellow-900/30 border border-yellow-700/50 p-2 rounded-sm text-[10px] text-yellow-200">
                             Custom answer: "{betResolutionAnswer}" (not in submissions)
                           </div>
                         )}

                         {!betResolutionAnswer && betSubmissions.length > 0 && (
                           <input
                             type="text"
                             placeholder="Or type custom answer..."
                             onChange={e => setBetResolutionAnswer(e.target.value)}
                             value=""
                             className="bg-[#1a1a1a] border border-[#2a2a2a] text-white text-[11px] px-2 py-2 rounded-sm outline-none focus:border-cyan/40 text-text-secondary"
                           />
                         )}
                       </div>
                     </>
                   )}

                   <button
                     onClick={resolveBet}
                     disabled={commLoading || !selectedBetForResolution || !betResolutionAnswer}
                     className="w-full py-3 bg-purple-700 text-white text-[11px] font-black uppercase tracking-widest rounded-sm disabled:opacity-50"
                   >
                     Resolve Bet
                   </button>
                 </>
               )}
             </div>
           </div>
         )}

         {/* ── MODALS ─────────────────────────────────────────────────────── */}
         
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
                        ⏳ Transfer window opens in{' '}
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
            onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
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
