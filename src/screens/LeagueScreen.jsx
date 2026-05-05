import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import SectionHeader from '../components/SectionHeader';
import LeagueInviteCard from '../components/LeagueInviteCard';
import H2HSheet from '../components/H2HSheet';
import GazetteDraftReport from '../components/GazetteDraftReport';
import TransferWindowBanner from '../components/TransferWindowBanner';
import { useTransferWindow } from '../hooks/useTransferWindow';


export default function LeagueScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { leagueId } = useParams();

  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); 
  const [activeLeague, setActiveLeague] = useState(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
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

  // Real squad data for trade builder
  const [mySquadPlayers,   setMySquadPlayers]   = useState([]);
  const [theirSquadPlayers,setTheirSquadPlayers] = useState([]);
  const [managerRoster,    setManagerRoster]    = useState([]);
  
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [draftGaps, setDraftGaps] = useState(0); // unresolved_slots for current user
  const [draftOpen, setDraftOpen] = useState(false); // deadline in future + no submission yet
  const transferWindow = useTransferWindow(activeLeague?.league_id);

  // Commissioner panel state
  const [commLoading,   setCommLoading]   = useState(false);
  const [commMsg,       setCommMsg]       = useState(null); // { type: 'ok'|'err', text }
  const [windowOpensAt, setWindowOpensAt] = useState('');
  const [windowClosesAt,setWindowClosesAt]= useState('');
  const [windowTransfers,setWindowTransfers]=useState('');
  const [draftDeadline, setDraftDeadline] = useState('');
  const [scoreFixtureId,setScoreFixtureId]=useState('test-live');

  // Create form state
  const [leagueName,   setLeagueName]   = useState('');
  const [leagueFormat, setLeagueFormat] = useState('classic');
  const [formLoading,  setFormLoading]  = useState(false);
  const [newLeague,    setNewLeague]    = useState(null);   // set after creation → shows invite card

  // Join-by-code state
  const [joinCode,     setJoinCode]     = useState('');
  const [joinLoading,  setJoinLoading]  = useState(false);
  const [joinError,    setJoinError]    = useState('');

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
    alert('Proposal Sent!');
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

  const renderTabs = () => (
    <div className="flex bg-[#161616] border-b border-[#2A2A2A] sticky top-[60px] z-20">
      {['leaderboard', 'frontpage', 'chat', 'stats', ...(isCommissioner ? ['commissioner'] : [])].map((t) => (
        <button
          key={t}
          onClick={() => setView(t === 'leaderboard' ? 'detail' : t)}
          className={`flex-1 py-3 text-[10px] font-black uppercase tracking-[.15em] transition-all relative ${
            (view === 'detail' && t === 'leaderboard') || view === t
              ? 'text-white'
              : 'text-[#555] hover:text-[#9E9E9E]'
          }`}
        >
          {t === 'leaderboard' ? 'Leaderboard' : t === 'commissioner' ? '⚙ Admin' : t}
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
      if (deadline && new Date(deadline) > new Date()) {
        const { data: sub } = await supabase
          .from('draft_submissions')
          .select('id')
          .eq('league_id', id)
          .eq('user_id', user?.id)
          .maybeSingle();
        setDraftOpen(!sub);
      } else {
        setDraftOpen(false);
      }

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
      alert('Could not create league: ' + (err.message || 'Unknown error'));
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
                <span className="text-[11px] text-text-secondary leading-snug">Everyone builds freely — no player restrictions across squads.</span>
                <ul className="flex flex-col gap-[3px]">
                  <li className="text-[10px] text-text-tertiary">• Any player, any manager</li>
                  <li className="text-[10px] text-text-tertiary">• 5 transfers per round</li>
                  <li className="text-[10px] text-text-tertiary">• Quick to set up</li>
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
                <span className="text-[11px] text-text-secondary leading-snug">No two managers can own the same player.</span>
                <ul className="flex flex-col gap-[3px]">
                  <li className="text-[10px] text-text-tertiary">• Submit ranked wishlist pre-season</li>
                  <li className="text-[10px] text-text-tertiary">• Lottery resolves contested picks</li>
                  <li className="text-[10px] text-text-tertiary">• 5 transfers/round · unlimited at halfway</li>
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
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-positive animate-live-pulse" />
            <div className="fz-label text-text-secondary">LIVE</div>
          </div>
        </div>

         <div onClick={() => setShowTradeModal(true)} className="bg-[#FFC107] text-black px-4 py-3 flex items-center justify-between cursor-pointer active:opacity-80">
            <div className="text-[13px] font-bold">📨 João wants to trade De Bruyne for your Bellingham. Tap to review.</div>
         </div>

         <TransferWindowBanner {...transferWindow} />

         {/* Draft open banner — shown when deadline is future and no submission yet */}
         {draftOpen && (
           <div
             onClick={() => navigate(`/league/${activeLeague?.league_id}/draft`)}
             className="bg-[#1B5E20] text-white px-4 py-3 flex items-center justify-between cursor-pointer active:opacity-80"
           >
             <div className="text-[13px] font-bold">
               🟢 Draft is open — submit your ranked list before the deadline
             </div>
             <div className="text-[11px] font-black uppercase tracking-widest opacity-80">→</div>
           </div>
         )}

         {/* Manage Squad shortcut */}
         <div className="px-4 py-2 flex gap-2">
           <button
             onClick={() => navigate(`/squad?leagueId=${activeLeague?.league_id}`)}
             className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:opacity-70"
             style={{ background: 'rgba(0,196,232,0.08)', border: '1px solid rgba(0,196,232,0.2)', color: 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}
           >
             👥 Manage Squad
           </button>
           <button
             onClick={() => navigate(`/market?leagueId=${activeLeague?.league_id}`)}
             className="flex-1 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all active:opacity-70"
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
             <div className="bg-[#111111] border-b border-[#2A2A2A]">
               <div className="flex text-[10px] text-[#9E9E9E] font-semibold uppercase tracking-widest px-4 py-2 border-b border-[#1E1E1E]">
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
                  <div key={m.user_id} className={`flex items-center px-4 py-3 border-b border-[#1E1E1E] relative ${isMe ? 'bg-[#161616]' : ''}`}>
                    {isMe && <div className="absolute left-0 top-0 bottom-0 w-1 bg-white" />}
                    <div className="w-8 text-center shrink-0 text-[13px] font-black text-white">{m.rank}</div>
                    <div className="flex-1 px-3 flex items-center gap-2 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[9px] font-bold text-[#9E9E9E] shrink-0">{mName.substring(0,2)}</div>
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
                    <div className="w-12 text-right shrink-0 text-[13px] font-bold text-[#9E9E9E]">-</div>
                    <div className="w-12 text-right shrink-0 text-[13px] font-black text-white">{m.total_points}</div>
                    <button onClick={() => { setManagerTeamView({ user_id: m.user_id, name: mName }); loadManagerRoster(m.user_id); }} className="ml-3 w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-xs active:scale-95">🔍</button>
                  </div>
                )
              }))}
             </div>

             <div className="px-4 py-1.5 bg-[#0D0D0D] border-b border-[#1E1E1E]">
                <span className="text-[11px] font-bold text-[#9E9E9E] uppercase tracking-[.14em]">Activity</span>
             </div>
             
             <div className="bg-[#111111] min-h-[40vh]">
               <div className="w-full relative px-4 py-4 bg-[#1A1A1A] border-b border-[#1E1E1E]">
                 <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-negative" />
                 <div className="text-[9px] text-[#E53935] uppercase tracking-[.14em] font-black mb-1">RANK AMBUSH</div>
                 <div className="text-[16px] font-bold text-white mb-1 leading-snug">Ricardo's Mbappé just happened to you.</div>
                 <div className="text-[12px] text-[#9E9E9E] mb-3 font-medium">FRA scored 74' · FRA 1-0 DEN</div>
                 <div className="flex justify-between items-center">
                     <div className="flex items-center gap-2">
                       <div className="w-6 h-6 rounded-full bg-bg border border-border flex items-center justify-center text-[10px] text-text-secondary font-bold">RI</div>
                       <span className="text-[12px] font-bold text-[#9E9E9E]">Ricardo</span>
                     </div>
                     <div className="flex gap-1.5">
                        <button className="px-3 py-1.5 rounded-full bg-[#2A2A2A] text-white font-bold text-[11px]">😤 2</button>
                        <button className="px-3 py-1.5 rounded-full bg-[#1A1A1A] text-[#9E9E9E] font-bold text-[11px]">💀 1</button>
                     </div>
                 </div>
               </div>
               {[
                 { id: 1, icon: '📈', text: 'You moved from 3rd to 2nd after Vinicius Jr. scored', delta: '+10', dColor: 'text-positive' },
                 { id: 2, icon: '🔨', text: 'Ricardo won the Bellingham auction', delta: '€24M', dColor: 'text-text-tertiary' },
                 { id: 3, icon: '🟨', text: 'Hakimi yellow card (MAR)', delta: '-1', dColor: 'text-negative' },
               ].map(e => (
                 <div key={e.id} className="flex px-4 py-3 border-b border-[#1E1E1E] items-center gap-3">
                   <div className="w-8 h-8 rounded-full bg-[#161616] flex justify-center items-center shrink-0 border border-[#2A2A2A] text-sm">{e.icon}</div>
                   <div className="flex-1 text-[13px] font-bold text-white leading-snug">{e.text}</div>
                   <div className={`font-mono text-[14px] font-bold ${e.dColor}`}>{e.delta}</div>
                 </div>
               ))}
               <div className="p-8 text-center text-[11px] text-[#555] font-bold uppercase tracking-widest">End of Activity</div>
             </div>
           </>
         )}

         {view === 'frontpage' && (
           <div className="bg-[#f2f2f2] text-[#1a1a1a] min-h-screen">
             <div className="px-6 py-8 border-b-2 border-black flex flex-col items-center text-center">
                <div className="text-[10px] font-black uppercase tracking-[0.4em] mb-2 font-serif underline decoration-2 underline-offset-4">The Official Gazette</div>
                <h1 className="font-serif text-4xl font-black italic tracking-tighter leading-none mb-1">FORZA TIMES</h1>
                <div className="w-full flex justify-between border-t border-b border-black/10 mt-4 py-1 text-[9px] font-bold uppercase tracking-widest">
                   <span>VOL. MCXXIV</span>
                   <span>DOHA • {new Date().toLocaleDateString()}</span>
                   <span>EDITION #42</span>
                </div>
             </div>

             <div className="p-6">
                <div className="bg-red-600 text-white inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-widest mb-3 animate-pulse">Breaking News</div>
                <h2 className="font-serif text-3xl font-black leading-tight mb-3 tracking-tight">Kylian Mbappé Injured; Due to Miss Quarter-Finals</h2>
                <p className="text-[14px] leading-relaxed font-medium mb-6 italic opacity-80">"It's a heavy blow for the champions," says Deschamps as results confirmed a tear.</p>
                <div className="grid grid-cols-2 gap-6 border-t border-black/20 pt-6">
                   <div>
                      <div className="text-[9px] font-black uppercase text-red-600 mb-1">League Recap</div>
                      <h3 className="font-serif text-xl font-bold leading-tight mb-2">Alex Tactics beats João</h3>
                      <p className="text-[11px] leading-relaxed">A dominant 42-point victory this matchday.</p>
                   </div>
                   <div className="border-l border-black/20 pl-4">
                      <div className="text-[9px] font-black uppercase text-blue-600 mb-1">Transfer Bomba</div>
                      <h3 className="font-serif text-xl font-bold leading-tight mb-2">Big Trade Confirmed</h3>
                      <p className="text-[11px] leading-relaxed">Neymar for Messi swap deal shakes up the leaderboards.</p>
                   </div>
                </div>

                {/* Draft report — renders only when a draft_report gazette entry exists */}
                <GazetteDraftReport leagueId={activeLeague?.league_id} />
             </div>

             <div className="px-6 py-4 border-t-4 border-black bg-black text-white">
                <div className="fz-label text-cyan text-[8px] mb-2 brightness-150">WARZONE HIGHLIGHTS</div>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <span className="text-[#555] font-black">@Ana_K:</span>
                    <span className="text-[11px] leading-tight font-medium italic opacity-70">"Wait, did you guys see Taylor United just cashed out 50pts for Ronaldo? Risky business..."</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[#555] font-black">@GamerX:</span>
                    <span className="text-[11px] leading-tight font-medium italic opacity-70">"I'm keeping my Joker for the Morocco game. Trust the process."</span>
                  </div>
                </div>
             </div>

             <div className="p-8 text-center bg-[#f2f2f2] border-t-2 border-dashed border-black/20">
                <div className="w-12 h-1 bg-black mx-auto mb-4" />
                <div className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">End of Morning Edition</div>
                <div className="text-[8px] mt-2 italic opacity-30">All data generated by Forza Intelligence Agency (FIA)</div>
             </div>
           </div>
         )}

         {view === 'chat' && (
            <div className="flex-1 min-h-[60vh] flex flex-col bg-[#0D0D0D]">
              <div className="bg-[#111111] px-4 py-2 border-b border-[#1E1E1E] flex items-center gap-2">
                <span className="text-[10px]">📌</span>
                <span className="text-[11px] font-bold text-[#9E9E9E]">Auction deadline is tonight at 21:00.</span>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-5">
                <div className="flex flex-col gap-1 w-[85%] animate-in slide-in-from-left">
                   <div className="text-[10px] text-text-tertiary font-black uppercase tracking-wider mb-1 ml-2">João (Rank #1)</div>
                   <div className="bg-[#161616] text-white text-[14px] px-4 py-2.5 rounded-2xl rounded-tl-sm border border-[#1E1E1E]">
                     Did anyone else captain Mbappe? Need this fast.
                   </div>
                   <div className="text-[9px] text-text-tertiary mt-1 ml-2">10:42 PM</div>
                </div>
                <div className="flex flex-col gap-1 w-[85%] self-end items-end animate-in slide-in-from-right">
                   <div className="text-[10px] text-cyan font-black uppercase tracking-wider mb-1 mr-2 text-right">You (Rank #2)</div>
                   <div className="bg-cyan/10 text-white text-[14px] px-4 py-2.5 rounded-2xl rounded-tr-sm border border-cyan/20">
                     I literally transferred him out yesterday. I'm sick.
                   </div>
                   <div className="text-[9px] text-text-tertiary mt-1 mr-2 text-right">10:45 PM</div>
                </div>
                <div className="flex flex-col gap-1 w-[85%] animate-in slide-in-from-left">
                   <div className="text-[10px] text-text-tertiary font-black uppercase tracking-wider mb-1 ml-2">Ana (Rank #4)</div>
                   <div className="bg-[#161616] text-white text-[14px] px-4 py-2.5 rounded-2xl rounded-tl-sm border border-[#1E1E1E]">
                     Wait, is Mbappe out of the next game? I should sell.
                   </div>
                   <div className="text-[9px] text-text-tertiary mt-1 ml-2">10:48 PM</div>
                </div>
              </div>
              <div className="p-4 bg-[#111111] border-t border-[#1E1E1E]">
                 <div className="bg-[#1A1A1A] border border-[#2A2A2A] rounded-full flex items-center px-4 py-1">
                    <input type="text" placeholder="Roast your rivals..." className="flex-1 bg-transparent py-3 text-sm text-white outline-none" />
                    <button className="w-8 h-8 rounded-full bg-cyan text-black flex items-center justify-center font-bold">↑</button>
                 </div>
              </div>
            </div>
          )}

         {view === 'stats' && (
            <div className="p-5 space-y-5 bg-bg min-h-[60vh] pb-10">
               <div className="fz-card p-5 border-cyan/20 bg-cyan/5">
                  <div className="fz-label text-cyan mb-2">League Intelligence</div>
                  <div className="text-xl font-bold text-white mb-4">Total Squad Value</div>
                  <div className="flex items-end gap-3 text-white">
                     <span className="text-3xl font-black">€1.4B</span>
                     <span className="text-positive text-sm font-bold">+12%</span>
                  </div>
                  <div className="mt-4 h-1 w-full bg-[#1A1A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-cyan w-2/3" />
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] font-bold text-[#555] uppercase tracking-widest">
                    <span>Low: €0.8B</span>
                    <span>High: €1.5B</span>
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#111111] border border-[#1E1E1E] p-4 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">🔥</span>
                      <span className="text-[10px] font-black uppercase text-text-tertiary tracking-widest leading-none">Top Scorer</span>
                    </div>
                    <div className="text-xl font-black text-white leading-tight">Mbappé</div>
                    <div className="text-[12px] font-bold text-positive mt-1">424 Points</div>
                  </div>
                  <div className="bg-[#111111] border border-[#1E1E1E] p-4 rounded-xl shadow-lg">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg">💰</span>
                      <span className="text-[10px] font-black uppercase text-text-tertiary tracking-widest leading-none">Net Value</span>
                    </div>
                    <div className="text-xl font-black text-white leading-tight">€42M</div>
                    <div className="text-[12px] font-bold text-positive mt-1">↑ €2.5M</div>
                  </div>
               </div>

               <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 shadow-xl relative overflow-hidden">
                  <div className="absolute right-[-20px] top-[-20px] w-32 h-32 bg-cyan/5 rounded-full blur-3xl" />
                  <div className="text-[10px] font-black uppercase tracking-widest text-cyan mb-5 flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-cyan shadow-[0_0_8px_cyan]" />
                    Performance Breakdown
                  </div>
                  
                  <div className="space-y-4">
                    {[
                      { label: 'Avg. Transfer Cost', val: '€12.4M', color: 'bg-cyan' },
                      { label: 'Clean Sheets (League)', val: '14', color: 'bg-positive' },
                      { label: 'Yellow Cards', val: '22', color: 'bg-yellow-500' },
                      { label: 'MD 17 High Score', val: '84 pts', color: 'bg-purple-500' },
                    ].map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between border-b border-white/5 pb-2">
                        <div className="flex items-center gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full ${s.color}`} />
                          <span className="text-[13px] font-bold text-[#9E9E9E]">{s.label}</span>
                        </div>
                        <span className="text-[15px] font-black text-white">{s.val}</span>
                      </div>
                    ))}
                  </div>
               </div>

               <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
                  <div className="text-[10px] font-black uppercase tracking-widest text-[#9E9E9E] mb-4">Biggest Risers this Matchday</div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-2 bg-positive/5 border border-positive/10 rounded-lg">
                       <span className="text-[13px] font-bold text-white">Ana</span>
                       <div className="flex items-center gap-2">
                          <span className="text-positive font-black">↑ 2</span>
                          <span className="text-[10px] text-positive/50">84 pts</span>
                       </div>
                    </div>
                    <div className="flex items-center justify-between p-2 bg-white/5 border border-white/5 rounded-lg opacity-60">
                       <span className="text-[13px] font-bold text-white">Ricardo</span>
                       <div className="flex items-center gap-2">
                          <span className="text-[#555] font-black">- 0</span>
                          <span className="text-[10px] text-[#555]">62 pts</span>
                       </div>
                    </div>
                  </div>
               </div>
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
           </div>
         )}

         {/* ── MODALS ─────────────────────────────────────────────────────── */}
         
         {showTradeModal && (
           <div className="fixed inset-0 z-50 flex items-end bg-black/80" onClick={() => setShowTradeModal(false)}>
             <div className="w-full h-[70vh] bg-[#0D0D0D] rounded-t-xl p-6 flex flex-col border-t border-[#2A2A2A]" onClick={e => e.stopPropagation()}>
               <h2 className="text-xl font-bold text-white mb-6">João's Offer</h2>
               <div className="flex-1 flex flex-col gap-4">
                 <div className="bg-[#111111] p-4 rounded-lg flex justify-between items-center text-white font-bold">
                    <span>YOU GIVE: Bellingham</span>
                    <span className="text-[#1E88E5]">↔</span>
                    <span>YOU GET: De Bruyne</span>
                 </div>
                 <div className="text-positive font-black">+ €5.0M</div>
               </div>
               <div className="flex gap-3 mt-auto pb-6">
                 <button onClick={() => setShowTradeModal(false)} className="flex-1 py-4 bg-[#111111] text-white font-black rounded">DECLINE</button>
                 <button onClick={() => setShowTradeModal(false)} className="flex-1 py-4 bg-[#00C853] text-white font-black rounded">ACCEPT</button>
               </div>
             </div>
           </div>
         )}

         {showTradeBuilder && tradeTarget && (
            <div className="fixed inset-0 z-50 flex items-end outline-none bg-black/80 animate-in fade-in" onClick={() => setShowTradeBuilder(false)}>
               <div className="w-full h-[90vh] bg-[#0D0D0D] rounded-t-2xl flex flex-col animate-in slide-in-from-bottom border-t border-[#2A2A2A] relative" onClick={e => e.stopPropagation()}>
                  <div className="w-full flex justify-center py-3"><div className="w-12 h-1.5 bg-[#2A2A2A] rounded-full" /></div>
                  <div className="px-6 py-4 border-b border-[#1E1E1E] flex justify-between items-center">
                    <div>
                      <div className="text-[10px] text-[#1E88E5] font-black uppercase tracking-[.14em] mb-1">NEGOTIATION TABLE</div>
                      <h2 className="text-xl font-bold text-white">Trade with {tradeTarget.name}</h2>
                    </div>
                    <button onClick={() => setShowTradeBuilder(false)} className="text-[#9E9E9E] hover:text-white transition-colors">✕</button>
                  </div>
                  <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-8 no-scrollbar">
                    <div className="grid grid-cols-[1fr_40px_1fr] items-center gap-2">
                      <div className="flex flex-col gap-2">
                        <label className="text-[9px] font-black text-[#9E9E9E] uppercase tracking-widest text-center">MY PLAYER</label>
                        <select value={tradeMyPlayer?.id || ''} onChange={(e) => setTradeMyPlayer(mySquadPlayers.find(p => p.id === e.target.value))} className="bg-[#111111] border border-[#2A2A2A] p-3 rounded-lg text-white text-[12px] font-bold outline-none text-center">
                           <option value="">{mySquadPlayers.length ? '(None)' : 'Loading…'}</option>
                           {mySquadPlayers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        {tradeMyPlayer && (
                          <button
                            onClick={() => toggleListing(tradeMyPlayer.id)}
                            className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border transition-all ${
                              myListings.has(tradeMyPlayer.id)
                                ? 'border-[#00C853]/40 text-[#00C853] bg-[#00C853]/10'
                                : 'border-[#2A2A2A] text-[#555]'
                            }`}
                          >
                            {myListings.has(tradeMyPlayer.id) ? '✓ Listed for trade' : '+ List for trade'}
                          </button>
                        )}
                      </div>
                      <div className="text-[#2A2A2A] text-xl mt-6 flex justify-center">↔</div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[9px] font-black text-[#9E9E9E] uppercase tracking-widest text-center">THEIR PLAYER</label>
                        <select value={tradeTheirPlayer?.id || ''} onChange={(e) => setTradeTheirPlayer(theirSquadPlayers.find(p => p.id === e.target.value))} className="bg-[#111111] border border-[#2A2A2A] p-3 rounded-lg text-white text-[12px] font-bold outline-none text-center text-ellipsis overflow-hidden">
                           <option value="">{theirSquadPlayers.length ? '(None)' : 'Loading…'}</option>
                           {theirSquadPlayers.map(p => <option key={p.id} value={p.id}>{p.name} ({p.club})</option>)}
                        </select>
                      </div>
                    </div>
                    
                    <div className="space-y-4 pt-6 border-t border-[#1E1E1E]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[12px] font-bold text-white">Add Cash Sweetener</span>
                        <span className="text-[14px] font-black text-positive">€{tradeCash.toFixed(1)}M</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] text-[#9E9E9E]">€0M</span>
                        <input type="range" min="-10" max="10" step="0.5" value={tradeCash} onChange={e => setTradeCash(parseFloat(e.target.value))} className="flex-1 accent-cyan" />
                        <span className="text-[10px] text-[#9E9E9E]">€10M</span>
                      </div>
                      <p className="text-[10px] text-[#9E9E9E] italic text-center">Shift budget caps to balance unequal player values.</p>
                    </div>

                    <div className="space-y-4 pt-6 border-t border-[#1E1E1E]">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[12px] font-bold text-white">Add Points Penalty</span>
                        <span className="text-[14px] font-black text-[#E53935]">{tradePoints} pts</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] text-[#9E9E9E]">0</span>
                        <input type="range" min="0" max="50" step="5" value={tradePoints} onChange={e => setTradePoints(parseInt(e.target.value))} className="flex-1 accent-[#E53935]" />
                        <span className="text-[10px] text-[#9E9E9E]">50</span>
                      </div>
                      <p className="text-[10px] text-[#9E9E9E] italic text-center">Give up raw ranking points to secure a star player.</p>
                    </div>
                  </div>
                  <div className="p-6 border-t border-[#1E1E1E] bg-[#0D0D0D] space-y-3">
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
             <div className="w-full h-[80vh] bg-[#0D0D0D] rounded-t-2xl flex flex-col border-t border-[#2A2A2A]" onClick={e => e.stopPropagation()}>
               <div className="p-6 border-b border-[#1E1E1E] flex justify-between items-center">
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
                   <div key={i} className="flex items-center gap-4 bg-[#111111] p-3 border border-[#2A2A2A] rounded-lg relative overflow-hidden group">
                     <div className="absolute left-0 top-0 bottom-0 w-1 bg-cyan/20 group-hover:bg-cyan transition-colors" />
                     <div className="w-10 h-10 rounded bg-[#1A1A1A] flex items-center justify-center text-[10px] font-bold text-[#555] overflow-hidden grayscale"><img src={`https://media.api-sports.io/football/players/${(i % 10) + 600}.png`} className="w-full h-full object-cover" /></div>
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
          <div style={{ fontSize: '36px', marginBottom: '12px' }}>🏆</div>
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
      <div className="mx-4 mt-6 p-5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
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
            ⚠️ {joinError}
          </div>
        )}
      </div>
    </div>
  );
}
