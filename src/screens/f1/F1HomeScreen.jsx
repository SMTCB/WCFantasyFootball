import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  const { setActivePaddockId, setActiveSport } = useSport();
  const { myPaddocks, activePaddock, setActivePaddockId: switchPaddock } = usePaddock();

  const [races, setRaces] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSelector, setShowSelector] = useState(false);

  useEffect(() => {
    if (paddockId) {
      setActivePaddockId(paddockId);
      setActiveSport('f1');
    }
  }, [paddockId, setActivePaddockId, setActiveSport]);

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

  return (
    <div style={{ background: 'var(--ink)', paddingBottom: 32 }}>

      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '20px 16px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: 4 }}>
              🏎 F1 · 2026 Season
            </div>
            {/* Paddock selector */}
            <button
              onClick={() => setShowSelector(s => !s)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 20, color: '#fff', lineHeight: 1.1 }}>
                {activePaddock?.name ?? 'PADDOCK'} <span style={{ fontSize: 12, opacity: 0.5 }}>▾</span>
              </div>
            </button>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', marginTop: 2 }}>
              {activePaddock?.member_count ?? 0} members · {finished.length}/{races.length} races
            </div>
          </div>
          <Link
            to={`/f1/${paddockId}/picks`}
            style={{ padding: '9px 16px', background: 'var(--cyan)', color: '#fff', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textDecoration: 'none', whiteSpace: 'nowrap' }}
          >
            MY PICKS →
          </Link>
        </div>

        {/* Paddock dropdown */}
        {showSelector && myPaddocks.length > 1 && (
          <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.3)', borderRadius: 8, overflow: 'hidden' }}>
            {myPaddocks.map(p => (
              <button
                key={p.paddock_id}
                onClick={() => { switchPaddock(p.paddock_id); navigate(`/f1/${p.paddock_id}`); setShowSelector(false); }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '11px 14px', background: p.paddock_id === paddockId ? 'rgba(26,111,168,0.2)' : 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', fontFamily: 'Archivo, sans-serif', fontSize: 14, color: p.paddock_id === paddockId ? 'var(--cyan)' : 'rgba(255,255,255,0.75)' }}
              >
                {p.name} <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginLeft: 6 }}>{p.member_count}m</span>
              </button>
            ))}
            <button
              onClick={() => { navigate('/f1'); setShowSelector(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}
            >
              + JOIN OR CREATE
            </button>
          </div>
        )}
      </div>

      {/* Next Race countdown */}
      {nextRace && nextRace.status !== 'finished' && (
        <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', padding: '14px 16px' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.14em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 8 }}>
            Next Race
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 17, color: 'var(--paper)' }}>
                {getFlag(nextRace.gp_name)} {nextRace.gp_name}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', marginTop: 3 }}>
                R{nextRace.round_number} · {nextRace.circuit}
              </div>
            </div>
            {countdown && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 18, color: 'var(--accent)' }}>
                  {countdown.d > 0 ? `${countdown.d}d ${countdown.h}h` : `${countdown.h}h ${countdown.m}m`}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '0.12em' }}>TO RACE</div>
              </div>
            )}
          </div>
          <Link
            to={`/f1/${paddockId}/picks/${nextRace.round_number}`}
            style={{ display: 'block', marginTop: 10, padding: '10px', background: 'var(--accent)', color: '#fff', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textDecoration: 'none', textAlign: 'center' }}
          >
            SUBMIT PICKS FOR R{nextRace.round_number} →
          </Link>
        </div>
      )}

      {/* Leaderboard top 3 */}
      {leaderboard.length > 0 && (
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 10 }}>
            Paddock Standings
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {leaderboard.slice(0, 3).map(m => (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '10px 12px' }}>
                <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: m.rank === 1 ? 'var(--gold)' : m.rank === 2 ? 'var(--mute)' : 'var(--paper)', minWidth: 20 }}>
                  {m.rank === 1 ? '🥇' : m.rank === 2 ? '🥈' : '🥉'}
                </span>
                <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--paper)', flex: 1 }}>
                  {m.display_name}
                </span>
                <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: 'var(--paper)' }}>
                  {m.total_points}
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)' }}>PTS</span>
              </div>
            ))}
          </div>
          {leaderboard.length > 3 && (
            <Link to={`/f1/${paddockId}/standings`} style={{ display: 'block', padding: '10px 0', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--accent)', letterSpacing: '0.12em', textDecoration: 'none', textAlign: 'center' }}>
              VIEW FULL STANDINGS →
            </Link>
          )}
        </div>
      )}

      {/* Race Calendar */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.14em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 10 }}>
          2026 Calendar
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {races.map(race => {
            const isNext = race.id === nextRace?.id;
            return (
              <Link
                key={race.id}
                to={`/f1/${paddockId}/picks/${race.round_number}`}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: isNext ? 'rgba(26,111,168,0.08)' : 'var(--card)', border: `1px solid ${isNext ? 'var(--accent)' : 'var(--rule)'}`, borderRadius: 6, textDecoration: 'none', opacity: race.status === 'finished' ? 0.6 : 1 }}
              >
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', minWidth: 24, textAlign: 'right' }}>
                  R{race.round_number}
                </span>
                <span style={{ fontSize: 16 }}>{getFlag(race.gp_name)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--paper)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {race.gp_name}
                  </div>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', marginTop: 1 }}>
                    {new Date(race.race_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    {race.is_saturday ? ' · SPRINT' : ''}
                  </div>
                </div>
                {race.status === 'finished' && race.result_p1 ? (
                  <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', textAlign: 'right' }}>
                    {race.result_p1.split(' ').pop()}
                  </span>
                ) : (
                  <RaceStatusBadge race={race} />
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
