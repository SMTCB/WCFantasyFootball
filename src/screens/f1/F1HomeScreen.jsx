import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { usePaddock } from '../../hooks/f1/usePaddock';
import { useSport } from '../../context/SportContext';
import { useAuth } from '../../hooks/useAuth';
import { getFlag } from '../../lib/f1/f1-data';
import { useShowArchived } from '../../hooks/useShowArchived';
import { ArchivedBadge } from '../../components/league/LeagueBadges';
import CompetitionSettingsModal from '../../components/shared/CompetitionSettingsModal';

// Checkered-flag motif — pure CSS checkerboard, no image asset. Recurs sparingly
// as a decorative divider under the F1 Home header (and above Report's podium viz).
function CheckeredStrip() {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 6,
        backgroundImage:
          'repeating-conic-gradient(#0A0A0A 0% 25%, #FFFFFF 0% 50%)',
        backgroundSize: '12px 12px',
      }}
    />
  );
}

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

// Status pill vocabulary: upcoming=grey, open (next race)=solid f1-red "Picks open",
// live=gold, quali=blue-tinted "Qualifying" — the one place blue survives inside F1,
// since it's state signaling (a session type), not brand identity.
function RaceStatusBadge({ race, isNext, isPast }) {
  let bg, color, label;
  if (race.status === 'race') {
    bg = 'var(--gold)'; color = '#fff'; label = '🔴 LIVE';
  } else if (race.status === 'qualifying') {
    bg = 'rgba(26,111,168,0.12)'; color = 'var(--accent)'; label = 'QUALIFYING';
  } else if (isNext) {
    bg = 'var(--f1)'; color = '#fff'; label = 'PICKS OPEN';
  } else if (isPast) {
    bg = 'var(--elev)'; color = 'var(--mute)'; label = 'RESULTS PENDING';
  } else {
    bg = 'var(--elev)'; color = 'var(--mute)'; label = 'UPCOMING';
  }
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 'var(--fs-micro)',
      fontWeight: 700,
      letterSpacing: '0.12em',
      padding: '2px 7px',
      borderRadius: 3,
      background: bg,
      color,
    }}>
      {label}
    </span>
  );
}

