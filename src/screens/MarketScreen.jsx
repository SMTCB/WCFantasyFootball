import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { normalizeIntelligence } from '../lib/intelligence';
import { normalisePlayer, normalisePlayers } from '../lib/players';

const POS_LIMITS  = { GK: 2, DEF: 5, MID: 5, FWD: 3 };
const COUNTRY_LIMIT = 3;

const POS_CONFIG = {
  GK:  { label: 'GK',  color: '#F0B400', bg: 'rgba(240,180,0,0.14)'  },
  DEF: { label: 'DEF', color: '#00C4E8', bg: 'rgba(0,196,232,0.14)'  },
  MID: { label: 'MID', color: '#9D5FF5', bg: 'rgba(157,95,245,0.14)' },
  FWD: { label: 'FWD', color: '#F03A3A', bg: 'rgba(240,58,58,0.14)'  },
};

const FLAG_MAP = {
  FRA: '🇫🇷', BRA: '🇧🇷', ENG: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ESP: '🇪🇸', BEL: '🇧🇪', POR: '🇵🇹',
  MAR: '🇲🇦', URU: '🇺🇾', ITA: '🇮🇹', NOR: '🇳🇴', GER: '🇩🇪', ARG: '🇦🇷',
  EGY: '🇪🇬', NED: '🇳🇱', CRO: '🇭🇷',
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
  const [isLocked,     setIsLocked]     = useState(false);
  const [deadlineAt,   setDeadlineAt]   = useState(null);

  useEffect(() => { fetchMarketParams(); }, []);

  const fetchMarketParams = async () => {
    try {
      setLoading(true);
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData?.user?.id || '00000000-0000-0000-0000-000000000000';

      // ── Transfer window lock — always use server time, never client clock ──
      const [{ data: nowRow }, { data: deadlineRow }] = await Promise.all([
        supabase.rpc('get_server_time').single().catch(() => ({ data: null })),
        supabase.from('matchday_deadlines').select('deadline_at').eq('matchday_id', 'md1').maybeSingle(),
      ]);
      // Fallback: if RPC not available, use JS Date (acceptable for UI-only lock)
      const serverNow  = nowRow ? new Date(nowRow) : new Date();
      const deadline   = deadlineRow?.deadline_at ? new Date(deadlineRow.deadline_at) : null;
      const locked     = deadline ? serverNow >= deadline : false;
      setIsLocked(locked);
      setDeadlineAt(deadline);

      const { data: pData }    = await supabase.from('players').select('*').order('price', { ascending: false });
      const { data: intelData } = await supabase.from('player_status').select('*');

      const rawPlayers = (pData && pData.length > 0) ? pData : [
        { id: 'p101', name: 'Lionel Messi',  club: 'ARG', position: 'FWD', price: 12.5 },
        { id: 'p102', name: 'K. De Bruyne',  club: 'BEL', position: 'MID', price: 10.5 },
        { id: 'p103', name: 'J. Bellingham', club: 'ENG', position: 'MID', price: 9.5  },
        { id: 'p104', name: 'Mo Salah',      club: 'EGY', position: 'FWD', price: 11.0 },
        { id: 'p105', name: 'V. van Dijk',   club: 'NED', position: 'DEF', price: 6.5  },
        { id: 'p106', name: 'T. Courtois',   club: 'BEL', position: 'GK',  price: 6.0  },
        { id: 'p107', name: 'A. Griezmann',  club: 'FRA', position: 'MID', price: 8.5  },
        { id: 'p108', name: 'L. Modric',     club: 'CRO', position: 'MID', price: 8.0  },
        { id: 'p109', name: 'H. Kane',       club: 'ENG', position: 'FWD', price: 11.0 },
        { id: 'p110', name: 'A. Hakimi',     club: 'MAR', position: 'DEF', price: 6.0  },
        { id: 'p111', name: 'Neymar Jr',     club: 'BRA', position: 'FWD', price: 10.0 },
        { id: 'p112', name: 'Rodri',         club: 'ESP', position: 'MID', price: 9.0  },
        { id: 'p113', name: 'Vinícius Jr',   club: 'BRA', position: 'FWD', price: 11.5 },
        { id: 'p114', name: 'Pedri',         club: 'ESP', position: 'MID', price: 7.5  },
        { id: 'p115', name: 'Mbappé',        club: 'FRA', position: 'FWD', price: 13.0 },
      ];

      const playersWithIntel = normalisePlayers(rawPlayers).map(p => ({
        ...p,
        intel: normalizeIntelligence(intelData?.find(i => i.player_id === p.id)) ?? p.intel,
      }));
      setPlayers(playersWithIntel);

      const { data: sData } = await supabase.from('squads').select('*').eq('user_id', userId).maybeSingle();
      const { data: jData } = await supabase.from('daily_jokers').select('player_id')
        .eq('user_id', userId)
        .eq('match_date', new Date().toISOString().split('T')[0])
        .maybeSingle();
      setTodayJokerId(jData?.player_id || null);

      if (sData) {
        setMySquad(sData);
        setBudget(Number(sData.budget_remaining ?? 100));
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
    if (isLocked)                                                          { alert('Transfers are locked until after the match.'); return; }
    if (mySquad.players.length >= 15)                                     { alert('Squad is full! Sell someone first.'); return; }
    if (stats.posCounts[player.position] >= POS_LIMITS[player.position])  { alert(`Max ${player.position}s reached.`); return; }
    if ((stats.countryCounts[player.club] || 0) >= COUNTRY_LIMIT)         { alert(`Max 3 players from ${player.club}.`); return; }
    if (budget < player.price)                                             { alert('Not enough budget.'); return; }
    const newBudget = Math.max(0, +(budget - player.price).toFixed(1));
    try { setSaving(true); await upsertSquadPlayers([...mySquad.players, player.id], newBudget); }
    finally { setSaving(false); }
  };

  const handleSell = async (player) => {
    if (saving) return;
    if (isLocked) { alert('Transfers are locked until after the match.'); return; }
    const newBudget = +(budget + player.price).toFixed(1);
    try { setSaving(true); await upsertSquadPlayers(mySquad.players.filter(pid => pid !== player.id), newBudget); }
    finally { setSaving(false); }
  };

  const upsertSquadPlayers = async (newPlayerArray, newBudget) => {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id || '00000000-0000-0000-0000-000000000000';
    if (mySquad.id) {
      await supabase.from('squads')
        .update({ players: newPlayerArray, budget_remaining: newBudget })
        .eq('id', mySquad.id);
    } else {
      const res = await supabase.from('squads')
        .insert({ user_id: userId, league_id: null, matchday_id: 'md1', players: newPlayerArray, budget_remaining: newBudget })
        .select().single();
      if (res.data) setMySquad(res.data);
    }
    setMySquad(prev => ({ ...prev, players: newPlayerArray, budget_remaining: newBudget }));
    setBudget(newBudget);
  };

  const filteredPlayers = players.filter(p => filterPos === 'ALL' || p.position === filterPos);
  const squadCount = mySquad?.players?.length || 0;

  // Format deadline for display
  const deadlineLabel = deadlineAt
    ? deadlineAt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="min-h-screen bg-bg">

      {/* ── Transfer Window Lock Banner ─────────────────────── */}
      {isLocked && (
        <div
          className="flex items-center gap-3 px-5 py-3"
          style={{ background: 'rgba(240,58,58,0.10)', borderBottom: '1px solid rgba(240,58,58,0.25)' }}
        >
          <span className="text-base">🔒</span>
          <div>
            <div
              className="text-[11px] font-black uppercase tracking-widest"
              style={{ color: '#F03A3A', fontFamily: 'Barlow Condensed, sans-serif' }}
            >
              Transfer Window Closed
            </div>
            <div className="text-[10px]" style={{ color: '#7D8A96' }}>
              Transfers are locked until the matchday results are published.
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky Header ───────────────────────────────────── */}
      <div
        className="sticky top-0 z-40"
        style={{
          background: 'rgba(13,17,23,0.97)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Title + stats row */}
        <div className="px-5 pt-3.5 pb-2.5 flex items-center justify-between">
          <div>
            <div
              className="fz-label"
              style={{ color: isLocked ? '#F03A3A' : '#3D4B5C' }}
            >
              {isLocked ? '🔒 Window Closed' : 'Transfer Window'}
            </div>
            <div
              className="text-[24px] font-black uppercase leading-tight tracking-tight"
              style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#F0F2F5' }}
            >
              Player Market
            </div>
          </div>

          <div className="flex items-center gap-5">
            {/* Squad count */}
            <div className="text-right">
              <div className="fz-label" style={{ color: '#3D4B5C' }}>Squad</div>
              <div
                className="text-[20px] font-black tabular-nums leading-tight"
                style={{ fontFamily: 'Barlow Condensed, sans-serif', color: squadCount >= 15 ? '#18C96B' : '#F0F2F5' }}
              >
                {squadCount}
                <span className="text-[12px] font-normal" style={{ color: '#3D4B5C' }}>/15</span>
              </div>
            </div>

            {/* Budget */}
            <div className="text-right">
              <div className="fz-label" style={{ color: '#3D4B5C' }}>Budget</div>
              <div
                className="text-[20px] font-black tabular-nums leading-tight"
                style={{
                  fontFamily: 'Barlow Condensed, sans-serif',
                  color: budget < 5 ? '#F03A3A' : '#00C4E8',
                }}
              >
                ${budget.toFixed(1)}
                <span className="text-[12px] font-normal" style={{ color: '#3D4B5C' }}>M</span>
              </div>
            </div>
          </div>
        </div>

        {/* Position quota row */}
        <div className="flex gap-1.5 px-5 pb-2.5">
          {(['GK', 'DEF', 'MID', 'FWD']).map(pos => {
            const cfg   = POS_CONFIG[pos];
            const count = stats.posCounts[pos];
            const max   = POS_LIMITS[pos];
            const full  = count >= max;
            const pct   = (count / max) * 100;
            return (
              <div
                key={pos}
                className="flex-1 rounded-sm overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.04)' }}
                title={`${pos}: ${count}/${max}`}
              >
                {/* Fill bar */}
                <div
                  className="h-[3px] transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    background: full ? cfg.color : `${cfg.color}60`,
                  }}
                />
                <div
                  className="px-1.5 py-1 flex items-center justify-between"
                >
                  <span
                    className="text-[8px] font-black uppercase"
                    style={{ color: full ? cfg.color : '#3D4B5C', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.08em' }}
                  >
                    {pos}
                  </span>
                  <span
                    className="text-[8px] font-bold tabular-nums"
                    style={{ color: full ? cfg.color : '#3D4B5C', fontFamily: 'Barlow Condensed, sans-serif' }}
                  >
                    {count}/{max}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Wildcard indicator */}
          {mySquad?.is_wildcard && (
            <div
              className="px-2 py-1 rounded-sm flex items-center gap-1 shrink-0"
              style={{ background: 'rgba(24,201,107,0.12)', border: '1px solid rgba(24,201,107,0.25)' }}
            >
              <span className="text-[8px]">∞</span>
              <span
                className="text-[8px] font-black uppercase"
                style={{ color: '#18C96B', fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.08em' }}
              >
                WC
              </span>
            </div>
          )}
        </div>

        {/* Position filter tabs */}
        <div
          className="flex"
          style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
        >
          {POS_FILTER_ORDER.map(pos => {
            const isActive = filterPos === pos;
            const cfg = pos !== 'ALL' ? POS_CONFIG[pos] : null;
            const activeColor = cfg?.color ?? '#F0F2F5';
            return (
              <button
                key={pos}
                onClick={() => setFilterPos(pos)}
                className="flex-1 min-w-0 py-2.5 transition-all duration-150 relative"
                style={{
                  fontFamily: 'Barlow Condensed, sans-serif',
                  fontSize: '11px',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: isActive ? activeColor : '#3D4B5C',
                  background: isActive ? `${activeColor}0F` : 'transparent',
                }}
              >
                {pos}
                {isActive && (
                  <div
                    className="absolute bottom-0 left-0 right-0 h-[2px]"
                    style={{ background: activeColor }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Player List ──────────────────────────────────────── */}
      {loading ? (
        <div className="divide-y divide-border">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3 px-5 py-4">
              <div className="w-11 h-11 rounded-full animate-shimmer shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-32 rounded animate-shimmer" />
                <div className="h-2.5 w-20 rounded animate-shimmer" />
              </div>
              <div className="w-16 h-8 rounded animate-shimmer" />
            </div>
          ))}
        </div>
      ) : (
        <div>
          {filteredPlayers.map((p, idx) => {
            const isOwned      = mySquad?.players?.includes(p.id);
            const limitReached = stats.posCounts[p.position] >= POS_LIMITS[p.position];
            const canAfford    = budget >= p.price;
            const canBuy       = !isOwned && !limitReached && canAfford && (mySquad?.players?.length ?? 0) < 15;
            const posCfg       = POS_CONFIG[p.position] || POS_CONFIG.MID;
            const flag         = FLAG_MAP[p.club] ?? '🌍';
            const isJoker      = p.id === todayJokerId;
            const intel        = p.intel;

            return (
              <div
                key={p.id}
                className="flex items-center px-5 py-3 gap-4 transition-all duration-150"
                style={{
                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                  background: isOwned ? 'rgba(0,196,232,0.04)' : 'transparent',
                  borderLeft: isOwned ? '2px solid rgba(0,196,232,0.4)' : '2px solid transparent',
                }}
              >
                {/* Avatar */}
                <div className="relative shrink-0">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center font-black text-[11px] uppercase"
                    style={{
                      background: posCfg.bg,
                      border: `1.5px solid ${posCfg.color}50`,
                      color: posCfg.color,
                      fontFamily: 'Barlow Condensed, sans-serif',
                    }}
                  >
                    {p.club?.substring(0, 3)}
                  </div>
                  <div
                    className="absolute -bottom-0.5 -right-0.5 w-[18px] h-[18px] rounded-full flex items-center justify-center shadow-sm text-[10px]"
                    style={{ background: '#1C2333', border: '1.5px solid #080A0E' }}
                  >
                    {flag}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="text-[13.5px] font-semibold truncate"
                      style={{ color: '#F0F2F5', fontFamily: 'DM Sans, sans-serif' }}
                    >
                      {p.name}
                    </span>
                    {isOwned && (
                      <span
                        className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm"
                        style={{ background: 'rgba(0,196,232,0.15)', color: '#00C4E8', fontFamily: 'Barlow Condensed, sans-serif' }}
                      >
                        OWNED
                      </span>
                    )}
                    {isJoker && (
                      <span
                        className="shrink-0 text-[8px] font-black px-1.5 py-0.5 rounded-sm"
                        style={{ background: 'rgba(157,95,245,0.15)', color: '#9D5FF5', fontFamily: 'Barlow Condensed, sans-serif' }}
                      >
                        JOKER
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-0.5">
                    <span
                      className="text-[9px] font-black px-1.5 py-[2px] rounded-sm"
                      style={{ color: posCfg.color, background: posCfg.bg, fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.06em' }}
                    >
                      {p.position}
                    </span>
                    <span className="text-[10px] font-medium" style={{ color: '#3D4B5C' }}>{p.club}</span>
                    {intel?.status && intel.status !== 'fit' && (
                      <span
                        className="text-[8px] font-black px-1 py-0.5 rounded-sm uppercase"
                        style={{ color: '#F03A3A', background: 'rgba(240,58,58,0.12)', fontFamily: 'Barlow Condensed, sans-serif' }}
                      >
                        {intel.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Price + action */}
                <div className="shrink-0 flex items-center gap-3">
                  <div className="text-right">
                    <div
                      className="text-[16px] font-black tabular-nums leading-tight"
                      style={{ fontFamily: 'Barlow Condensed, sans-serif', color: canAfford || isOwned ? '#F0F2F5' : '#F03A3A' }}
                    >
                      ${p.price}
                      <span className="text-[10px] font-normal" style={{ color: '#3D4B5C' }}>M</span>
                    </div>
                  </div>

                  {isLocked ? (
                    <div
                      className="min-w-[60px] py-2 px-3 rounded-sm text-center"
                      style={{
                        background: 'rgba(240,58,58,0.07)',
                        border: '1px solid rgba(240,58,58,0.18)',
                        color: '#F03A3A',
                        fontFamily: 'Barlow Condensed, sans-serif',
                        fontSize: '9px',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        opacity: 0.7,
                      }}
                    >
                      🔒
                    </div>
                  ) : isOwned ? (
                    <button
                      onClick={() => handleSell(p)}
                      disabled={saving}
                      className="min-w-[60px] py-2 px-3 rounded-sm transition-all active:scale-95 disabled:opacity-40"
                      style={{
                        background: 'rgba(240,58,58,0.12)',
                        color: '#F03A3A',
                        border: '1px solid rgba(240,58,58,0.25)',
                        fontFamily: 'Barlow Condensed, sans-serif',
                        fontSize: '10px',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      Sell
                    </button>
                  ) : (
                    <button
                      onClick={() => handleBuy(p)}
                      disabled={saving || !canBuy}
                      title={
                        !canAfford     ? 'Insufficient budget'
                        : limitReached ? `${p.position} slots full`
                        : 'Add to squad'
                      }
                      className="min-w-[60px] py-2 px-3 rounded-sm transition-all active:scale-95"
                      style={{
                        background: canBuy ? '#18C96B' : 'rgba(255,255,255,0.04)',
                        color: canBuy ? '#000' : '#3D4B5C',
                        border: canBuy ? 'none' : '1px solid rgba(255,255,255,0.07)',
                        fontFamily: 'Barlow Condensed, sans-serif',
                        fontSize: '10px',
                        fontWeight: 800,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        cursor: canBuy ? 'pointer' : 'not-allowed',
                        opacity: saving ? 0.5 : 1,
                      }}
                    >
                      Buy
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {filteredPlayers.length === 0 && !loading && (
            <div className="p-12 text-center">
              <div className="text-3xl mb-3 opacity-20">🔍</div>
              <p className="text-sm font-medium" style={{ color: '#7D8A96' }}>
                No players found for this position.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Bottom rule reminder */}
      <div
        className="px-5 py-3 text-center"
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span
          className="text-[9px] font-semibold uppercase tracking-wider"
          style={{ color: '#3D4B5C', fontFamily: 'DM Sans, sans-serif' }}
        >
          Max 3 per country (Joker exempt) · Max 15 players · $100M budget
        </span>
      </div>
    </div>
  );
}
