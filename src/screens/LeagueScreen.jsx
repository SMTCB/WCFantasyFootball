import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import SectionHeader from '../components/SectionHeader';

import H2HSheet from '../components/H2HSheet';

// ─── Shared Mock Data ────────────────────────────────────────────────────────
const MOCK_SQUAD_PLAYERS = [
  { id: 'p1', name: 'Neymar Jr', club: 'BRA', position: 'FWD', price: 21.5 },
  { id: 'p2', name: 'Bellingham', club: 'ENG', position: 'MID', price: 24.0 },
  { id: 'p3', name: 'Vinícius Jr', club: 'BRA', position: 'FWD', price: 19.5 },
  { id: 'p4', name: 'Pedri', club: 'ESP', position: 'MID', price: 12.0 },
];

const MOCK_RIVAL_PLAYERS = [
  { id: 'rp1', name: 'K. De Bruyne', club: 'BEL', position: 'MID', price: 28.5 },
  { id: 'rp2', name: 'L. Messi', club: 'ARG', position: 'FWD', price: 26.0 },
  { id: 'rp3', name: 'H. Kane', club: 'ENG', position: 'FWD', price: 24.5 },
  { id: 'rp4', name: 'Cristiano Ronaldo', club: 'POR', position: 'FWD', price: 18.0 },
  { id: 'rp5', name: 'Salah', club: 'EGY', position: 'FWD', price: 16.5 },
];

