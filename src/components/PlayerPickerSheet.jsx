import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { normalisePlayers } from '../lib/players';

const POS_CONFIG = {
  GK:  { label: 'GK',  color: '#F0B400', bg: 'rgba(240,180,0,0.14)'  },
  DEF: { label: 'DEF', color: '#00C4E8', bg: 'rgba(0,196,232,0.14)'  },
  MID: { label: 'MID', color: '#9D5FF5', bg: 'rgba(157,95,245,0.14)' },
  FWD: { label: 'FWD', color: '#F03A3A', bg: 'rgba(240,58,58,0.14)'  },
};

const POS_LABEL = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' };

/**
 * Bottom sheet for picking a player to buy.
 * Pre-filtered to `position`, shows taken/available state.
 */
export default function PlayerPickerSheet({ position, budget, takenMap, isOwnedBy, onSelect, onClose }) {
  const [players,  setPlayers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [buying,   setBuying]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('position', position)
        .order('price', { ascending: false });
      if (!cancelled) {
        setPlayers(normalisePlayers(data ?? []));
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [position]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return players;
    return players.filter(p =>
      p.name.toLowerCase().includes(q) || p.club.toLowerCase().includes(q)
    );
  }, [players, search]);

  const handleBuy = async (player) => {
    setBuying(player.id);
    await onSelect(player);
    setBuying(null);
  };

  const posCfg = POS_CONFIG[position] ?? POS_CONFIG.MID;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.6)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          background:   '#0D1117',
          borderTop:    '1px solid rgba(255,255,255,0.08)',
          borderRadius: '16px 16px 0 0',
          maxHeight:    '85vh',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.15)' }} />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 shrink-0 flex items-center justify-between">
          <div>
            <span
              className="text-[11px] font-black uppercase tracking-widest"
              style={{ color: posCfg.color, fontFamily: 'Barlow Condensed, sans-serif' }}
            >
              Sign a {POS_LABEL[position] ?? position}
            </span>
            <div className="text-[12px] mt-0.5" style={{ color: '#7D8A96' }}>
              Budget: <span style={{ color: '#F0F2F5' }}>${budget?.toFixed(1)}M</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)', color: '#7D8A96', fontSize: '16px' }}
          >
            ✕
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3 shrink-0">
          <input
            type="text"
            placeholder="Search name or club…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg text-[13px]"
            style={{
              background:   'rgba(255,255,255,0.05)',
              border:       '1px solid rgba(255,255,255,0.1)',
              color:        '#F0F2F5',
              outline:      'none',
            }}
          />
        </div>

        {/* Player list */}
        <div className="overflow-y-auto flex-1 pb-6">
          {loading ? (
            <div className="p-8 text-center text-[13px]" style={{ color: '#7D8A96' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-[13px]" style={{ color: '#7D8A96' }}>No players found</div>
          ) : (
            filtered.map(p => {
              const owned      = isOwnedBy(p.id);
              const taken      = !owned && takenMap[p.id];
              const canAfford  = budget >= p.price;
              const available  = !owned && !taken && canAfford;
              const isBuying   = buying === p.id;

              return (
                <div
                  key={p.id}
                  className="flex items-center px-5 py-3 gap-3"
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    opacity: (taken || (owned)) ? 0.55 : 1,
                  }}
                >
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center font-black text-[10px] uppercase"
                    style={{ background: posCfg.bg, border: `1.5px solid ${posCfg.color}50`, color: posCfg.color, fontFamily: 'Barlow Condensed, sans-serif' }}
                  >
                    {p.club?.substring(0, 3)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate" style={{ color: '#F0F2F5' }}>
                      {p.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px]" style={{ color: '#3D4B5C' }}>{p.club}</span>
                      {taken && (
                        <span className="text-[9px] font-black" style={{ color: '#F03A3A', fontFamily: 'Barlow Condensed, sans-serif' }}>
                          TAKEN — {takenMap[p.id].managerName}
                        </span>
                      )}
                      {owned && (
                        <span className="text-[9px] font-black" style={{ color: '#00C4E8', fontFamily: 'Barlow Condensed, sans-serif' }}>
                          IN YOUR SQUAD
                        </span>
                      )}
                      {!taken && !owned && !canAfford && (
                        <span className="text-[9px] font-black" style={{ color: '#7D8A96', fontFamily: 'Barlow Condensed, sans-serif' }}>
                          OVER BUDGET
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price + button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[13px] font-bold" style={{ color: '#F0F2F5' }}>
                      ${p.price}M
                    </span>
                    {available && (
                      <button
                        disabled={isBuying}
                        onClick={() => handleBuy(p)}
                        className="px-3 py-1.5 rounded text-[11px] font-black uppercase tracking-wide"
                        style={{
                          background:    'rgba(24,201,107,0.15)',
                          border:        '1px solid rgba(24,201,107,0.35)',
                          color:         '#18C96B',
                          fontFamily:    'Barlow Condensed, sans-serif',
                          opacity:       isBuying ? 0.5 : 1,
                          letterSpacing: '0.08em',
                        }}
                      >
                        {isBuying ? '…' : 'Buy'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
