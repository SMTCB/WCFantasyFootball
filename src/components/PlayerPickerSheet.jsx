import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { normalisePlayers } from '../lib/players';

const POS_CONFIG = {
  GK:  { label: 'GK',  color: 'var(--gold)', bg: 'rgba(240,180,0,0.14)'  },
  DEF: { label: 'DEF', color: 'var(--cyan)', bg: 'rgba(0,196,232,0.14)'  },
  MID: { label: 'MID', color: 'var(--pos-gk)', bg: 'rgba(157,95,245,0.14)' },
  FWD: { label: 'FWD', color: 'var(--danger)', bg: 'rgba(240,58,58,0.14)'  },
};

const POS_LABEL = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' };

/**
 * Bottom sheet for picking a player to buy.
 * Pre-filtered to `position` and `tournament_id`, shows taken/available state.
 */
export default function PlayerPickerSheet({ position, budget, takenMap, isOwnedBy, onSelect, onClose, tournamentId }) {
  const [players,  setPlayers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [buying,   setBuying]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      let query = supabase
        .from('players')
        .select('*')
        .eq('is_active', true)
        .eq('position', position);

      // Filter by tournament if provided
      if (tournamentId) {
        query = query.eq('tournament_id', tournamentId);
      }

      const { data } = await query.order('price', { ascending: false });
      if (!cancelled) {
        setPlayers(normalisePlayers(data ?? []));
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [position, tournamentId]);

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
          background:   'var(--ink-2)',
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
              style={{ color: posCfg.color, fontFamily: 'Archivo Black, sans-serif' }}
            >
              Sign a {POS_LABEL[position] ?? position}
            </span>
            <div className="text-[12px] mt-0.5" style={{ color: 'var(--mute)' }}>
              Budget: <span style={{ color: 'var(--paper)' }}>€{budget?.toFixed(1)}M</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--mute)', fontSize: '16px' }}
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
            className="w-full px-3 py-2.5 rounded-sm text-[13px]"
            style={{
              background:   'rgba(255,255,255,0.05)',
              border:       '1px solid rgba(255,255,255,0.1)',
              color:        'var(--paper)',
              outline:      'none',
            }}
          />
        </div>

        {/* Player list */}
        <div className="overflow-y-auto flex-1 pb-6">
          {loading ? (
            <div className="p-8 text-center text-[13px]" style={{ color: 'var(--mute)' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-[13px]" style={{ color: 'var(--mute)' }}>No players found</div>
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
                    style={{ background: posCfg.bg, border: `1.5px solid ${posCfg.color}50`, color: posCfg.color, fontFamily: 'Archivo Black, sans-serif' }}
                  >
                    {p.club?.substring(0, 3)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--paper)' }}>
                      {p.name}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px]" style={{ color: 'var(--mute)' }}>{p.club}</span>
                      {taken && (
                        <span className="text-[9px] font-black" style={{ color: 'var(--danger)', fontFamily: 'Archivo Black, sans-serif' }}>
                          TAKEN — {takenMap[p.id].map(o => o.managerName).join(', ')}
                        </span>
                      )}
                      {owned && (
                        <span className="text-[9px] font-black" style={{ color: 'var(--cyan)', fontFamily: 'Archivo Black, sans-serif' }}>
                          IN YOUR SQUAD
                        </span>
                      )}
                      {!taken && !owned && !canAfford && (
                        <span className="text-[9px] font-black" style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}>
                          OVER BUDGET
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Price + button */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[13px] font-bold" style={{ color: 'var(--paper)' }}>
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
                          color:         'var(--positive)',
                          fontFamily:    'Archivo Black, sans-serif',
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
