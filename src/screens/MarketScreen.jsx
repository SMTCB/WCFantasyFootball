import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeIntelligence } from '../lib/intelligence';
import SectionHeader from '../components/SectionHeader';

const POS_LIMITS  = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const COUNTRY_LIMIT = 3;

const POS_CONFIG = {
  GK:  { label: 'GK',  color: '#E0A800', bg: 'rgba(224,168,0,0.12)'  },
  DEF: { label: 'DEF', color: '#00B4D8', bg: 'rgba(0,180,216,0.12)'  },
  MID: { label: 'MID', color: '#A855F7', bg: 'rgba(168,85,247,0.12)' },
  FWD: { label: 'FWD', color: '#EF4444', bg: 'rgba(239,68,68,0.12)'  },
};

const FLAG_MAP = {
  FRA: '🇫🇷', BRA: '🇧🇷', ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ESP: '🇪🇸', BEL: '🇧🇪', POR: '🇵🇹',
  MAR: '🇲🇦', URU: '🇺🇾', ITA: '🇮🇹', NOR: '🇳🇴', GER: '🇩🇪', ARG: '🇦🇷',
};

const POS_FILTER_ORDER = ['ALL', 'GK', 'DEF', 'MID', 'FWD'];

export default function MarketScreen() {
  const [players,      setPlayers]      = useState([]);
  const [mySquad,      setMySquad]      = useState(null);
  const [todayJokerId, setTodayJokerId] = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [filterPos,    setFilterPos]    = useState('ALL');
  const [budget,       setBudget]       = useState(100.0);
  const [saving,       setSaving]       = useState(false);

  useEffect(() => { fetchMarketParams(); }, []);

  const fetchMarketParams = async () => {
    try {
      setLoading(true);
      const userId = '00000000-0000-0000-0000-000000000000';
      setCurrentUser({ id: userId });
      const { data: pData } = await supabase.from('players').select('*').order('price', { ascending: false });
      const { data: intelData } = await supabase.from('player_status').select('*');

      let finalPlayers = [];
      if (!pData || pData.length === 0) {
        // -- DEMO FALLBACK: A rich market of world stars
        finalPlayers = [
          { id: 'p101', name: 'Lionel Messi', club: 'ARG', position: 'FWD', price: 12.5 },
          { id: 'p102', name: 'K. De Bruyne', club: 'BEL', position: 'MID', price: 10.5 },
          { id: 'p103', name: 'J. Bellingham', club: 'ENG', position: 'MID', price: 9.5 },
          { id: 'p104', name: 'Mo Salah', club: 'EGY', position: 'FWD', price: 11.0 },
          { id: 'p105', name: 'V. van Dijk', club: 'NED', position: 'DEF', price: 6.5 },
          { id: 'p106', name: 'Thibaut Courtois', club: 'BEL', position: 'GK', price: 6.0 },
          { id: 'p107', name: 'A. Griezmann', club: 'FRA', position: 'MID', price: 8.5 },
          { id: 'p108', name: 'L. Modric', club: 'CRO', position: 'MID', price: 8.0 },
          { id: 'p109', name: 'H. Kane', club: 'ENG', position: 'FWD', price: 11.0 },
          { id: 'p110', name: 'Achraf Hakimi', club: 'MAR', position: 'DEF', price: 6.0 },
        ];
      } else {
        finalPlayers = pData;
      }

      const playersWithIntel = finalPlayers.map(p => ({
        ...p,
        intel: normalizeIntelligence(intelData?.find(i => i.player_id === p.id)),
      }));
      setPlayers(playersWithIntel);

      const { data: sData } = await supabase.from('squads').select('*').eq('user_id', user.id).single();
      const { data: jData } = await supabase.from('daily_jokers').select('player_id').eq('user_id', user.id).eq('match_date', new Date().toISOString().split('T')[0]).maybeSingle();
      setTodayJokerId(jData?.player_id || null);

      if (sData) {
        setMySquad(sData);
        const ownedPrices = (pData || []).filter(p => sData.players.includes(p.id)).reduce((acc, curr) => acc + Number(curr.price || 0), 0);
        setBudget(100.0 - ownedPrices);
      } else {
        setMySquad({ id: null, players: [] });
        setBudget(100.0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const posCounts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const countryCounts = {};
    if (!mySquad || !players.length) return { posCounts, countryCounts };
    mySquad.players.forEach(pid => {
      const p = players.find(pl => pl.id === pid);
      if (!p) return;
      if (posCounts[p.position] !== undefined) posCounts[p.position]++;
      if (pid !== todayJokerId) countryCounts[p.club] = (countryCounts[p.club] || 0) + 1;
    });
    return { posCounts, countryCounts };
  }, [mySquad, players, todayJokerId]);

  const handleBuy = async (player) => {
    if (saving) return;
    if (mySquad.players.length >= 15) { alert('Squad is full! Sell someone first.'); return; }
    if (stats.posCounts[player.position] >= POS_LIMITS[player.position]) { alert(`Max ${player.position}s reached (${POS_LIMITS[player.position]}).`); return; }
    if ((stats.countryCounts[player.club] || 0) >= COUNTRY_LIMIT) { alert(`Max ${COUNTRY_LIMIT} players from ${player.club} reached.`); return; }
    if (budget < player.price) { alert('Not enough budget.'); return; }
    try {
      setSaving(true);
      await upsertSquadPlayers([...mySquad.players, player.id]);
    } finally { setSaving(false); }
  };

  const handleSell = async (player) => {
    if (saving) return;
    try {
      setSaving(true);
      await upsertSquadPlayers(mySquad.players.filter(pid => pid !== player.id));
    } finally { setSaving(false); }
  };

  const upsertSquadPlayers = async (newPlayerArray) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (mySquad.id) {
      await supabase.from('squads').update({ players: newPlayerArray }).eq('id', mySquad.id);
    } else {
      const res = await supabase.from('squads').insert({ user_id: user.id, league_id: null, matchday_id: 'md1', players: newPlayerArray }).select().single();
      if (res.data) setMySquad(res.data);
    }
    setMySquad(prev => ({ ...prev, players: newPlayerArray }));
    fetchMarketParams();
  };

  const filteredPlayers = players.filter(p => filterPos === 'ALL' || p.position === filterPos);
  const squadCount = mySquad?.players?.length || 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-bg">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-surface border-b border-border">
        <div className="px-5 py-3 flex items-center justify-between">
          <div>
            <div className="fz-label text-text-tertiary">Transfer Window</div>
            <div className="fz-display text-[22px] text-white leading-tight">PLAYER MARKET</div>
          </div>
          <div className="flex items-center gap-5">
            {/* Squad slots */}
            <div className="text-right">
              <div className="fz-label text-text-tertiary">Squad</div>
              <div className="fz-num text-[20px] text-white leading-tight">
                {squadCount}<span className="text-text-tertiary text-[13px]">/15</span>
              </div>
            </div>
            {/* Budget */}
            <div className="text-right">
              <div className="fz-label text-text-tertiary">Budget</div>
              <div className="fz-num text-[20px] text-cyan leading-tight">
                ${budget.toFixed(1)}M
              </div>
            </div>
          </div>
        </div>

        {/* Position quota bar */}
        <div className="flex gap-px bg-bg px-4 pb-2">
          {(['GK', 'DEF', 'MID', 'FWD'] ).map(pos => {
            const cfg   = POS_CONFIG[pos];
            const count = stats.posCounts[pos];
            const max   = POS_LIMITS[pos];
            const full  = count >= max;
            return (
              <div
                key={pos}
                className="flex-1 py-2 text-center rounded-sm text-[9px] font-black uppercase tracking-wider transition-all"
                style={{
                  background: full ? cfg.bg : 'rgba(255,255,255,0.04)',
                  color: full ? cfg.color : '#4A5568',
                  fontFamily: 'Barlow Condensed, sans-serif',
                }}
                title={`${pos}: ${count}/${max} slots used`}
              >
                {pos} {count}/{max}
              </div>
            );
          })}
        </div>

        {/* Wildcard + transfer info */}
        <div className={`px-5 py-2 flex items-center justify-between border-t border-border text-[10px] font-bold uppercase tracking-widest ${mySquad?.is_wildcard ? 'bg-positive/10 text-positive' : 'text-text-tertiary'}`}>
          <div className="flex items-center gap-2">
            <span>🔄</span>
            <span>Free Transfers:</span>
            <span className="text-white ml-1">{mySquad?.is_wildcard ? '∞ (Wildcard)' : '1'}</span>
          </div>
          {mySquad?.is_wildcard && (
            <span className="bg-positive text-black px-2 py-0.5 rounded-sm text-[9px]">Wildcard Active</span>
          )}
        </div>

        {/* Country rule reminder */}
        <div className="px-5 py-1.5 text-[9px] text-text-tertiary border-t border-border">
          Rules: Max 3 players per country (Joker exempt) · Max 15 players total
        </div>

        {/* Position filter tabs */}
        <div className="flex border-t border-border overflow-x-auto">
          {POS_FILTER_ORDER.map(pos => {
            const isActive = filterPos === pos;
            const cfg = pos !== 'ALL' ? POS_CONFIG[pos] : null;
            return (
              <button
                key={pos}
                onClick={() => setFilterPos(pos)}
                className="flex-1 min-w-[60px] py-2.5 text-[11px] font-black uppercase tracking-widest transition-all"
                style={{
                  fontFamily: 'Barlow Condensed, sans-serif',
                  color: isActive ? (cfg?.color ?? '#fff') : '#4A5568',
                  background: isActive ? (cfg?.bg ?? 'rgba(255,255,255,0.06)') : 'transparent',
                  borderBottom: isActive ? `2px solid ${cfg?.color ?? '#fff'}` : '2px solid transparent',
                }}
              >
                {pos}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Player List ─────────────────────────────────────── */}
      {loading ? (
        <div className="p-10 text-center fz-label text-text-tertiary animate-scan">Loading market…</div>
      ) : (
        <div className="divide-y divide-border">
          {filteredPlayers.map(p => {
            const isOwned    = mySquad?.players?.includes(p.id);
            const limitReached = stats.posCounts[p.position] >= POS_LIMITS[p.position];
            const canAfford  = budget >= p.price;
            const canBuy     = !isOwned && !limitReached && canAfford && mySquad?.players?.length < 15;
            const posCfg     = POS_CONFIG[p.position] || POS_CONFIG.MID;
            const flag       = FLAG_MAP[p.club] ?? '🌍';
            const isJoker    = p.id === todayJokerId;

            return (
              <div
                key={p.id}
                className={`flex items-center px-5 py-3.5 gap-4 transition-colors ${isOwned ? 'bg-surface-2' : 'hover:bg-surface'}`}
              >
                {/* Avatar with position colour ring */}
                <div
                  className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center font-bold text-[11px] uppercase relative"
                  style={{ background: posCfg.bg, border: `1.5px solid ${posCfg.color}40` }}
                >
                  <span style={{ color: posCfg.color, fontFamily: 'Barlow Condensed, sans-serif' }}>
                    {p.club?.substring(0, 3)}
                  </span>
                  <span className="absolute -bottom-0.5 -right-0.5 text-[11px] leading-none">{flag}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-white truncate">{p.name}</span>
                    {isOwned && (
                      <span
                        className="shrink-0 text-[8px] font-black px-1 py-0.5 rounded-sm bg-cyan/15 text-cyan uppercase"
                        style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
                      >
                        OWNED
                      </span>
                    )}
                    {isJoker && (
                      <span
                        className="shrink-0 text-[8px] font-black px-1 py-0.5 rounded-sm bg-purple/15 text-purple uppercase"
                        style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
                      >
                        JOKER
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="text-[9px] font-black px-1.5 py-0.5 rounded-sm"
                      style={{ color: posCfg.color, background: posCfg.bg, fontFamily: 'Barlow Condensed, sans-serif' }}
                    >
                      {p.position}
                    </span>
                    <span className="text-[10px] text-text-tertiary font-medium">{p.club}</span>
                  </div>
                </div>

                {/* Price + action */}
                <div className="shrink-0 flex items-center gap-3">
                  <div
                    className="text-[16px] font-black tabular-nums text-white text-right"
                    style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
                  >
                    ${p.price}
                    <span className="text-[9px] text-text-tertiary font-normal">M</span>
                  </div>
                  {isOwned ? (
                    <button
                      onClick={() => handleSell(p)}
                      disabled={saving}
                      className="w-[60px] py-2 bg-negative/15 text-negative font-black text-[10px] uppercase tracking-wider rounded-sm active:scale-95 disabled:opacity-50 transition-transform"
                      style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
                    >
                      Sell
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBuy(p)}
                      disabled={saving || !canBuy}
                      title={!canAfford ? 'Insufficient budget' : limitReached ? `${p.position} slots full` : 'Add to squad'}
                      className={`w-[60px] py-2 font-black text-[10px] uppercase tracking-wider rounded-sm transition-all active:scale-95 ${
                        canBuy
                          ? 'bg-positive text-black hover:brightness-110'
                          : 'bg-surface border border-border text-text-tertiary cursor-not-allowed'
                      }`}
                      style={{ fontFamily: 'Barlow Condensed, sans-serif' }}
                    >
                      Buy
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
