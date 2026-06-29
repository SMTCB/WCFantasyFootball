import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { usePaddock } from '../../hooks/f1/usePaddock';
import { useSport } from '../../context/SportContext';
import { getFlag } from '../../lib/f1/f1-data';

function useCountdown(targetDate) {
  const [diff, setDiff] = useState(null);
  useEffect(() => {
    if (!targetDate) return;
    const tick = () => {
      const ms = new Date(targetDate) - Date.now();
      if (ms <= 0) { setDiff(null); return; }
      const d = Math.floor(ms / 86400000);
      const h = Math.floor((ms % 86400000) / 3600000);
      const m = Math.floor((ms % 3600000) / 60000);
      setDiff({ d, h, m });
    };
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [targetDate]);
  return diff;
}

function RaceStatusBadge({ race }) {
  const isUpcoming = race.status === 'scheduled';
  const isPast = race.status === 'finished';
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 9,
      fontWeight: 700,
      letterSpacing: '0.12em',
      padding: '2px 7px',
      borderRadius: 3,
      background: isPast ? 'var(--elev)' : isUpcoming ? 'rgba(26,111,168,0.12)' : 'rgba(185,28,28,0.12)',
      color: isPast ? 'var(--mute)' : isUpcoming ? 'var(--accent)' : 'var(--danger)',
    }}>
      {isPast ? 'FT' : race.status === 'race' ? '🔴 LIVE' : race.status === 'qualifying' ? 'QUALI' : 'UPCOMING'}
    </span>
  );
}