export default function LeagueScreen() {
  const navigate = useNavigate();
  const { leagueId } = useParams();

  const [leagues, setLeagues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); 
  const [activeLeague, setActiveLeague] = useState(null);
  const [showTradeModal, setShowTradeModal] = useState(false);
  const [activeEmojiPickerId, setActiveEmojiPickerId] = useState(null);
  const [showTradeBuilder, setShowTradeBuilder] = useState(false);
  
  const [managerTeamView, setManagerTeamView] = useState(null); // { id, name }
  const [tradeMyPlayer, setTradeMyPlayer] = useState(null);
  const [tradeTheirPlayer, setTradeTheirPlayer] = useState(null);
  const [tradeCash, setTradeCash] = useState(5.0);
  const [tradePoints, setTradePoints] = useState(0);
  
  const [tradeTarget, setTradeTarget] = useState(null);
  const [h2hTarget, setH2hTarget] = useState(null);
  
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  // Form state
  const [leagueName, setLeagueName] = useState('');
  const [leagueFormat, setLeagueFormat] = useState('classic');
  const [formLoading, setFormLoading] = useState(false);

  const renderTabs = () => (
    <div className="flex bg-[#161616] border-b border-[#2A2A2A] sticky top-[60px] z-20">
      {['leaderboard', 'frontpage', 'chat', 'stats'].map((t) => (
        <button
          key={t}
          onClick={() => setView(t === 'leaderboard' ? 'detail' : t)}
          className={`flex-1 py-3 text-[10px] font-black uppercase tracking-[.15em] transition-all relative ${
            (view === 'detail' && t === 'leaderboard') || view === t
              ? 'text-white'
              : 'text-[#555] hover:text-[#9E9E9E]'
          }`}
        >
          {t === 'leaderboard' ? 'Leaderboard' : t}
          {((view === 'detail' && t === 'leaderboard') || view === t) && (
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-cyan" />
          )}
        </button>
      ))}
    </div>
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUser(data.user));
    fetchLeagues();
  }, []);

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
      
      if (!mData || mData.length <= 1) {
        const userId = currentUser?.id || '00000000-0000-0000-0000-000000000000';
        setMembers([
          { user_id: userId, total_points: 215, rank: 2, users: { username: 'You' } },
          { user_id: 'd1', total_points: 242, rank: 1, users: { username: 'João' } },
          { user_id: 'd2', total_points: 201, rank: 3, users: { username: 'Ricardo' } },
          { user_id: 'd3', total_points: 195, rank: 4, users: { username: 'Ana' } },
        ]);
      } else {
        setMembers(mData || []);
      }
    } finally {
      setMembersLoading(false);
    }
  };

  const fetchLeagues = async () => {
    try {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      const userId = user?.id || '00000000-0000-0000-0000-000000000000';
      
      const { data, error } = await supabase
        .from('league_members')
        .select(`
          league_id, rank, total_points,
          leagues ( id, name, format )
        `)
        .eq('user_id', userId);
        
      if (error) throw error;
      
      if (!data || data.length === 0) {
        setLeagues([{ 
          league_id: 'L1', 
          leagues: { id: 'L1', name: 'World Cup Official', format: 'classic' },
          rank: 2,
          total_points: 215
        }]);
        return;
      }
      setLeagues(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    if (!leagueName) return;
    try {
      setFormLoading(true);
      const { data: newLeague, error: leagueErr } = await supabase
        .from('leagues')
        .insert({ name: leagueName, format: leagueFormat, created_by: currentUser.id })
        .select()
        .single();
      if (leagueErr) throw leagueErr;
      
      await supabase.from('league_members').insert({ league_id: newLeague.id, user_id: currentUser.id });
      
      setView('list');
      fetchLeagues();
      setLeagueName('');
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setFormLoading(false);
    }
  };

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
              <input type="text" value={leagueName} onChange={(e) => setLeagueName(e.target.value)} className="w-full bg-transparent px-3 py-3 text-[15px] font-medium outline-none text-white" required />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Format</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setLeagueFormat('classic')} className={`py-3 border ${leagueFormat === 'classic' ? 'border-white bg-white/5' : 'border-border bg-surface'} text-sm font-bold uppercase`}>Classic</button>
              <button type="button" onClick={() => setLeagueFormat('noduplicate')} className={`py-3 border ${leagueFormat === 'noduplicate' ? 'border-white bg-white/5' : 'border-border bg-surface'} text-sm font-bold uppercase`}>Draft</button>
            </div>
          </div>
          <button type="submit" disabled={formLoading} className="w-full mt-4 bg-cyan text-black font-bold py-4 uppercase tracking-wider disabled:opacity-50">
            {formLoading ? 'Booting...' : 'Start Season'}
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
                            <button onClick={() => { setTradeTarget({...m, name: mName}); setShowTradeBuilder(true); }} className="text-[8px] text-[#1E88E5] border border-[#1E88E5]/30 px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">Trade</button>
                            <button onClick={() => setH2hTarget({...m, name: mName})} className="text-[8px] text-text-tertiary border border-white/10 px-1.5 py-0.5 rounded-sm uppercase tracking-tighter">&#x2694; H2H</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="w-12 text-right shrink-0 text-[13px] font-bold text-[#9E9E9E]">-</div>
                    <div className="w-12 text-right shrink-0 text-[13px] font-black text-white">{m.total_points}</div>
                    <button onClick={() => setManagerTeamView({ id: m.user_id, name: mName })} className="ml-3 w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-xs active:scale-95">🔍</button>
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
             <div className="px-6 py-8 border-b-2 border-black text-center">
                <div className="text-[10px] font-black uppercase tracking-[0.4em] mb-2 font-serif underline decoration-2 underline-offset-4">The Official Gazette</div>
                <h1 className="font-serif text-4xl font-black italic tracking-tighter leading-none mb-1">FORZA TIMES</h1>
             </div>
             <div className="p-6">
                <div className="bg-red-600 text-white inline-block px-2 py-0.5 text-[9px] font-black uppercase mb-3 animate-pulse">Breaking News</div>
                <h2 className="font-serif text-3xl font-black leading-tight mb-3">Kylian Mbappé Injured; Due to Miss Quarter-Finals</h2>
                <div className="grid grid-cols-2 gap-6 border-t border-black/20 pt-6">
                   <div>
                      <h3 className="font-serif text-xl font-bold mb-2">Alex Tactics beats João</h3>
                      <p className="text-[11px]">A dominant 42-point victory this matchday.</p>
                   </div>
                </div>
             </div>
             <div className="px-6 py-4 border-t-4 border-black bg-black text-white">
                <div className="fz-label text-cyan text-[8px] mb-2">WARZONE HIGHLIGHTS</div>
                <p className="text-[11px] leading-tight font-medium italic opacity-70">"Wait, did you guys see Taylor United just cashed out 50pts for Ronaldo? Risky business..."</p>
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
               <div className="flex flex-col gap-1 w-[80%]">
                  <div className="bg-[#161616] text-white text-[14px] px-4 py-2.5 rounded-2xl rounded-tl-sm border border-[#1E1E1E]">
                    Did anyone else captain Mbappe? Need this fast.
                  </div>
               </div>
               <div className="flex flex-col gap-1 w-[80%] self-end items-end">
                  <div className="bg-[#1E1E1E] text-white text-[14px] px-4 py-2.5 rounded-2xl rounded-tr-sm border border-[#2A2A2A]">
                    I literally transferred him out yesterday. I'm sick.
                  </div>
               </div>
             </div>
             <div className="p-4 bg-[#111111] border-t border-[#1E1E1E]">
                <input type="text" placeholder="Roast your rivals..." className="w-full bg-[#1A1A1A] border border-[#2A2A2A] rounded-full px-4 py-3 text-sm text-white outline-none" />
             </div>
           </div>
         )}

         {view === 'stats' && (
           <div className="p-5 space-y-6 bg-bg min-h-[60vh]">
              <div className="fz-card p-5 border-cyan/20 bg-cyan/5">
                 <div className="fz-label text-cyan mb-2">League Intelligence</div>
                 <div className="flex items-end gap-3 text-white">
                    <span className="text-3xl font-black">€1.4B</span>
                    <span className="text-positive text-sm font-bold">+12%</span>
                 </div>
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
            <div className="fixed inset-0 z-50 flex items-end bg-black/80" onClick={() => setShowTradeBuilder(false)}>
               <div className="w-full h-[80vh] bg-[#0D0D0D] rounded-t-2xl p-6 flex flex-col border-t border-[#2A2A2A]" onClick={e => e.stopPropagation()}>
                  <h2 className="text-white font-bold text-lg mb-6 uppercase tracking-widest">Trade with {tradeTarget.name}</h2>
                  <div className="space-y-6">
                     <select className="w-full bg-[#1A1A1A] border border-[#2A2A2A] p-4 text-white rounded-lg">
                        <option>Select your player...</option>
                        {MOCK_SQUAD_PLAYERS.map(p => <option key={p.id}>{p.name}</option>)}
                     </select>
                     <select className="w-full bg-[#1A1A1A] border border-[#2A2A2A] p-4 text-white rounded-lg">
                        <option>Select their player...</option>
                        {MOCK_RIVAL_PLAYERS.map(p => <option key={p.id}>{p.name}</option>)}
                     </select>
                  </div>
                  <button onClick={() => setShowTradeBuilder(false)} className="w-full mt-auto mb-6 py-4 bg-cyan text-black font-black uppercase tracking-widest rounded transition-transform active:scale-95">Send Proposal</button>
               </div>
            </div>
         )}

         {managerTeamView && (
           <div className="fixed inset-0 z-50 flex items-end bg-black/80" onClick={() => setManagerTeamView(null)}>
             <div className="w-full h-[80vh] bg-[#0D0D0D] rounded-t-2xl flex flex-col border-t border-[#2A2A2A]" onClick={e => e.stopPropagation()}>
               <div className="p-6 border-b border-[#1E1E1E]">
                 <h2 className="text-white font-bold text-lg">{managerTeamView.name}'s Roster</h2>
               </div>
               <div className="flex-1 overflow-y-auto p-6 space-y-4">
                 {MOCK_RIVAL_PLAYERS.map((p, i) => (
                   <div key={i} className="flex items-center gap-4 bg-[#111111] p-3 border border-[#2A2A2A] rounded-lg">
                     <div className="w-10 h-10 rounded bg-[#1A1A1A] flex items-center justify-center text-[10px] font-bold text-[#555] overflow-hidden grayscale"><img src={`https://media.api-sports.io/football/players/${p.id.includes('rp') ? '629' : '569'}.png`} className="w-full h-full object-cover" /></div>
                     <div className="flex-1">
                       <div className="text-[11px] font-black text-cyan uppercase">{p.position}</div>
                       <div className="text-[14px] font-bold text-white">{p.name}</div>
                     </div>
                     <button onClick={() => { setTradeTarget({ id: managerTeamView.id, name: managerTeamView.name }); setTradeTheirPlayer(p); setManagerTeamView(null); setShowTradeBuilder(true); }} className="w-8 h-8 rounded-full bg-cyan/10 border border-cyan/20 flex items-center justify-center">🔄</button>
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
    <div className="pb-16 min-h-screen bg-bg">
      <div className="p-4 border-b border-border bg-surface flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-[15px] font-bold uppercase tracking-wide">My Leagues</h1>
        <button onClick={() => setView('create')} className="text-white text-2xl active:scale-95">+</button>
      </div>
      {loading ? (
        <div className="p-8 text-center text-xs font-bold uppercase tracking-widest opacity-50">Syncing...</div>
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
    </div>
  );
}
