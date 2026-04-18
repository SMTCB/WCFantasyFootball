import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import SectionHeader from '../components/SectionHeader';

import H2HSheet from '../components/H2HSheet';

// ─── Shared Mock Data ────────────────────────────────────────────────────────
const MOCK_PLAYERS_POOL = [
  { id: 'p1', name: 'Alisson', club: 'BRA', position: 'GK', price: 6.0 },
  { id: 'p2', name: 'E. Martínez', club: 'ARG', position: 'GK', price: 6.0 },
  { id: 'p3', name: 'Courtois', club: 'BEL', position: 'GK', price: 6.0 },
  { id: 'p12', name: 'Hakimi', club: 'MAR', position: 'DEF', price: 6.0 },
  { id: 'p13', name: 'Rúben Dias', club: 'POR', position: 'DEF', price: 6.0 },
  { id: 'p14', name: 'V. van Dijk', club: 'NED', position: 'DEF', price: 6.5 },
  { id: 'p15', name: 'Saliba', club: 'FRA', position: 'DEF', price: 5.5 },
  { id: 'p16', name: 'A. Arnold', club: 'ENG', position: 'DEF', price: 6.0 },
  { id: 'p17', name: 'Cancelo', club: 'POR', position: 'DEF', price: 6.0 },
  { id: 'p18', name: 'Theo', club: 'FRA', position: 'DEF', price: 5.5 },
  { id: 'p21', name: 'Bellingham', club: 'ENG', position: 'MID', price: 10.5 },
  { id: 'p22', name: 'Pedri', club: 'ESP', position: 'MID', price: 8.5 },
  { id: 'p23', name: 'De Bruyne', club: 'BEL', position: 'MID', price: 11.0 },
  { id: 'p24', name: 'Valverde', club: 'URU', position: 'MID', price: 9.0 },
  { id: 'p25', name: 'Musiala', club: 'GER', position: 'MID', price: 9.0 },
  { id: 'p26', name: 'Rodri', club: 'ESP', position: 'MID', price: 9.5 },
  { id: 'p27', name: 'Bruno F.', club: 'POR', position: 'MID', price: 9.0 },
  { id: 'p31', name: 'Mbappé', club: 'FRA', position: 'FWD', price: 12.5 },
  { id: 'p32', name: 'Vinícius Jr', club: 'BRA', position: 'FWD', price: 12.0 },
  { id: 'p33', name: 'Haaland', club: 'NOR', position: 'FWD', price: 13.5 },
  { id: 'p34', name: 'Messi', club: 'ARG', position: 'FWD', price: 11.5 },
  { id: 'p35', name: 'Kane', club: 'ENG', position: 'FWD', price: 11.0 },
  { id: 'p36', name: 'Salah', club: 'EGY', position: 'FWD', price: 11.0 },
  { id: 'p37', name: 'Neymar', club: 'BRA', position: 'FWD', price: 10.5 },
];

const MOCK_SQUAD_PLAYERS = MOCK_PLAYERS_POOL.slice(0, 11);
const MOCK_RIVAL_PLAYERS_L1 = MOCK_PLAYERS_POOL.slice(5, 16);
const MOCK_RIVAL_PLAYERS_L2 = MOCK_PLAYERS_POOL.slice(8, 19);
const MOCK_RIVAL_PLAYERS_L3 = MOCK_PLAYERS_POOL.slice(12, 23);


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
                 <div className="text-xl font-bold text-white mb-4">Total Squad Value</div>
                 <div className="flex items-end gap-3 text-white">
                    <span className="text-3xl font-black">€1.4B</span>
                    <span className="text-positive text-sm font-bold">+12%</span>
                 </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div className="fz-card p-4">
                    <div className="text-[10px] font-black uppercase text-text-tertiary mb-2">Top Scorer</div>
                    <div className="text-white font-bold">Mbappé</div>
                 </div>
                 <div className="fz-card p-4">
                    <div className="text-[10px] font-black uppercase text-text-tertiary mb-2">Duo of the week</div>
                    <div className="text-white font-bold">KDB & Vini</div>
                 </div>
              </div>
              <div className="bg-[#111111] border border-[#2A2A2A] rounded-lg p-5">
                 <div className="text-[10px] font-black uppercase tracking-widest text-[#9E9E9E] mb-4">Biggest Risers</div>
                 <div className="flex items-center justify-between">
                    <div className="flex gap-2 items-center">
                      <div className="text-2xl font-black text-positive tracking-tighter">↑2</div>
                      <div className="font-bold text-white text-[14px]">Ana</div>
                    </div>
                    <div className="text-[12px] font-bold text-[#9E9E9E]">jumped to 3rd</div>
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
                        <select value={tradeMyPlayer?.id || ''} onChange={(e) => setTradeMyPlayer(MOCK_SQUAD_PLAYERS.find(p => p.id === e.target.value))} className="bg-[#111111] border border-[#2A2A2A] p-3 rounded-lg text-white text-[12px] font-bold outline-none text-center">
                           <option value="">(None)</option>
                           {MOCK_SQUAD_PLAYERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div className="text-[#2A2A2A] text-xl mt-6 flex justify-center">↔</div>
                      <div className="flex flex-col gap-2">
                        <label className="text-[9px] font-black text-[#9E9E9E] uppercase tracking-widest text-center">THEIR PLAYER</label>
                        <select value={tradeTheirPlayer?.id || ''} onChange={(e) => setTradeTheirPlayer(MOCK_RIVAL_PLAYERS.find(p => p.id === e.target.value))} className="bg-[#111111] border border-[#2A2A2A] p-3 rounded-lg text-white text-[12px] font-bold outline-none text-center">
                           <option value="">(None)</option>
                           {MOCK_RIVAL_PLAYERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
                  <div className="p-6 border-t border-[#1E1E1E] bg-[#0D0D0D]">
                    <button onClick={() => { alert('Proposal Sent!'); setShowTradeBuilder(false); }} className="w-full py-4 bg-cyan text-black text-[13px] font-black uppercase tracking-widest rounded active:scale-95 shadow-[0_0_15px_rgba(0,180,216,0.3)]">Broadcast Proposal</button>
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
                 {(managerTeamView.name === 'João' ? MOCK_RIVAL_PLAYERS_L1 : managerTeamView.name === 'Ricardo' ? MOCK_RIVAL_PLAYERS_L2 : MOCK_RIVAL_PLAYERS_L3).map((p, i) => (
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
                     <button onClick={() => { setTradeTarget({ id: managerTeamView.id, name: managerTeamView.name }); setTradeTheirPlayer(p); setManagerTeamView(null); setShowTradeBuilder(true); }} className="w-9 h-9 rounded-full bg-cyan text-black flex items-center justify-center font-bold active:scale-90 transition-transform shadow-[0_4px_10px_rgba(0,180,216,0.3)]">🔄</button>
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