export default function F1HomeScreen() {
  const { paddockId } = useParams();
  const navigate = useNavigate();
  const { setActivePaddockId } = useSport();
  const { myPaddocks, activePaddock, setActivePaddockId: switchPaddock } = usePaddock();

  const [races, setRaces] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [section, setSection] = useState('calendar'); // 'calendar' | 'paddocks'

  useEffect(() => {
    if (paddockId) setActivePaddockId(paddockId);
  }, [paddockId, setActivePaddockId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: raceData }, { data: lbData }] = await Promise.all([
        supabase.from('f1_races').select('*').eq('season', 2026).order('round_number'),
        paddockId ? supabase.rpc('get_paddock_leaderboard', { p_paddock_id: paddockId }) : Promise.resolve({ data: [] }),
      ]);
      setRaces(raceData ?? []);
      setLeaderboard(lbData ?? []);
      setLoading(false);
    }
    load();
  }, [paddockId]);

  const now = new Date();
  const nextRace = races.find(r => r.status !== 'finished' && new Date(r.race_date) >= now) ?? races[races.length - 1];
  const countdown = useCountdown(nextRace?.race_at ?? (nextRace ? nextRace.race_date + 'T13:00:00Z' : null));

  const finished = races.filter(r => r.status === 'finished');

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mute)', letterSpacing: '0.12em' }}>LOADING…</div>
      </div>
    );
  }

  const MONO = { fontFamily: 'JetBrains Mono, monospace' };
  const HEAD = { fontFamily: 'Archivo Black, sans-serif' };

  const PADDOCK_CARDS = [
    { label: 'Championship\nStandings', icon: '🏆', path: `/f1/${paddockId}/standings` },
    { label: 'Year\nBets',              icon: '📅', path: `/f1/${paddockId}/season` },
    { label: 'Race\nBets',              icon: '🎯', path: `/f1/${paddockId}/picks` },
    { label: 'Report',                  icon: '📊', path: `/f1/${paddockId}/report` },
  ];

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 32 }}>

      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '20px 16px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.18em', color: 'var(--on-shell-dim)', textTransform: 'uppercase', marginBottom: 4 }}>
              🏎 Formula 1 · 2026
            </div>
            <button
              onClick={() => setShowSelector(s => !s)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ ...HEAD, fontSize: 20, color: 'var(--on-shell)', lineHeight: 1.1 }}>
                {activePaddock?.name ?? 'SELECT PADDOCK'} <span style={{ fontSize: 12, opacity: 0.5 }}>▾</span>
              </div>
            </button>
            <div style={{ ...MONO, fontSize: 9, color: 'var(--on-shell-dim)', letterSpacing: '0.12em', marginTop: 2 }}>
              {activePaddock?.member_count ?? 0} members · {finished.length}/{races.length} races
            </div>
          </div>
          {/* Admin button — always visible; AdminScreen handles access control */}
          {paddockId && (
            <button
              onClick={() => navigate(`/f1/${paddockId}/admin`)}
              style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 6, cursor: 'pointer', ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--on-shell)', whiteSpace: 'nowrap' }}
            >
              ADMIN
            </button>
          )}
        </div>

        {/* Paddock switcher dropdown */}
        {showSelector && myPaddocks.length > 1 && (
          <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            {myPaddocks.map(p => (
              <button
                key={p.paddock_id}
                onClick={() => { switchPaddock(p.paddock_id); navigate(`/f1/${p.paddock_id}`); setShowSelector(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', background: p.paddock_id === paddockId ? 'rgba(26,111,168,0.2)' : 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', fontFamily: 'Archivo, sans-serif', fontSize: 14, color: p.paddock_id === paddockId ? 'var(--accent)' : 'rgba(255,255,255,0.8)' }}
              >
                {p.name}
                <span style={{ ...MONO, fontSize: 9, color: 'rgba(255,255,255,0.35)', marginLeft: 8 }}>{p.member_count}m</span>
              </button>
            ))}
            <button
              onClick={() => { navigate('/f1'); setShowSelector(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', ...MONO, fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}
            >
              + JOIN OR CREATE PADDOCK
            </button>
          </div>
        )}
      </div>

      {/* CALENDAR | PADDOCKS section bar */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', background: 'var(--elev)' }}>
        {[['calendar', 'CALENDAR'], ['paddocks', 'PADDOCKS']].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            style={{
              flex: 1,
              padding: '11px 0',
              background: 'none',
              border: 'none',
              borderBottom: section === key ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              ...MONO,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: section === key ? 'var(--accent)' : 'var(--mute)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── CALENDAR section ──────────────────────────────────────── */}
      {section === 'calendar' && (
        <div style={{ padding: '16px 16px 0' }}>
          {/* Next Race countdown */}
          {nextRace && nextRace.status !== 'finished' && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.14em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 8 }}>
                Next Race
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ ...HEAD, fontSize: 17, color: 'var(--paper)' }}>
                    {getFlag(nextRace.gp_name)} {nextRace.gp_name}
                  </div>
                  <div style={{ ...MONO, fontSize: 10, color: 'var(--mute)', marginTop: 3 }}>
                    R{nextRace.round_number} · {nextRace.circuit}
                  </div>
                </div>
                {countdown && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...HEAD, fontSize: 18, color: 'var(--accent)' }}>
                      {countdown.d > 0 ? `${countdown.d}d ${countdown.h}h` : `${countdown.h}h ${countdown.m}m`}
                    </div>
                    <div style={{ ...MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '0.12em' }}>TO RACE</div>
                  </div>
                )}
              </div>
              <button
                onClick={() => navigate(`/f1/${paddockId}/picks/${nextRace.round_number}`)}
                style={{ display: 'block', width: '100%', padding: '10px', background: 'var(--accent)', color: '#fff', borderRadius: 6, ...MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textAlign: 'center', border: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
              >
                SUBMIT PICKS FOR R{nextRace.round_number} →
              </button>
            </div>
          )}

          {/* Full calendar */}
          <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 10 }}>
            2026 Season Calendar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {races.map(race => {
              const isNext = race.id === nextRace?.id;
              return (
                <button
                  key={race.id}
                  onClick={() => navigate(`/f1/${paddockId}/picks/${race.round_number}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: isNext ? 'rgba(26,111,168,0.06)' : 'var(--card)', border: `1px solid ${isNext ? 'var(--accent)' : 'var(--rule)'}`, borderRadius: 6, cursor: 'pointer', opacity: race.status === 'finished' ? 0.65 : 1, textAlign: 'left', width: '100%' }}
                >
                  <span style={{ ...MONO, fontSize: 10, color: 'var(--mute)', minWidth: 24, textAlign: 'right' }}>
                    R{race.round_number}
                  </span>
                  <span style={{ fontSize: 16 }}>{getFlag(race.gp_name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--paper)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {race.gp_name}
                    </div>
                    <div style={{ ...MONO, fontSize: 9, color: 'var(--mute)', marginTop: 1 }}>
                      {new Date(race.race_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      {race.is_saturday ? ' · SPRINT' : ''}
                    </div>
                  </div>
                  {race.status === 'finished' && race.result_p1 ? (
                    <span style={{ ...MONO, fontSize: 10, color: 'var(--mute)', textAlign: 'right' }}>
                      {race.result_p1.split(' ').pop()}
                    </span>
                  ) : (
                    <RaceStatusBadge race={race} />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── PADDOCKS section ──────────────────────────────────────── */}
      {section === 'paddocks' && (
        <div style={{ padding: '20px 16px' }}>

          {/* My Picks shortcut */}
          <button
            onClick={() => navigate(`/f1/${paddockId}/picks`)}
            style={{ display: 'block', width: '100%', marginBottom: 20, padding: '13px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', ...MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textAlign: 'center', boxSizing: 'border-box' }}
          >
            MY PICKS →
          </button>

          {/* 2×2 card grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
            {PADDOCK_CARDS.map(card => (
              <button
                key={card.label}
                onClick={() => navigate(card.path)}
                style={{ padding: '18px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 10, cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <span style={{ fontSize: 22 }}>{card.icon}</span>
                <span style={{ ...MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--paper)', whiteSpace: 'pre-line' }}>
                  {card.label}
                </span>
                <span style={{ ...MONO, fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em' }}>VIEW →</span>
              </button>
            ))}
          </div>

          {/* Leaderboard preview */}
          {leaderboard.length > 0 && (
            <>
              <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 10 }}>
                Top of the Paddock
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {leaderboard.slice(0, 5).map(m => (
                  <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '10px 12px' }}>
                    <span style={{ ...HEAD, fontSize: 14, color: m.rank <= 3 ? 'var(--gold)' : 'var(--mute)', minWidth: 20 }}>
                      {m.rank <= 3 ? ['🥇','🥈','🥉'][m.rank - 1] : m.rank}
                    </span>
                    <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--paper)', flex: 1 }}>
                      {m.display_name}
                    </span>
                    <span style={{ ...HEAD, fontSize: 15, color: 'var(--paper)' }}>{m.total_points}</span>
                    <span style={{ ...MONO, fontSize: 9, color: 'var(--mute)' }}>PTS</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigate(`/f1/${paddockId}/standings`)}
                style={{ display: 'block', width: '100%', marginTop: 10, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', ...MONO, fontSize: 10, color: 'var(--accent)', letterSpacing: '0.12em', textAlign: 'center' }}
              >
                FULL STANDINGS →
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
