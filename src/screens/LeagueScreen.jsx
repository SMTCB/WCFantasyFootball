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
  
  // New States for Advanced Features
  const [managerTeamView, setManagerTeamView] = useState(null); // { id, name, players }
  const [tradeMyPlayer, setTradeMyPlayer] = useState(null);
  const [tradeTheirPlayer, setTradeTheirPlayer] = useState(null);
  const [tradeCash, setTradeCash] = useState(5.0);
  const [tradePoints, setTradePoints] = useState(0);
  
  const [tradeTarget, setTradeTarget] = useState(null);
  const [h2hTarget, setH2hTarget] = useState(null);         // Feature 05
  
  const [members, setMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [events, setEvents] = useState([]);

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
      setView('detail');
      const { data: lData } = await supabase.from('leagues').select('*').eq('id', id).single();
      if (lData) setActiveLeague({ league_id: id, leagues: lData });
      const { data: mData } = await supabase.from('league_members').select('rank, total_points, user_id, users(username)').eq('league_id', id).order('total_points', { ascending: false });
      setMembers(mData || []);
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
          league_id,
          rank,
          total_points,
          leagues ( id, name, format )
        `)
        .eq('user_id', userId);
        
      if (error) throw error;
      
      // -- DEMO FALLBACK: If DB is empty, show fake rivals
      if (!data || data.length === 0) {
        setLeagues([{ 
          league_id: 'L1', 
          leagues: { id: 'L1', name: 'World Cup Official', format: 'classic' } 
        }]);
        setMembers([
          { user_id: userId, total_points: 215, rank: 4, users: { username: 'You (Demo)' } },
          { user_id: 'd1', total_points: 242, rank: 1, users: { username: 'AlexTactics' } },
          { user_id: 'd2', total_points: 238, rank: 2, users: { username: 'JordanFC' } },
          { user_id: 'd3', total_points: 221, rank: 3, users: { username: 'Taylor United' } },
          { user_id: 'd4', total_points: 195, rank: 5, users: { username: 'Ana_K' } },
          { user_id: 'd5', total_points: 188, rank: 6, users: { username: 'GamerX' } },
          { user_id: 'd6', total_points: 172, rank: 7, users: { username: 'Zidane_Vibes' } },
          { user_id: 'd7', total_points: 154, rank: 8, users: { username: 'League_Ghost' } },
        ]);
        return;
      }
      setLeagues(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadLeagueDetail = (league) => {
    const id = league.league_id || league.id;
    if (id) navigate(`/league/${id}`);
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
      
      const { error: memberErr } = await supabase
        .from('league_members')
        .insert({ league_id: newLeague.id, user_id: currentUser.id });
      if (memberErr) throw memberErr;
      
      setView('list');
      fetchLeagues();
      setLeagueName('');
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setFormLoading(false);
    }
  };

  // ── VIEWS ────────────────────────────────────────────────────────────────

  const renderCreate = () => (
    <div className="pb-16 min-h-screen bg-bg">
      <div className="flex items-center p-4 border-b border-border bg-surface sticky top-0 z-10">
        <button onClick={() => setView('list')} className="text-xl mr-4 text-text-secondary active:scale-95">←</button>
        <h1 className="fz-display text-white text-[18px]">Initialize Campaign</h1>
      </div>
      <form onSubmit={handleCreateLeague} className="p-4 flex flex-col gap-6 mt-4">
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">League Name</label>
          <div className="bg-surface border border-border p-1">
            <input type="text" value={leagueName} onChange={(e) => setLeagueName(e.target.value)} className="w-full bg-transparent px-3 py-3 text-[15px] font-medium outline-none placeholder:text-text-tertiary" required />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">Format</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setLeagueFormat('classic')} className={`py-3 px-4 border ${leagueFormat === 'classic' ? 'border-white bg-white/5' : 'border-border bg-surface'} text-sm font-bold uppercase tracking-tight text-center`}>Classic</button>
            <button type="button" onClick={() => setLeagueFormat('noduplicate')} className={`py-3 px-4 border ${leagueFormat === 'noduplicate' ? 'border-white bg-white/5' : 'border-border bg-surface'} text-sm font-bold uppercase tracking-tight text-center`}>Draft</button>
          </div>
        </div>
        <button type="submit" disabled={formLoading} className="w-full mt-4 bg-cyan text-black font-bold text-[15px] py-4 uppercase tracking-wider disabled:opacity-50 active:scale-[0.98]">
          {formLoading ? 'Booting...' : 'Start Season'}
        </button>
      </form>
    </div>
  );

  if (view === 'create') return renderCreate();

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

         {/* PENDING TRADE BANNER */}
         <div onClick={() => setShowTradeModal(true)} className="bg-[#FFC107] text-black px-4 py-3 flex items-center justify-between cursor-pointer active:opacity-80">
            <div className="text-[13px] font-bold">📨 João wants to trade De Bruyne for your Bellingham. Tap to review.</div>
         </div>

         {/* TRADE REVIEW MODAL */}
         {showTradeModal && (
           <div className="fixed inset-0 z-50 flex items-end outline-none bg-black/80 animate-in fade-in" onClick={() => setShowTradeModal(false)}>
             <div 
               className="w-full h-[85vh] bg-[#0D0D0D] rounded-t-xl flex flex-col animate-in slide-in-from-bottom border-t border-[#2A2A2A] relative"
               onClick={e => e.stopPropagation()}
             >
               <div className="w-full flex justify-center py-3">
                 <div className="w-12 h-1.5 bg-[#2A2A2A] rounded-full" />
               </div>
               
               <div className="px-6 py-4 border-b border-[#1E1E1E]">
                 <div className="text-[10px] text-[#1E88E5] font-black uppercase tracking-[.14em] mb-1">PROPOSED TRADE</div>
                 <h2 className="text-xl font-bold text-white">João's Offer</h2>
               </div>

               <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6">
                 {/* The Comparison */}
                 <div className="flex justify-between items-center bg-[#111111] border border-[#2A2A2A] rounded-lg p-4 relative">
                   <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-white z-10 text-xs">
                     ↔
                   </div>
                   
                   {/* YOU GIVE */}
                   <div className="flex-1 flex flex-col items-center text-center">
                     <span className="text-[10px] font-bold text-negative uppercase tracking-widest mb-3">YOU GIVE</span>
                     <div className="w-16 h-16 rounded-full bg-[#1A1A1A] border-2 border-negative flex items-center justify-center text-xl mb-2 grayscale overflow-hidden">
                       <img src="https://media.api-sports.io/football/players/569.png" className="w-full h-full object-cover" />
                     </div>
                     <span className="text-[14px] font-bold text-white leading-tight">J. Bellingham</span>
                     <span className="text-[11px] text-[#9E9E9E] mt-1">€24.0M • MID</span>
                     <div className="mt-3 bg-[#1A1A1A] w-full py-1.5 rounded text-[11px] font-bold"><span className="text-white">61</span> pts</div>
                   </div>

                   {/* YOU RECEIVE */}
                   <div className="flex-1 flex flex-col items-center text-center">
                     <span className="text-[10px] font-bold text-positive uppercase tracking-widest mb-3">YOU RECEIVE</span>
                     <div className="w-16 h-16 rounded-full bg-[#1A1A1A] border-2 border-positive flex items-center justify-center text-xl mb-2 grayscale overflow-hidden">
                       <img src="https://media.api-sports.io/football/players/629.png" className="w-full h-full object-cover" />
                     </div>
                     <span className="text-[14px] font-bold text-white leading-tight">K. De Bruyne</span>
                     <span className="text-[11px] text-[#9E9E9E] mt-1">€28.5M • MID</span>
                     <div className="mt-3 bg-[#1A1A1A] w-full py-1.5 rounded text-[11px] font-bold"><span className="text-white">84</span> pts</div>
                   </div>
                 </div>

                 <div className="bg-[#111111] border border-[#2A2A2A] p-4 flex justify-between items-center rounded-lg">
                   <div className="text-[12px] font-bold text-[#9E9E9E] uppercase tracking-widest">Credit Delta</div>
                   <div className="text-[14px] font-black text-positive">+ €5.0M</div>
                 </div>

                 <p className="text-[12px] text-[#9E9E9E] text-center leading-relaxed px-4">
                   Accepting this trade will immediately swap the players in your squad and add €5.0M to your budget.
                 </p>
               </div>

               <div className="p-6 border-t border-[#1E1E1E] bg-[#0D0D0D] flex gap-3">
                 <button onClick={() => setShowTradeModal(false)} className="flex-1 py-4 bg-[#111111] border border-[#2A2A2A] text-white text-[13px] font-black uppercase tracking-widest rounded active:scale-95 transition-transform">
                   Decline
                 </button>
                 <button onClick={() => setShowTradeModal(false)} className="flex-1 py-4 bg-[#1E88E5] text-white text-[13px] font-black uppercase tracking-widest rounded active:scale-95 transition-transform">
                   Counter
                 </button>
                 <button onClick={() => setShowTradeModal(false)} className="flex-[1.5] py-4 bg-[#00C853] text-white text-[13px] font-black uppercase tracking-widest rounded active:scale-95 transition-transform">
                   Accept
                 </button>
               </div>
             </div>
           </div>
         )}
         
         {/* TABS */}
         {renderTabs()}

         {view === 'detail' && (
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
           ) : members.length === 0 ? (
             <div className="p-12 text-center fz-label text-text-tertiary uppercase">No managers found</div>
           ) : (
             members.map((m) => {
             const isMe = currentUser && m.user_id === currentUser.id;
             const name = isMe ? 'You' : (m.users?.username || 'Unknown');
             return (
               <div 
                 key={m.user_id} 
                 className={`flex items-center px-4 py-3 border-b border-[#1E1E1E] relative ${isMe ? 'bg-[#161616]' : ''}`}
               >
                 {isMe && <div className="absolute left-0 top-0 bottom-0 w-1 bg-white" />}
                 <div className="w-8 text-center shrink-0 text-[13px] font-black tabular-nums text-white">{m.rank}</div>
                 <div className="flex-1 px-3 flex items-center gap-2 min-w-0">
                   <div className="w-6 h-6 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[9px] font-bold uppercase text-[#9E9E9E] shrink-0">
                     {name.substring(0,2)}
                   </div>
                   <div className="font-bold text-[14px] text-white flex items-center gap-1.5 min-w-0 flex-wrap">
                     <span className="truncate">{name}</span>
                     {!isMe && (
                       <>
                         <button onClick={() => { setTradeTarget({...m, name}); setShowTradeBuilder(true); }} className="text-[8px] text-[#1E88E5] border border-[#1E88E5]/30 px-1.5 py-0.5 rounded-sm uppercase tracking-tighter shrink-0 active:scale-95">Trade</button>
                         <button onClick={() => setH2hTarget({...m, name})} className="text-[8px] text-text-tertiary border border-white/10 px-1.5 py-0.5 rounded-sm uppercase tracking-tighter shrink-0 active:scale-95">&#x2694; H2H</button>
                       </>
                     )}
                   </div>
                 </div>
                 <div className="w-12 text-right shrink-0 text-[13px] font-bold tabular-nums text-[#9E9E9E]">-</div>
                 <div className="w-12 text-right shrink-0 text-[13px] font-black tabular-nums text-white">{m.total_points}</div>
                 <button 
                    onClick={(e) => { e.stopPropagation(); setManagerTeamView({ id: m.user_id, name: name }); }}
                    className="ml-3 w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-xs active:scale-95 transition-transform"
                    title="Scout Team"
                  >
                    🔍
                  </button>
               </div>
             )
           }))}
          </div>
         )}

          {view === 'frontpage' && (
            <div className="bg-[#f2f2f2] text-[#1a1a1a] min-h-screen">
              {/* Newspaper Header */}
              <div className="px-6 py-8 border-b-2 border-black flex flex-col items-center text-center">
                 <div className="text-[10px] font-black uppercase tracking-[0.4em] mb-2 font-serif underline decoration-2 underline-offset-4">The Official Gazette</div>
                 <h1 className="font-serif text-4xl font-black italic tracking-tighter leading-none mb-1">FORZA TIMES</h1>
                 <div className="w-full flex justify-between border-t border-b border-black/10 mt-4 py-1 text-[9px] font-bold uppercase tracking-widest">
                    <span>VOL. MCXXIV</span>
                    <span>DOHA • {new Date().toLocaleDateString()}</span>
                    <span>EDITION #42</span>
                 </div>
              </div>

              {/* MAIN HEADLINE */}
              <div className="p-6">
                 <div className="bg-red-600 text-white inline-block px-2 py-0.5 text-[9px] font-black uppercase tracking-widest mb-3 animate-pulse">Breaking News</div>
                 <h2 className="font-serif text-3xl font-black leading-tight mb-3 tracking-tight">Kylian Mbappé Injured; Due to Miss Quarter-Finals</h2>
                 <p className="text-[14px] leading-relaxed font-medium mb-6 italic opacity-80">
                   "It's a heavy blow for the champions," says Deschamps after the MRI results confirmed a grade 2 hamstring tear.
                 </p>
                 <div className="grid grid-cols-2 gap-6 border-t border-black/20 pt-6">
                    <div>
                       <div className="text-[9px] font-black uppercase text-red-600 mb-1">League Recap</div>
                       <h3 className="font-serif text-xl font-bold leading-tight mb-2">Alex Tactics beats JordanFC by a Landslide</h3>
                       <p className="text-[11px] leading-relaxed">
                         A clinical captaincy choice on Vinicius Jr sealed a dominant 42-point victory this matchday. "He's just on another level," admitted a frustrated JordanFC.
                       </p>
                    </div>
                    <div className="border-l border-black/20 pl-4">
                       <div className="text-[9px] font-black uppercase text-blue-600 mb-1">Transfer Bomba</div>
                       <h3 className="font-serif text-xl font-bold leading-tight mb-2">Market Heats Up: Big Trade Confirmed</h3>
                       <p className="text-[11px] leading-relaxed">
                         Alex Tactics and Taylor United swap Neymar for Messi in a record-breaking multi-asset deal. Experts suggest Ana_K is the dark horse after this trade.
                       </p>
                    </div>
                 </div>
              </div>

              {/* CHAT BANTER / ACTIVITY HIGHLIGHTS */}
              <div className="px-6 py-4 border-t-4 border-black bg-black text-white">
                 <div className="fz-label text-cyan text-[8px] mb-2 brightness-150">WARZONE HIGHLIGHTS</div>
                 <div className="space-y-3">
                   <div className="flex gap-2">
                     <span className="text-[#555] font-black">@Ana_K:</span>
                     <span className="text-[11px] leading-tight font-medium italic">"Wait, did you guys see Taylor United just cashed out 50pts for Ronaldo? Risky business..."</span>
                   </div>
                   <div className="flex gap-2">
                     <span className="text-[#555] font-black">@GamerX:</span>
                     <span className="text-[11px] leading-tight font-medium italic">"I'm keeping my Joker for the Morocco game. Trust the process."</span>
                   </div>
                 </div>
              </div>

              {/* EDITOR'S PICK / SMALLER STORIES */}
              <div className="px-6 py-6 bg-white space-y-6 font-serif">
                 <div>
                   <h4 className="text-[18px] font-black leading-none mb-2 underline">The "Morocco Miracle" Explained</h4>
                   <p className="text-[12px] leading-snug">Scouting reports suggest Al-Nesyri is currently the highest value-to-point ratio in the World Cup.</p>
                 </div>
                 
                 <div className="flex gap-4 items-center group cursor-pointer border-t border-black/10 pt-4">
                    <div className="w-16 h-16 bg-black shrink-0 grayscale group-hover:grayscale-0 transition-all overflow-hidden rounded-sm">
                       <img src="https://media.api-sports.io/football/players/276.png" className="w-full h-full object-cover opacity-80" />
                    </div>
                    <div className="flex-1">
                       <div className="text-[8px] font-black uppercase tracking-widest opacity-50">Expert Analysis</div>
                       <h4 className="text-[13px] font-bold leading-tight">Neymar value drops -2.5% ahead of knockout stage.</h4>
                    </div>
                 </div>
                 <div className="flex gap-4 items-center group cursor-pointer border-t border-black/10 pt-4">
                    <div className="w-16 h-16 bg-black shrink-0 grayscale group-hover:grayscale-0 transition-all overflow-hidden rounded-sm">
                       <img src="https://media.api-sports.io/football/players/642.png" className="w-full h-full object-cover opacity-80" />
                    </div>
                    <div className="flex-1">
                       <div className="text-[8px] font-black uppercase tracking-widest opacity-50">Speculation</div>
                       <h4 className="text-[13px] font-bold leading-tight">Cristiano Ronaldo spotted training alone. Bench start pending for @Taylor United?</h4>
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
           <div className="p-8 text-center flex flex-col items-center justify-center min-h-[40vh]">
             <div className="text-4xl mb-4 grayscale opacity-40">💬</div>
             <div className="fz-label text-text-tertiary uppercase tracking-[0.2em] mb-2">League Warzone</div>
             <p className="text-[14px] text-text-secondary max-w-[200px]">Strategic insights and banter coming soon.</p>
             <div className="mt-8 flex gap-2">
               <button className="bg-surface border border-border px-4 py-2 rounded text-[10px] uppercase font-bold text-text-tertiary">Mute 🔕</button>
               <button className="bg-surface border border-border px-4 py-2 rounded text-[10px] uppercase font-bold text-text-tertiary">Rules 📜</button>
             </div>
           </div>
         )}

         {view === 'stats' && (
           <div className="p-5 space-y-6">
             <div className="fz-card p-5 border-cyan/20 bg-cyan/5">
                <div className="fz-label text-cyan mb-2">League Intelligence</div>
                <div className="text-xl font-bold text-white mb-4">Total Squad Value</div>
                <div className="flex items-end gap-3">
                   <div className="text-3xl font-black text-white">€1.4B</div>
                   <div className="text-positive text-sm pb-1 font-bold">+12% vs last MD</div>
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
           </div>
         )}

         {/* ADVANCED TRADE BUILDER MODAL */}
         {showTradeBuilder && tradeTarget && (
           <div className="fixed inset-0 z-50 flex items-end outline-none bg-black/80 animate-in fade-in" onClick={() => setShowTradeBuilder(false)}>
             <div 
               className="w-full h-[90vh] bg-[#0D0D0D] rounded-t-2xl flex flex-col animate-in slide-in-from-bottom border-t border-[#2A2A2A] relative"
               onClick={e => e.stopPropagation()}
             >
               <div className="w-full flex justify-center py-3">
                 <div className="w-12 h-1.5 bg-[#2A2A2A] rounded-full" />
               </div>
               
               <div className="px-6 py-4 border-b border-[#1E1E1E] flex justify-between items-center">
                 <div>
                   <div className="text-[10px] text-[#1E88E5] font-black uppercase tracking-[.14em] mb-1">NEGOTIATION TABLE</div>
                   <h2 className="text-xl font-bold text-white">Trade with {tradeTarget.name}</h2>
                 </div>
                 <button onClick={() => setShowTradeBuilder(false)} className="text-[#9E9E9E] hover:text-white transition-colors">✕</button>
               </div>

               <div className="flex-1 overflow-y-auto px-6 py-8 flex flex-col gap-8 no-scrollbar">
                 {/* Selectors Grid */}
                 <div className="grid grid-cols-[1fr_40px_1fr] items-center gap-2">
                   {/* My Slot */}
                   <div className="flex flex-col gap-2">
                     <label className="text-[9px] font-black text-[#9E9E9E] uppercase tracking-widest text-center">MY PLAYER</label>
                     <select 
                       value={tradeMyPlayer?.id || ''} 
                       onChange={(e) => setTradeMyPlayer(MOCK_SQUAD_PLAYERS.find(p => p.id === e.target.value))}
                       className="bg-[#111111] border border-[#2A2A2A] p-3 rounded-lg text-white text-[12px] font-bold outline-none ring-0 appearance-none text-center"
                     >
                        <option value="">(None)</option>
                        {MOCK_SQUAD_PLAYERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                     {tradeMyPlayer && (
                       <div className="p-3 bg-white/5 border border-white/5 rounded-lg flex flex-col items-center animate-in zoom-in-95 duration-200">
                         <img src={`https://media.api-sports.io/football/players/${tradeMyPlayer.id === 'p1' ? '276' : '154'}.png`} className="w-10 h-10 object-cover rounded-full grayscale mb-2 border border-white/10" />
                         <div className="text-[11px] font-bold text-white">{tradeMyPlayer.name}</div>
                       </div>
                     )}
                   </div>

                   <div className="text-[#2A2A2A] text-xl mt-6 flex justify-center">↔</div>

                   {/* Their Slot */}
                   <div className="flex flex-col gap-2">
                     <label className="text-[9px] font-black text-[#9E9E9E] uppercase tracking-widest text-center">THEIR PLAYER</label>
                     <select 
                       value={tradeTheirPlayer?.id || ''} 
                       onChange={(e) => setTradeTheirPlayer(MOCK_RIVAL_PLAYERS.find(p => p.id === e.target.value))}
                       className="bg-[#111111] border border-[#2A2A2A] p-3 rounded-lg text-white text-[12px] font-bold outline-none ring-0 appearance-none text-center"
                     >
                        <option value="">(None)</option>
                        {MOCK_RIVAL_PLAYERS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                     </select>
                     {tradeTheirPlayer && (
                       <div className="p-3 bg-white/5 border border-white/5 rounded-lg flex flex-col items-center animate-in zoom-in-95 duration-200">
                         <img src={`https://media.api-sports.io/football/players/${tradeTheirPlayer.id === 'rp1' ? '629' : '569'}.png`} className="w-10 h-10 object-cover rounded-full grayscale mb-2 border border-white/10" />
                         <div className="text-[11px] font-bold text-white">{tradeTheirPlayer.name}</div>
                       </div>
                     )}
                   </div>
                 </div>

                 {/* Sweeteners */}
                 <div className="space-y-6">
                   <div>
                     <div className="flex justify-between items-center mb-3">
                       <label className="text-[9px] font-black text-[#9E9E9E] uppercase tracking-widest">CASH SWEETENER (€)</label>
                       <span className="text-[14px] font-black text-cyan">€{tradeCash.toFixed(1)}M</span>
                     </div>
                     <input 
                       type="range" min="-20" max="20" step="0.5" 
                       value={tradeCash} onChange={(e) => setTradeCash(parseFloat(e.target.value))}
                       className="w-full accent-cyan h-1.5 bg-[#2A2A2A] rounded-full appearance-none cursor-pointer"
                     />
                     <div className="flex justify-between mt-2 text-[8px] text-[#555] font-black uppercase tracking-tighter">
                        <span>Pay Rival</span>
                        <span>No Cash</span>
                        <span>Request Cash</span>
                     </div>
                   </div>

                   <div>
                     <div className="flex justify-between items-center mb-3">
                       <label className="text-[9px] font-black text-negative uppercase tracking-widest">POINT CHIPS (XP)</label>
                       <span className="text-[14px] font-black text-negative">{tradePoints} pts</span>
                     </div>
                     <input 
                       type="range" min="0" max="10" step="1" 
                       value={tradePoints} onChange={(e) => setTradePoints(parseInt(e.target.value))}
                       className="w-full accent-negative h-1.5 bg-[#2A2A2A] rounded-full appearance-none cursor-pointer"
                     />
                     <div className="text-[10px] text-[#555] font-bold mt-1.5 text-center italic">Sacrifice season points to seal the deal.</div>
                   </div>
                 </div>
               </div>

               <div className="p-6 border-t border-[#1E1E1E] bg-[#0D0D0D]">
                 <button 
                   disabled={!tradeMyPlayer && !tradeTheirPlayer && tradeCash === 0 && tradePoints === 0}
                   onClick={() => { alert('Proposal Sent! Awaiting response.'); setShowTradeBuilder(false); }} 
                   className="w-full py-4 bg-cyan text-black text-[13px] font-black uppercase tracking-widest rounded active:scale-95 transition-transform disabled:opacity-30"
                 >
                   Broadcast Proposal
                 </button>
               </div>
             </div>
           </div>
         )}

         {/* MANAGER TEAM VIEW MODAL */}
         {managerTeamView && (
           <div className="fixed inset-0 z-50 flex items-end outline-none bg-black/80 animate-in fade-in" onClick={() => setManagerTeamView(null)}>
             <div 
               className="w-full h-[85vh] bg-[#0D0D0D] rounded-t-2xl flex flex-col animate-in slide-in-from-bottom border-t border-[#2A2A2A] relative"
               onClick={e => e.stopPropagation()}
             >
               <div className="w-full flex justify-center py-3">
                 <div className="w-12 h-1.5 bg-[#2A2A2A] rounded-full" />
               </div>
               
               <div className="px-6 py-4 border-b border-[#1E1E1E] flex justify-between items-center">
                 <div>
                   <div className="text-[10px] text-cyan font-black uppercase tracking-[.14em] mb-1">TEAM SCOUTING</div>
                   <h2 className="text-xl font-bold text-white">{managerTeamView.name}'s Roster</h2>
                 </div>
                 <button onClick={() => setManagerTeamView(null)} className="text-[#9E9E9E] hover:text-white transition-colors">✕</button>
               </div>

               <div className="flex-1 overflow-y-auto p-6 space-y-6">
                 {/* Stats Grid */}
                 <div className="grid grid-cols-3 gap-2">
                    <div className="bg-white/5 p-3 rounded border border-white/5 text-center">
                       <div className="text-[9px] text-[#9E9E9E] font-black uppercase mb-1">Value</div>
                       <div className="text-sm font-black text-white">€102M</div>
                    </div>
                    <div className="bg-white/5 p-3 rounded border border-white/5 text-center">
                       <div className="text-[9px] text-[#9E9E9E] font-black uppercase mb-1">Av. XP</div>
                       <div className="text-sm font-black text-white">4.2</div>
                    </div>
                    <div className="bg-white/5 p-3 rounded border border-white/5 text-center">
                       <div className="text-[9px] text-[#9E9E9E] font-black uppercase mb-1">Trades</div>
                       <div className="text-sm font-black text-white">12</div>
                    </div>
                 </div>

                 <div className="space-y-4">
                   <label className="text-[10px] font-black text-[#555] uppercase tracking-widest">Active Starters</label>
                   {MOCK_RIVAL_PLAYERS.map((p, i) => (
                     <div key={i} className="flex items-center gap-4 bg-surface-elevated p-3 border border-white/5 rounded-lg group">
                       <div className="w-10 h-10 rounded bg-[#1A1A1A] flex items-center justify-center text-[10px] font-bold text-[#555] relative overflow-hidden grayscale group-hover:grayscale-0 transition-all">
                          <img src={`https://media.api-sports.io/football/players/${p.id === 'rp1' ? '629' : '569'}.png`} className="w-full h-full object-cover" />
                       </div>
                       <div className="flex-1">
                         <div className="text-[11px] font-black text-cyan uppercase tracking-tighter">{p.position}</div>
                         <div className="text-[14px] font-bold text-white">{p.name}</div>
                       </div>
                       <div className="text-right">
                          <div className="text-[14px] font-black text-white">41 pts</div>
                          <div className="text-[9px] text-[#9E9E9E] font-bold">€14.5M</div>
                       </div>
                       <button 
                         onClick={() => { setTradeTarget({ id: managerTeamView.id, name: managerTeamView.name }); setTradeTheirPlayer(p); setManagerTeamView(null); setShowTradeBuilder(true); }}
                         className="w-8 h-8 rounded-full bg-cyan/10 border border-cyan/20 flex items-center justify-center active:scale-90 transition-transform"
                       >
                          <span className="text-xs">🔄</span>
                       </button>
                     </div>
                   ))}
                 </div>
               </div>
             </div>
           </div>
         )}

         <div className="px-4 py-1.5 bg-[#0D0D0D] border-b border-[#1E1E1E]">
            <span className="text-[11px] font-bold text-[#9E9E9E] uppercase tracking-[.14em]">Activity</span>
         </div>
         
         <div className="bg-[#111111] min-h-screen">
           
           {/* CALL-OUT CARD (Ricardo's Mbappe) */}
           <div className="w-full relative px-4 py-4 bg-[#1A1A1A] border-b border-[#1E1E1E]">
             <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-negative" />
             <div className="text-[9px] text-[#E53935] uppercase tracking-[.14em] font-black mb-1">RANK AMBUSH</div>
             <div className="text-[16px] font-bold text-white mb-1 leading-snug">
               Ricardo's Mbappé just happened to you.
             </div>
             <div className="text-[12px] text-[#9E9E9E] mb-3 font-medium">
               FRA scored 74' · FRA 1-0 DEN
             </div>
             <div className="flex justify-between items-center">
                 <div className="flex items-center gap-2">
                   <div className="w-6 h-6 rounded-full bg-bg border border-border flex items-center justify-center text-[10px] text-text-secondary uppercase font-bold">RI</div>
                   <span className="text-[12px] font-bold text-[#9E9E9E]">Ricardo</span>
                 </div>
                 <div className="flex gap-1.5 p-1 bg-[#111111] rounded-full">
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#2A2A2A] active:scale-95">
                      <span className="text-sm scale-110">😤</span><span className="text-[11px] font-bold text-white tabular-nums">2</span>
                    </button>
                    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-full active:scale-95">
                      <span className="text-sm">💀</span><span className="text-[11px] font-bold text-[#9E9E9E] tabular-nums">1</span>
                    </button>
                    <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-full active:scale-95 opacity-50"><span className="text-sm">🤝</span></button>
                    <button className="flex items-center gap-1.5 px-2 py-1.5 rounded-full active:scale-95 opacity-50"><span className="text-sm">🔥</span></button>
                 </div>
             </div>
           </div>

           {/* NORMAL WALL ITEMS */}
           {[
             { id: 1, type: 'positive', icon: '📈', text1: 'You moved from 3rd to 2nd after Vinicius Jr. scored', text2: '2m ago', delta: '+10', deltaColor: 'text-positive' },
             { id: 2, type: 'neutral', icon: '🔨', text1: 'Ricardo won the Bellingham auction', text2: '1h ago', delta: '€24.0M', deltaColor: 'text-[#9E9E9E]' },
             { id: 3, type: 'negative', icon: '🟨', text1: 'Hakimi yellow card (MAR)', text2: 'Ricardo\'s team • 43\'', delta: '-1', deltaColor: 'text-negative' },
             { id: 4, type: 'positive', icon: '⚽', text1: 'Vinicius Jr. scored for João\'s team', text2: '67\'', delta: '+10', deltaColor: 'text-positive' },
             { id: 5, type: 'neutral', icon: '🔄', text1: 'Ana transferred out Mbappé, in Osimhen', text2: 'before lock', delta: null, deltaColor: null },
             { id: 6, type: 'neutral', icon: '🃏', text1: 'You activated your Joker: Pedri (ESP)', text2: 'before lock', delta: null, deltaColor: null },
           ].map((e) => {
             const borderColors = { 'positive': 'bg-[#00C853]', 'negative': 'bg-[#E53935]', 'neutral': 'bg-[#1E88E5]' };
             return (
               <div key={e.id} className="relative flex px-4 py-3 border-b border-[#1E1E1E] items-center gap-3 active:bg-[#161616] cursor-pointer">
                 <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${borderColors[e.type]}`} />
                 
                 <div className="w-8 h-8 rounded-full bg-[#161616] flex justify-center items-center shrink-0 border border-[#2A2A2A]">
                    <span className="text-sm">{e.icon}</span>
                 </div>
                 
                 <div className="flex-1 min-w-0 pr-2">
                   <div className="text-[13px] font-bold text-white leading-snug">{e.text1}</div>
                   <div className="text-[11px] text-[#9E9E9E] mt-0.5">{e.text2}</div>
                 </div>
                 
                 <div className="shrink-0 flex flex-col items-end relative">
                   {e.delta && <div className={`font-mono text-[14px] font-bold ${e.deltaColor}`}>{e.delta}</div>}
                   <button 
                    onClick={(ev) => { ev.stopPropagation(); setActiveEmojiPickerId(activeEmojiPickerId === e.id ? null : e.id); }}
                    className={`text-[#9E9E9E] mt-1 pt-1 px-1 transition-colors ${activeEmojiPickerId === e.id ? 'text-white' : 'active:text-white'}`} 
                    title="React"
                   >
                     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                   </button>

                   {activeEmojiPickerId === e.id && (
                     <div className="absolute top-10 right-0 z-30 bg-[#161616] border border-[#2A2A2A] p-2 rounded-full flex gap-2 shadow-2xl animate-in fade-in zoom-in-75 duration-100">
                        {['😤', '🔥', '💀', '😂', '👏', '🤔'].map(emoji => (
                          <button 
                            key={emoji} 
                            onClick={(ev) => { ev.stopPropagation(); setActiveEmojiPickerId(null); }}
                            className="w-8 h-8 rounded-full hover:bg-[#2A2A2A] active:scale-125 transition-transform flex items-center justify-center text-lg"
                          >
                            {emoji}
                          </button>
                        ))}
                     </div>
                   )}
                 </div>
               </div>
             )
           })}

           <div className="p-8 text-center">
             <div className="text-[#9E9E9E] text-[12px] font-medium leading-relaxed max-w-[250px] mx-auto">
               The wall wakes up when matches kick off. Check back at 15:00 for Group C.
             </div>
           </div>

         </div>
         
       </div>
    );
  }

  if (view === 'chat' && activeLeague) {
    return (
       <div className="pb-16 min-h-screen bg-[#0D0D0D] flex flex-col">
         <div className="flex justify-between items-center p-4 border-b border-[#2A2A2A] bg-[#161616] sticky top-0 z-20">
           <div className="flex flex-col">
             <button onClick={() => { setView('list'); setActiveLeague(null); }} className="text-[10px] text-[#9E9E9E] font-bold uppercase tracking-wider leading-none text-left mb-1 active:text-white">← Back</button>
             <h1 className="text-[15px] font-bold uppercase tracking-wide text-white">World Cup Legends</h1>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-positive animate-pulse" />
             <div className="text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-widest">MD4</div>
           </div>
         </div>

         {/* TABS */}
         {renderTabs()}

         {/* PINNED MESSAGE */}
         <div className="bg-[#111111] px-4 py-2 border-b border-[#1E1E1E] flex items-center gap-2">
           <span className="text-[10px]">📌</span>
           <span className="text-[11px] font-bold text-[#9E9E9E]">Auction deadline is tonight at 21:00.</span>
         </div>

         {/* CHAT MESSAGES */}
         <div className="flex-1 overflow-y-auto px-4 py-6 flex flex-col gap-5">
           
           <div className="flex flex-col gap-1 w-[80%]">
              <div className="flex items-center gap-2 mb-1">
                 <div className="w-5 h-5 rounded-full bg-[#1A1A1A] border border-[#2A2A2A] flex items-center justify-center text-[8px] font-bold text-[#9E9E9E]">RI</div>
                 <span className="text-[11px] font-bold text-[#9E9E9E]">Ricardo</span>
              </div>
              <div className="bg-[#161616] text-white text-[14px] px-4 py-2.5 rounded-2xl rounded-tl-sm border border-[#1E1E1E] leading-snug">
                Did anyone else captain Mbappe? Need this fast.
              </div>
              <div className="text-[9px] text-[#555555] font-bold ml-1 mt-0.5">14:02</div>
           </div>

           {/* SYSTEM MESSAGE */}
           <div className="w-full flex justify-center my-2">
              <div className="text-[11px] italic text-[#9E9E9E] text-center max-w-[80%] font-medium">
                ⚽ Vinicius Jr. scored for João's team. +10 points.
              </div>
           </div>

           <div className="flex flex-col gap-1 w-[80%]">
              <div className="flex items-center gap-2 mb-1">
                 <div className="w-5 h-5 rounded-full bg-[#161616] border border-[#2A2A2A] flex items-center justify-center text-[8px] font-bold text-[#9E9E9E]">JO</div>
                 <span className="text-[11px] font-bold text-[#9E9E9E]">João</span>
              </div>
              <div className="bg-[#161616] text-white text-[14px] px-4 py-2.5 rounded-2xl rounded-tl-sm border border-[#1E1E1E] leading-snug">
                Vini is saving my matchday! Let's goooo! 🔥
              </div>
           </div>

           <div className="flex flex-col gap-1 w-[80%] self-end items-end">
              <div className="bg-[#1E1E1E] text-white text-[14px] px-4 py-2.5 rounded-2xl rounded-tr-sm border border-[#2A2A2A] leading-snug">
                I literally transferred him out yesterday. I'm sick.
              </div>
           </div>

           <div className="w-full flex justify-center my-2">
              <div className="text-[11px] italic text-[#9E9E9E] text-center max-w-[80%] font-medium">
                🎖 Ricardo earned the 'Best Steal' badge for winning Pedri at €9M.
              </div>
           </div>
         </div>

         {/* CHAT INPUT */}
         <div className="p-3 bg-[#111111] border-t border-[#1E1E1E] mb-[60px]">
           <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-hide px-1">
             {["😤 That card though", "🔥 My captain 🙌", "💀 GG league", "What a match"].map((chip, i) => (
                <button key={i} className="shrink-0 bg-[#1A1A1A] border border-[#2A2A2A] text-[#9E9E9E] text-[11px] font-bold px-3 py-1.5 rounded-full active:bg-[#2A2A2A] active:text-white transition-colors">{chip}</button>
             ))}
           </div>
           <div className="flex gap-2 items-end">
             <button className="w-10 h-10 shrink-0 bg-[#161616] rounded-full border border-[#2A2A2A] flex justify-center items-center text-xl text-[#9E9E9E]">😊</button>
             <div className="flex-1 bg-[#1A1A1A] border border-[#2A2A2A] rounded-2xl min-h-[40px] flex items-center px-4">
                <input type="text" placeholder="Say something to the league..." className="w-full bg-transparent text-[14px] outline-none text-white placeholder:text-[#555] font-medium" />
             </div>
             <button className="w-10 h-10 shrink-0 bg-[#00C853] rounded-full flex justify-center items-center text-white font-bold active:scale-95 transition-transform opacity-50 cursor-default">↑</button>
           </div>
         </div>

         {/* H2H Sheet — Feature 05 */}
         {h2hTarget && (
           <H2HSheet
             leagueId={activeLeague.league_id}
             myId={currentUser.id}
             rival={h2hTarget}
             myName="You"
             onClose={() => setH2hTarget(null)}
           />
         )}

         
       </div>
    );
  }

  if (view === 'stats' && activeLeague) {
    return (
       <div className="pb-16 min-h-screen bg-[#0D0D0D] flex flex-col">
         <div className="flex justify-between items-center p-4 border-b border-[#2A2A2A] bg-[#161616] sticky top-0 z-20">
           <div className="flex flex-col">
             <button onClick={() => { setView('list'); setActiveLeague(null); }} className="text-[10px] text-[#9E9E9E] font-bold uppercase tracking-wider leading-none text-left mb-1 active:text-white">← Back</button>
             <h1 className="text-[15px] font-bold uppercase tracking-wide text-white">World Cup Legends</h1>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-positive animate-pulse" />
             <div className="text-[10px] font-semibold text-[#9E9E9E] uppercase tracking-widest">MD4</div>
           </div>
         </div>

         {/* TABS */}
         {renderTabs()}

         <div className="p-4 flex flex-col gap-6">
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-lg p-5 flex flex-col items-center">
               <div className="text-[10px] font-black uppercase tracking-widest text-[#9E9E9E] mb-2">Top Rivalry (Points delta)</div>
               <div className="text-[20px] font-black text-white flex gap-3 items-center">
                 <span className="text-[#1E88E5]">João</span>
                 <span className="text-[#555] text-sm">vs</span>
                 <span className="text-positive">You</span>
               </div>
               <div className="text-[12px] font-bold text-negative mt-1">14 pts gap</div>
               
               {/* Dummy sparkline for PoC Stats representation */}
               <div className="w-full h-32 mt-4 relative border-b border-l border-[#2A2A2A]">
                 <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                   <path d="M0,80 L30,40 L60,50 L100,10" fill="none" stroke="#1E88E5" strokeWidth="4" strokeLinejoin="round" />
                   <path d="M0,90 L30,60 L60,40 L100,20" fill="none" stroke="#00C853" strokeWidth="4" strokeLinejoin="round" />
                   <circle cx="100" cy="10" r="4" fill="#1E88E5" />
                   <circle cx="100" cy="20" r="4" fill="#00C853" />
                 </svg>
                 <div className="absolute -bottom-5 right-0 text-[9px] text-[#9E9E9E] font-bold">MD4</div>
                 <div className="absolute -bottom-5 left-0 text-[9px] text-[#9E9E9E] font-bold">MD1</div>
               </div>
            </div>

            <div className="bg-[#111111] border border-[#2A2A2A] rounded-lg p-5 mt-2">
               <div className="text-[10px] font-black uppercase tracking-widest text-[#9E9E9E] mb-4">Biggest Risers this Matchday</div>
               <div className="flex items-center justify-between border-b border-[#1E1E1E] pb-3 mb-3">
                 <div className="flex gap-2 items-center">
                   <div className="text-2xl font-black text-positive tracking-tighter">↑2</div>
                   <div className="font-bold text-white text-[14px]">Ana</div>
                 </div>
                 <div className="text-[12px] font-bold text-[#9E9E9E]">jumped to 3rd</div>
               </div>
               <div className="flex items-center justify-between">
                 <div className="flex gap-2 items-center">
                   <div className="text-2xl font-black text-negative tracking-tighter">↓2</div>
                   <div className="font-bold text-white text-[14px]">Ricardo</div>
                 </div>
                 <div className="text-[12px] font-bold text-[#9E9E9E]">fell to 4th</div>
               </div>
            </div>
            
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-lg p-5 flex flex-col items-center mt-2">
               <div className="text-[10px] font-black uppercase tracking-widest text-[#9E9E9E] mb-2">Power-up Chips Used</div>
               <div className="text-3xl font-black text-white">0 / 4</div>
               <div className="text-[11px] text-[#555] font-semibold mt-1">No managers used chips this MD.</div>
            </div>
         </div>
         
         
       </div>
    );
  }

  // Active / List View
  return (
    <div className="pb-16 min-h-screen bg-bg">
      <div className="p-4 border-b border-border bg-surface flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-[15px] font-bold uppercase tracking-wide">My Leagues</h1>
        <button onClick={() => setView('create')} className="text-white text-2xl leading-none active:scale-95">+</button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-xs font-semibold text-text-secondary uppercase tracking-widest">Loading...</div>
      ) : leagues.length === 0 ? (
        <div className="p-8 text-center flex flex-col items-center justify-center h-48 border-b border-border">
           <div className="text-3xl mb-4 grayscale opacity-50">🏆</div>
           <p className="text-text-secondary text-sm font-medium mb-6">You aren't in any leagues yet.</p>
           <button onClick={() => setView('create')} className="w-full bg-surface-elevated border border-border py-3 text-xs font-bold uppercase tracking-widest">Create One</button>
        </div>
      ) : (
        <div>
          <SectionHeader title="ACTIVE LEAGUES" />
          {leagues.map(l => (
            <div key={l.league_id} onClick={() => navigate(`/league/${l.league_id}`)} className="flex bg-surface border-b border-border active:bg-surface-elevated transition-colors cursor-pointer">
              <div className="flex-1 p-4 flex flex-col justify-center">
                <div className="flex items-center justify-between mb-1">
                  <div className="font-bold uppercase tracking-tight text-[15px]">{l.leagues?.name || 'Unknown'}</div>
                  <div className="text-[10px] font-semibold text-text-secondary uppercase bg-bg px-2 rounded-sm border border-border">{l.leagues?.format}</div>
                </div>
                <div className="flex items-end justify-between mt-2">
                  <div className="text-[11px] font-semibold text-text-secondary tracking-widest uppercase">
                    Rank <span className="text-white text-sm font-bold tracking-normal ml-1">#{l.rank}</span>
                  </div>
                  <div className="tabular-nums font-bold text-sm text-positive">{l.total_points} pts</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
