import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';

export default function F1StandingsScreen() {
  const { paddockId } = useParams();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('total'); // total | race | year

  useEffect(() => {
    supabase.rpc('get_paddock_leaderboard', { p_paddock_id: paddockId })
      .then(({ data }) => { setRows(data ?? []); setLoading(false); });
  }, [paddockId]);

  const sorted = [...rows].sort((a, b) => {
    if (view === 'race') return b.race_points - a.race_points;
    if (view === 'year') return b.year_points - a.year_points;
    return b.total_points - a.total_points;
  });

  const MEDAL = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ background: 'var(--ink)', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '16px 16px 12px' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
          PADDOCK STANDINGS · 2026
        </div>
        <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 22, color: '#fff', margin: 0 }}>STANDINGS</h1>
      </div>

      {/* View toggle */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--rule)' }}>
        {[['total', 'TOTAL'], ['race', 'RACE PTS'], ['year', 'SEASON PTS']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setView(key)}
            style={{ flex: 1, padding: '11px 0', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', border: 'none', borderBottom: view === key ? '2px solid var(--accent)' : '2px solid transparent', background: 'transparent', color: view === key ? 'var(--accent)' : 'var(--mute)', marginBottom: -1 }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>LOADING…</div>
      ) : sorted.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🏁</div>
          <p style={{ fontFamily: 'Archivo, sans-serif', color: 'var(--mute)', fontSize: 14 }}>No standings yet — picks will score after the first race.</p>
        </div>
      ) : (
        <div style={{ padding: '12px 16px' }}>
          {/* Column headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 52px 52px 52px', gap: 8, padding: '0 12px 8px', alignItems: 'center' }}>
            {['', 'DRIVER', 'RACE', 'SEASON', 'TOTAL'].map(h => (
              <div key={h} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.12em', color: 'var(--mute)', textAlign: h && h !== 'DRIVER' ? 'right' : 'left' }}>{h}</div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {sorted.map((m, i) => {
              const isMe = m.user_id === user?.id;
              return (
                <div
                  key={m.user_id}
                  style={{ display: 'grid', gridTemplateColumns: '28px 1fr 52px 52px 52px', gap: 8, padding: '12px', background: isMe ? 'rgba(26,111,168,0.08)' : 'var(--card)', border: `1px solid ${isMe ? 'var(--accent)' : 'var(--rule)'}`, borderRadius: 8, alignItems: 'center' }}
                >
                  <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: i < 3 ? 18 : 14, color: 'var(--mute)' }}>
                    {i < 3 ? MEDAL[i] : i + 1}
                  </span>
                  <div>
                    <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--paper)' }}>
                      {m.display_name}
                      {isMe && <span style={{ marginLeft: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--accent)', letterSpacing: '0.1em' }}>YOU</span>}
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', marginTop: 1 }}>
                      {m.races_scored} race{m.races_scored !== 1 ? 's' : ''} scored
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontFamily: 'Archivo Black, sans-serif', fontSize: 15, color: view === 'race' ? 'var(--accent)' : 'var(--mute)' }}>{m.race_points}</div>
                  <div style={{ textAlign: 'right', fontFamily: 'Archivo Black, sans-serif', fontSize: 15, color: view === 'year' ? 'var(--accent)' : 'var(--mute)' }}>{m.year_points}</div>
                  <div style={{ textAlign: 'right', fontFamily: 'Archivo Black, sans-serif', fontSize: 18, color: view === 'total' ? 'var(--paper)' : 'var(--mute)' }}>{m.total_points}</div>
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--elev)', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '0.1em' }}>
            SCORING: 10 pts exact P1 · 8 exact P2 · 6 exact P3 · 3 wrong podium spot · 5 each for DNF / team / special · 3 all-correct bonus
          </div>
        </div>
      )}
    </div>
  );
}