export default function F1HomeScreen() {
  const { paddockId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setActivePaddockId } = useSport();
  const { myPaddocks, activePaddock, setActivePaddockId: switchPaddock, refresh: refreshPaddocks } = usePaddock();

  const [races, setRaces] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSelector, setShowSelector] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [section, setSection] = useState('calendar'); // 'calendar' | 'paddocks'
  const [showArchived, setShowArchived] = useShowArchived('ffl_show_archived_paddocks');

  const archivedPaddockCount = myPaddocks.filter(p => p.archived).length;
  const visiblePaddocks = showArchived ? myPaddocks : myPaddocks.filter(p => !p.archived);

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
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.12em' }}>LOADING…</div>
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
            <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--on-shell-dim)', textTransform: 'uppercase', marginBottom: 4 }}>
              🏎 Formula 1 · 2026
            </div>
            <button
              onClick={() => setShowSelector(s => !s)}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            >
              <div style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: 'var(--on-shell)', lineHeight: 1.1, display: 'flex', alignItems: 'center', gap: 8 }}>
                {activePaddock?.name ?? 'SELECT PADDOCK'} <span style={{ fontSize: 'var(--fs-label)', opacity: 0.5 }}>▾</span>
                {activePaddock?.archived && <ArchivedBadge />}
              </div>
            </button>
            <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--on-shell-dim)', letterSpacing: '0.12em', marginTop: 2 }}>
              {activePaddock?.member_count ?? 0} members · {finished.length}/{races.length} races
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Settings (archive toggle) — owner only */}
            {paddockId && activePaddock?.role === 'owner' && (
              <button
                onClick={() => setShowSettings(true)}
                aria-label="Paddock settings"
                style={{ padding: '8px 10px', background: 'var(--shell-fill-strong)', border: '1px solid var(--shell-rule-emphasis)', borderRadius: 6, cursor: 'pointer', ...MONO, fontSize: 'var(--fs-label)', color: 'var(--on-shell)' }}
              >
                ⚙
              </button>
            )}
            {/* Admin button — always visible; AdminScreen handles access control */}
            {paddockId && (
              <button
                onClick={() => navigate(`/f1/${paddockId}/admin`)}
                style={{ padding: '8px 14px', background: 'var(--shell-fill-strong)', border: '1px solid var(--shell-rule-emphasis)', borderRadius: 6, cursor: 'pointer', ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--on-shell)', whiteSpace: 'nowrap' }}
              >
                ADMIN
              </button>
            )}
          </div>
        </div>

        {/* Paddock switcher dropdown */}
        {showSelector && myPaddocks.length > 1 && (
          <div style={{ marginTop: 10, background: 'rgba(0,0,0,0.25)', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--shell-rule-strong)' }}>
            {visiblePaddocks.map(p => (
              <button
                key={p.paddock_id}
                onClick={() => { switchPaddock(p.paddock_id); navigate(`/f1/${p.paddock_id}`); setShowSelector(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', padding: '11px 14px', background: p.paddock_id === paddockId ? 'rgba(225,6,0,0.2)' : 'transparent', border: 'none', borderBottom: '1px solid var(--shell-rule)', cursor: 'pointer', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: p.paddock_id === paddockId ? 'var(--f1)' : 'var(--on-shell)' }}
              >
                {p.name}
                <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--on-shell-faint)' }}>{p.member_count}m</span>
                {p.archived && <ArchivedBadge />}
              </button>
            ))}
            {archivedPaddockCount > 0 && (
              <button
                onClick={() => setShowArchived(v => !v)}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', borderBottom: '1px solid var(--shell-rule)', cursor: 'pointer', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--on-shell-dim)', letterSpacing: '0.1em' }}
              >
                {showArchived ? '▾ HIDE' : '▸ SHOW'} ARCHIVED ({archivedPaddockCount})
              </button>
            )}
            <button
              onClick={() => { navigate('/f1'); setShowSelector(false); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--on-shell-faint)', letterSpacing: '0.1em' }}
            >
              + JOIN OR CREATE PADDOCK
            </button>
          </div>
        )}
      </div>

      {showSettings && activePaddock && (
        <CompetitionSettingsModal
          competitionType="paddock"
          competitionId={activePaddock.paddock_id}
          name={activePaddock.name}
          archived={activePaddock.archived}
          archivedAt={activePaddock.archived_at}
          onUpdated={refreshPaddocks}
          onClose={() => setShowSettings(false)}
        />
      )}

      <CheckeredStrip />

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
              borderBottom: section === key ? '2px solid var(--f1)' : '2px solid transparent',
              cursor: 'pointer',
              ...MONO,
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
              letterSpacing: '0.14em',
              color: section === key ? 'var(--f1)' : 'var(--mute)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── CALENDAR section ──────────────────────────────────────── */}
      {section === 'calendar' && (
        <div style={{ padding: '16px 16px 0' }}>
          {/* Next Race countdown — solid f1-red fill, the module's single highest-priority element */}
          {nextRace && nextRace.status !== 'finished' && (
            <div style={{ background: 'var(--f1)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.14em', color: 'var(--on-shell)', textTransform: 'uppercase', marginBottom: 8 }}>
                R{nextRace.round_number} · Next Race
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: '#fff' }}>
                    {getFlag(nextRace.gp_name)} {nextRace.gp_name}
                  </div>
                  <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--on-shell)', marginTop: 3 }}>
                    {nextRace.circuit}
                  </div>
                </div>
                {countdown && (
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...HEAD, fontSize: 'var(--fs-title)', color: '#fff' }}>
                      {countdown.d > 0 ? `${countdown.d}d ${countdown.h}h` : `${countdown.h}h ${countdown.m}m`}
                    </div>
                    <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--on-shell)', letterSpacing: '0.12em' }}>TO RACE</div>
                  </div>
                )}
              </div>
              <button
                onClick={() => navigate(`/f1/${paddockId}/picks/${nextRace.round_number}`)}
                style={{ display: 'block', width: '100%', padding: '10px', background: '#fff', color: 'var(--f1)', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.14em', textAlign: 'center', border: 'none', cursor: 'pointer', boxSizing: 'border-box' }}
              >
                SUBMIT PICKS FOR R{nextRace.round_number} →
              </button>
            </div>
          )}

          {/* Leaderboard preview */}
          {leaderboard.length > 0 && (
            <>
              <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 10 }}>
                Top of the Paddock
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {leaderboard.slice(0, 5).map(m => {
                  const isMe = user && m.user_id === user.id;
                  return (
                    <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: isMe ? 'var(--f1-bg)' : 'var(--card)', border: `1px solid ${isMe ? 'var(--f1)' : 'var(--rule)'}`, borderRadius: 6, padding: '10px 12px' }}>
                      <span style={{ ...HEAD, fontSize: 'var(--fs-body)', color: m.rank <= 3 ? 'var(--gold)' : 'var(--mute)', minWidth: 20 }}>
                        {m.rank <= 3 ? ['🥇','🥈','🥉'][m.rank - 1] : m.rank}
                      </span>
                      <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: isMe ? 'var(--f1)' : 'var(--paper)', fontWeight: isMe ? 700 : 400, flex: 1 }}>
                        {m.display_name}{isMe ? ' (You)' : ''}
                      </span>
                      <span style={{ ...HEAD, fontSize: 'var(--fs-body)', color: isMe ? 'var(--f1)' : 'var(--paper)' }}>{m.total_points}</span>
                      <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>PTS</span>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => navigate(`/f1/${paddockId}/standings`)}
                style={{ display: 'block', width: '100%', marginBottom: 20, padding: '10px 0', background: 'none', border: 'none', cursor: 'pointer', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--f1)', letterSpacing: '0.12em', textAlign: 'center' }}
              >
                FULL STANDINGS →
              </button>
            </>
          )}

          {/* Full calendar */}
          <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 10 }}>
            2026 Season Calendar
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {races.map(race => {
              const isNext = race.id === nextRace?.id;
              const isPast = race.status !== 'finished' && new Date(race.race_date) < now;
              // Only genuinely-upcoming rows past the next race dim; finished races stay full opacity.
              const isDimmed = race.status === 'scheduled' && !isNext;
              return (
                <button
                  key={race.id}
                  onClick={() => !isDimmed && navigate(`/f1/${paddockId}/picks/${race.round_number}`)}
                  disabled={isDimmed}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: isNext ? 'var(--f1-bg)' : 'var(--card)', border: `1px solid ${isNext ? 'var(--f1)' : 'var(--rule)'}`, borderLeft: isNext ? '3px solid var(--f1)' : `1px solid var(--rule)`, borderRadius: 6, cursor: isDimmed ? 'default' : 'pointer', opacity: isDimmed ? 0.42 : 1, textAlign: 'left', width: '100%' }}
                >
                  <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', minWidth: 24, textAlign: 'right' }}>
                    R{race.round_number}
                  </span>
                  <span style={{ fontSize: 'var(--fs-body-lg)' }}>{getFlag(race.gp_name)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {race.gp_name}
                    </div>
                    <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 1 }}>
                      {new Date(race.race_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      {race.is_saturday ? ' · SPRINT' : ''}
                    </div>
                  </div>
                  {race.status === 'finished' && race.result_p1 ? (
                    <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', textAlign: 'right' }}>
                      🏆 {race.result_p1.split(' ').pop()}
                    </span>
                  ) : (
                    <RaceStatusBadge race={race} isNext={isNext} isPast={isPast} />
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
            style={{ display: 'block', width: '100%', marginBottom: 20, padding: '13px 16px', background: 'var(--f1)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.14em', textAlign: 'center', boxSizing: 'border-box' }}
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
                <span style={{ fontSize: 'var(--fs-title)' }}>{card.icon}</span>
                <span style={{ ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--paper)', whiteSpace: 'pre-line' }}>
                  {card.label}
                </span>
                <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--f1)', letterSpacing: '0.08em' }}>VIEW →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
