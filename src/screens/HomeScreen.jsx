import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabase';

// ── Competition registry ──────────────────────────────────────────────────────
const COMPS = {
  EPL: { code: 'EPL', name: 'PREMIER LEAGUE',   tone: '#00B4D8' },
  UCL: { code: 'UCL', name: 'CHAMPIONS LEAGUE', tone: '#E0A800' },
  UEL: { code: 'UEL', name: 'EUROPA LEAGUE',    tone: '#A855F7' },
  FAC: { code: 'FAC', name: 'FA CUP',           tone: '#EF4444' },
};

const DAYS   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

// Known 3-letter codes for PL clubs
const TEAM_CODES = {
  'Arsenal': 'ARS', 'Chelsea': 'CHE', 'Liverpool': 'LIV',
  'Man City': 'MCI', 'Manchester City': 'MCI',
  'Man Utd': 'MUN', 'Manchester United': 'MUN',
  'Spurs': 'TOT', 'Tottenham': 'TOT', 'Tottenham Hotspur': 'TOT',
  'Aston Villa': 'AVL', 'Newcastle': 'NEW', 'Newcastle United': 'NEW',
  'Brighton': 'BHA', 'Brighton & Hove Albion': 'BHA',
  'Fulham': 'FUL', 'Brentford': 'BRE', 'Crystal Palace': 'CRY',
  'Everton': 'EVE', 'Nottingham Forest': 'NFO',
  'West Ham': 'WHU', 'West Ham United': 'WHU',
  'Wolves': 'WOL', 'Wolverhampton': 'WOL',
  'Bournemouth': 'BOU', 'AFC Bournemouth': 'BOU',
  'Leeds United': 'LEE', 'Sheffield United': 'SHU',
  'Burnley': 'BUR', 'Luton': 'LUT', 'Sunderland': 'SUN',
  'Leicester City': 'LEI', 'Southampton': 'SOU',
  'Ipswich Town': 'IPS', 'Ipswich': 'IPS',
};

function teamCode(name) {
  return TEAM_CODES[name] || name.substring(0, 3).toUpperCase();
}

// Extract GW number from "Premier League • GW3" or fixture id "md3-f1"
function parseGW(competition, fixtureId) {
  const m = competition && competition.match(/GW\s*(\d+)/i);
  if (m) return parseInt(m[1], 10);
  const m2 = fixtureId && fixtureId.match(/^md(\d+)-/);
  if (m2) return parseInt(m2[1], 10);
  return 1;
}

function detectComp(competition) {
  if (!competition) return 'EPL';
  const lc = competition.toLowerCase();
  if (lc.includes('champions')) return 'UCL';
  if (lc.includes('europa'))    return 'UEL';
  if (lc.includes('fa cup'))    return 'FAC';
  return 'EPL';
}

function normalizeFixture(f) {
  const d        = new Date(f.kickoff_at);
  const hasScore = f.status === 'finished' || f.status === 'live';
  return {
    id:      f.id,
    date:    f.kickoff_at ? d.toISOString().split('T')[0] : '1970-01-01',
    day:     DAYS[d.getDay()],
    dnum:    String(d.getDate()),
    dlong:   `${d.getDate()} ${MONTHS[d.getMonth()]}`,
    kickoff: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    comp:    detectComp(f.competition),
    gw:      parseGW(f.competition, f.id),
    status:  f.status === 'finished' ? 'FT' : f.status === 'live' ? 'LIVE' : 'KO',
    live:    f.status === 'live' ? (f.minute ? `${f.minute}'` : 'LIVE') : undefined,
    home:    { name: f.home_team, code: teamCode(f.home_team) },
    away:    { name: f.away_team, code: teamCode(f.away_team) },
    score:   hasScore ? [f.home_score ?? 0, f.away_score ?? 0] : null,
  };
}

// ── Grouping helpers ──────────────────────────────────────────────────────────
function groupByDate(fixtures) {
  const m = new Map();
  for (const f of fixtures) {
    if (!m.has(f.date))
      m.set(f.date, { date: f.date, day: f.day, dnum: f.dnum, dlong: f.dlong, fixtures: [] });
    m.get(f.date).fixtures.push(f);
  }
  for (const g of m.values())
    g.fixtures.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function groupByComp(fixtures) {
  const m = new Map();
  for (const f of fixtures) {
    const comp = COMPS[f.comp] || { code: f.comp, name: f.comp, tone: '#00B4D8' };
    if (!m.has(f.comp)) m.set(f.comp, { ...comp, fixtures: [] });
    m.get(f.comp).fixtures.push(f);
  }
  for (const g of m.values())
    g.fixtures.sort((a, b) => a.date.localeCompare(b.date) || a.kickoff.localeCompare(b.kickoff));
  return [...m.values()];
}

function countByComp(fixtures) {
  const out = {};
  for (const f of fixtures) out[f.comp] = (out[f.comp] || 0) + 1;
  return out;
}

// ── Atoms ─────────────────────────────────────────────────────────────────────

function StatusPill({ f, small }) {
  const isLive = f.status === 'LIVE';
  const isFT   = f.status === 'FT';
  const isKO   = f.status === 'KO';
  return (
    <div style={{
      minWidth: small ? 40 : 48, height: small ? 20 : 24,
      padding: '0 8px',
      background: isLive ? 'rgba(239,68,68,.12)' : isFT ? 'var(--ink-3)' : 'transparent',
      border: isKO ? '1px solid var(--rule)' : 'none',
      color: isLive ? 'var(--danger)' : isFT ? 'var(--mute)' : 'var(--paper)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      fontFamily: 'JetBrains Mono, monospace', fontSize: small ? 9 : 10,
      letterSpacing: '.16em', flexShrink: 0,
    }}>
      {isLive && (
        <span style={{
          width: 5, height: 5, background: 'var(--danger)',
          borderRadius: '50%', animation: 'fkPulse 1.2s infinite',
        }} />
      )}
      <span>{isLive ? f.live : isFT ? 'FT' : f.kickoff}</span>
    </div>
  );
}

function ScoreBlock({ f, big }) {
  if (!f.score) {
    return (
      <div style={{
        minWidth: big ? 96 : 60, textAlign: 'center',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: big ? 11 : 10, letterSpacing: '.18em', color: 'var(--mute)',
      }}>
        {f.kickoff}
      </div>
    );
  }
  const [h, a]   = f.score;
  const isLive   = f.status === 'LIVE';
  const homeColor = isLive ? 'var(--paper)' : h > a ? 'var(--paper)' : 'var(--mute)';
  const awayColor = isLive ? 'var(--paper)' : a > h ? 'var(--paper)' : 'var(--mute)';
  return (
    <div style={{
      minWidth: big ? 96 : 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: big ? 10 : 8,
      fontFamily: 'Archivo Black, sans-serif',
      fontSize: big ? 18 : 16, letterSpacing: '-0.02em',
    }}>
      <span style={{ color: homeColor }}>{h}</span>
      <span style={{ width: 6, height: 1, background: 'var(--rule)', flexShrink: 0 }} />
      <span style={{ color: awayColor }}>{a}</span>
    </div>
  );
}

function FixtureRow({ f, showComp = false }) {
  const tone    = (COMPS[f.comp] || COMPS.EPL).tone;
  const homeWon = f.score && f.score[0] > f.score[1];
  const awayWon = f.score && f.score[1] > f.score[0];
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: showComp
        ? '56px 1fr 96px 1fr 64px 40px'
        : '56px 1fr 96px 1fr 64px',
      gap: 16, alignItems: 'center',
      padding: '14px 18px',
      borderBottom: '1px solid var(--rule)',
      background:  f.status === 'LIVE' ? 'rgba(239,68,68,.04)' : 'transparent',
      borderLeft:  f.status === 'LIVE' ? '2px solid var(--danger)' : '2px solid transparent',
    }}>
      <StatusPill f={f} />
      {/* Home — right aligned */}
      <div style={{ textAlign: 'right', minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontFamily: 'Archivo Black, sans-serif', fontSize: 14,
          letterSpacing: '-0.01em', textTransform: 'uppercase',
          color: homeWon ? 'var(--paper)' : f.score ? 'var(--mute)' : 'var(--paper)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{f.home.name}</div>
        <div style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
          color: 'var(--mute)', marginTop: 2,
        }}>{f.home.code}</div>
      </div>
      <ScoreBlock f={f} big />
      {/* Away — left aligned */}
      <div style={{ minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontFamily: 'Archivo Black, sans-serif', fontSize: 14,
          letterSpacing: '-0.01em', textTransform: 'uppercase',
          color: awayWon ? 'var(--paper)' : f.score ? 'var(--mute)' : 'var(--paper)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{f.away.name}</div>
        <div style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
          color: 'var(--mute)', marginTop: 2,
        }}>{f.away.code}</div>
      </div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
        color: 'var(--mute)', textAlign: 'right',
      }}>{f.kickoff}</div>
      {showComp && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div title={(COMPS[f.comp] || COMPS.EPL).name} style={{
            width: 32, height: 18,
            border: `1px solid ${tone}`, color: tone,
            fontFamily: 'Archivo Black, sans-serif', fontSize: 9,
            letterSpacing: '.04em',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>{f.comp}</div>
        </div>
      )}
    </div>
  );
}

function MobileFixtureRow({ f }) {
  const tone    = (COMPS[f.comp] || COMPS.EPL).tone;
  const homeWon = f.score && f.score[0] > f.score[1];
  const awayWon = f.score && f.score[1] > f.score[0];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '40px 1fr 60px 1fr',
      gap: 10, alignItems: 'center',
      padding: '11px 18px', borderBottom: '1px solid var(--rule)',
      background: f.status === 'LIVE' ? 'rgba(239,68,68,.04)' : 'transparent',
      borderLeft: f.status === 'LIVE' ? '2px solid var(--danger)' : '2px solid transparent',
    }}>
      <StatusPill f={f} small />
      <div style={{ textAlign: 'right', minWidth: 0 }}>
        <div style={{
          fontFamily: 'Archivo Black, sans-serif', fontSize: 11,
          letterSpacing: '-0.01em', textTransform: 'uppercase',
          color: homeWon ? 'var(--paper)' : f.score ? 'var(--mute)' : 'var(--paper)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{f.home.code}</div>
      </div>
      <ScoreBlock f={f} />
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          fontFamily: 'Archivo Black, sans-serif', fontSize: 11,
          letterSpacing: '-0.01em', textTransform: 'uppercase',
          color: awayWon ? 'var(--paper)' : f.score ? 'var(--mute)' : 'var(--paper)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{f.away.code}</div>
        <span style={{ width: 2, height: 14, background: tone, marginLeft: 'auto', flexShrink: 0 }} />
      </div>
    </div>
  );
}

function DateBand({ g, mini }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 14,
      padding: mini ? '12px 18px 6px' : '20px 18px 10px',
    }}>
      <div style={{ width: 3, height: mini ? 14 : 18, background: 'var(--paper)', flexShrink: 0 }} />
      <div style={{
        fontFamily: 'Archivo Black, sans-serif',
        fontSize: mini ? 16 : 20, letterSpacing: '-0.01em',
      }}>{g.day}</div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11, letterSpacing: '.18em', color: 'var(--mute)',
      }}>{g.dlong}</div>
      <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)',
      }}>{g.fixtures.length} MATCH{g.fixtures.length > 1 ? 'ES' : ''}</div>
    </div>
  );
}

function CompBand({ comp, count, mini }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 14,
      padding: mini ? '12px 18px 6px' : '20px 18px 10px',
    }}>
      <div style={{ width: 3, height: mini ? 14 : 18, background: comp.tone, flexShrink: 0 }} />
      <div style={{
        fontFamily: 'Archivo Black, sans-serif',
        fontSize: mini ? 14 : 16, letterSpacing: '.04em', color: 'var(--paper)',
      }}>{comp.name}</div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10, color: comp.tone, letterSpacing: '.18em',
      }}>{comp.code}</div>
      <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)',
      }}>{count} MATCH{count > 1 ? 'ES' : ''}</div>
    </div>
  );
}

function CompChip({ comp, active, count, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 10px',
      border: `1px solid ${active ? comp.tone : 'var(--rule)'}`,
      color: active ? comp.tone : 'var(--paper)',
      background: active ? 'rgba(255,255,255,.02)' : 'transparent',
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.18em',
      cursor: 'pointer', userSelect: 'none', flexShrink: 0,
    }}>
      <span style={{ width: 6, height: 6, background: comp.tone, flexShrink: 0 }} />
      <span>{comp.code}</span>
      <span style={{ color: 'var(--mute)' }}>{count}</span>
    </div>
  );
}

function AllChip({ active, count, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8,
      padding: '5px 10px',
      border: `1px solid ${active ? 'var(--paper)' : 'var(--rule)'}`,
      color: active ? 'var(--paper)' : 'var(--mute)',
      fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '.18em',
      cursor: 'pointer', userSelect: 'none', flexShrink: 0,
    }}>
      <span>ALL</span>
      <span style={{ color: 'var(--mute)' }}>{count}</span>
    </div>
  );
}

function GameweekPager({ gw, dateRange, onPrev, onNext, disablePrev, disableNext }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      border: '1px solid var(--rule)', flexShrink: 0,
    }}>
      <button onClick={onPrev} disabled={disablePrev} style={{
        width: 34, height: 34, background: 'transparent', border: 'none',
        borderRight: '1px solid var(--rule)',
        color: disablePrev ? 'var(--mute)' : 'var(--paper)',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 14,
        cursor: disablePrev ? 'default' : 'pointer',
      }}>‹</button>
      <div style={{
        padding: '0 16px', height: 34,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', minWidth: 140,
      }}>
        <div style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em',
        }}>GAMEWEEK</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 2 }}>
          <div style={{
            fontFamily: 'Archivo Black, sans-serif',
            fontSize: 14, letterSpacing: '-0.01em',
          }}>GW {gw}</div>
          {dateRange && (
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9, color: 'var(--mute)',
            }}>{dateRange}</div>
          )}
        </div>
      </div>
      <button onClick={onNext} disabled={disableNext} style={{
        width: 34, height: 34, background: 'transparent', border: 'none',
        borderLeft: '1px solid var(--rule)',
        color: disableNext ? 'var(--mute)' : 'var(--paper)',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 14,
        cursor: disableNext ? 'default' : 'pointer',
      }}>›</button>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const [allFixtures, setAllFixtures] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [view,        setView]        = useState('date'); // 'date' | 'comp'
  const [filter,      setFilter]      = useState('ALL');
  const [gw,          setGw]          = useState(null);

  const fetchFixtures = useCallback(async () => {
    const { data } = await supabase
      .from('fixtures')
      .select('*')
      .order('kickoff_at', { ascending: true });
    if (data?.length) setAllFixtures(data.map(normalizeFixture));
    setLoading(false);
  }, []);

  useEffect(() => { fetchFixtures(); }, [fetchFixtures]);

  // Realtime: re-fetch on any fixture change
  useEffect(() => {
    const ch = supabase
      .channel('home-fixtures')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, fetchFixtures)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchFixtures]);

  // LIVE polling every 30s — only when live fixtures exist
  useEffect(() => {
    if (!allFixtures.some(f => f.status === 'LIVE')) return;
    const t = setInterval(fetchFixtures, 30000);
    return () => clearInterval(t);
  }, [allFixtures, fetchFixtures]);

  // ── Gameweek derivation ──────────────────────────────────────────
  const rounds = useMemo(
    () => [...new Set(allFixtures.map(f => f.gw))].sort((a, b) => a - b),
    [allFixtures],
  );
  const minRound = useMemo(() => rounds[0]  ?? 1, [rounds]);
  const maxRound = useMemo(() => rounds[rounds.length - 1] ?? 1, [rounds]);

  // Auto-select latest GW on first load
  useEffect(() => {
    if (gw === null && rounds.length > 0) setGw(maxRound);
  }, [rounds, gw, maxRound]);

  // ── Derived view data ────────────────────────────────────────────
  const gwFixtures = useMemo(
    () => gw !== null ? allFixtures.filter(f => f.gw === gw) : allFixtures,
    [allFixtures, gw],
  );

  const gwDateRange = useMemo(() => {
    if (!gwFixtures.length) return '';
    const sorted = [...gwFixtures].sort((a, b) => a.date.localeCompare(b.date));
    const first = sorted[0], last = sorted[sorted.length - 1];
    if (first.date === last.date) return first.dlong;
    const fm = parseInt(first.date.split('-')[1], 10);
    const lm = parseInt(last.date.split('-')[1],  10);
    if (fm === lm) return `${first.dnum}–${last.dnum} ${MONTHS[fm - 1]}`;
    return `${first.dlong}–${last.dlong}`;
  }, [gwFixtures]);

  const filtered = useMemo(
    () => filter === 'ALL' ? gwFixtures : gwFixtures.filter(f => f.comp === filter),
    [gwFixtures, filter],
  );

  const counts         = useMemo(() => countByComp(gwFixtures), [gwFixtures]);
  const liveCount      = useMemo(() => gwFixtures.filter(f => f.status === 'LIVE').length, [gwFixtures]);
  const availableComps = useMemo(
    () => Object.keys(counts).map(k => COMPS[k] || { code: k, name: k, tone: '#00B4D8' }),
    [counts],
  );
  const dateGroups = useMemo(() => groupByDate(filtered), [filtered]);
  const compGroups = useMemo(() => groupByComp(filtered), [filtered]);

  // ── Loading skeleton ──────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ padding: '24px 32px', color: 'var(--paper)' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>MATCH CENTRE</div>
        <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 34, marginTop: 4 }}>Scores</div>
        <div style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[0.4, 0.55, 0.7].map((op, i) => (
            <div key={i} style={{ height: 52, background: 'var(--ink-3)', opacity: op }} />
          ))}
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100dvh', background: 'var(--ink)', color: 'var(--paper)',
    }}>
      <style>{`@keyframes fkPulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      {/* ── Band 1: Page header ───────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        padding: '24px 32px 16px', borderBottom: '1px solid var(--rule)', flexShrink: 0,
      }}>
        <div>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>
            MATCH CENTRE
          </div>
          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 34, marginTop: 4, letterSpacing: '-0.02em' }}>
            Scores
          </div>
        </div>
        <div style={{ display: 'flex', gap: 32, alignItems: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>FIXTURES</div>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 20, marginTop: 2 }}>{gwFixtures.length}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>LIVE NOW</div>
            <div style={{
              fontFamily: 'Archivo Black, sans-serif', fontSize: 20, marginTop: 2,
              color: liveCount > 0 ? 'var(--danger)' : 'var(--mute)',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
            }}>
              {liveCount > 0 && (
                <span style={{
                  width: 8, height: 8, background: 'var(--danger)',
                  borderRadius: '50%', display: 'inline-block', animation: 'fkPulse 1.2s infinite',
                }} />
              )}
              {liveCount}
            </div>
          </div>
        </div>
      </div>

      {/* ── Band 2: Sub-tabs ──────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 24, padding: '14px 32px',
        borderBottom: '1px solid var(--rule)', flexShrink: 0,
      }}>
        {['SCORES', 'RESULTS', 'LIVE', 'TABLES'].map(t => (
          <div key={t} style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            letterSpacing: '.18em', paddingBottom: 6, position: 'relative',
            color: t === 'SCORES' ? 'var(--paper)' : 'var(--mute)',
            cursor: 'default',
          }}>
            {t}
            {t === 'LIVE' && (
              <span style={{
                display: 'inline-block', width: 5, height: 5,
                borderRadius: '50%', background: 'var(--danger)',
                marginLeft: 6, verticalAlign: 'middle',
              }} />
            )}
            {t === 'SCORES' && (
              <span style={{
                position: 'absolute', left: 0, right: 0,
                bottom: -15, height: 2, background: 'var(--cyan)',
              }} />
            )}
          </div>
        ))}
      </div>

      {/* ── Band 3: Controls — Desktop ───────────────────────────── */}
      <div className="hidden lg:flex" style={{
        alignItems: 'center', justifyContent: 'space-between',
        gap: 24, padding: '14px 32px',
        borderBottom: '1px solid var(--rule)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, minWidth: 0, overflow: 'hidden' }}>
          {/* Group-by label */}
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em', flexShrink: 0 }}>
            GROUP BY
          </div>
          {/* Segmented toggle */}
          <div style={{ display: 'inline-flex', border: '1px solid var(--rule)', flexShrink: 0 }}>
            {[{ id: 'date', label: 'DATE' }, { id: 'comp', label: 'COMPETITION' }].map((o, i) => (
              <button key={o.id} onClick={() => setView(o.id)} style={{
                padding: '7px 14px',
                background: view === o.id ? 'rgba(0,180,216,.08)' : 'transparent',
                color: view === o.id ? 'var(--cyan)' : 'var(--mute)',
                border: 'none', borderRight: i === 0 ? '1px solid var(--rule)' : 'none',
                fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                letterSpacing: '.18em', cursor: 'pointer',
              }}>{o.label}</button>
            ))}
          </div>
          {/* Divider */}
          <div style={{ width: 1, height: 20, background: 'var(--rule)', margin: '0 6px', flexShrink: 0 }} />
          {/* Comp chips */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto' }}>
            <AllChip active={filter === 'ALL'} count={gwFixtures.length} onClick={() => setFilter('ALL')} />
            {availableComps.map(c => (
              <CompChip
                key={c.code} comp={c}
                count={counts[c.code] || 0}
                active={filter === c.code}
                onClick={() => setFilter(c.code)}
              />
            ))}
          </div>
        </div>
        {/* Gameweek pager */}
        {rounds.length > 0 && gw !== null && (
          <GameweekPager
            gw={gw} dateRange={gwDateRange}
            onPrev={() => setGw(g => Math.max(minRound, g - 1))}
            onNext={() => setGw(g => Math.min(maxRound, g + 1))}
            disablePrev={gw <= minRound}
            disableNext={gw >= maxRound}
          />
        )}
      </div>

      {/* ── Band 3: Controls — Mobile (2 rows) ───────────────────── */}
      <div className="lg:hidden" style={{
        padding: '12px 18px 10px',
        borderBottom: '1px solid var(--rule)', flexShrink: 0,
      }}>
        {/* Row A: toggle + compact pager */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--rule)', flex: 1 }}>
            {[{ id: 'date', label: 'BY DATE' }, { id: 'comp', label: 'BY COMP' }].map((o, i) => (
              <button key={o.id} onClick={() => setView(o.id)} style={{
                flex: 1, padding: '6px 0',
                background: view === o.id ? 'rgba(0,180,216,.08)' : 'transparent',
                color: view === o.id ? 'var(--cyan)' : 'var(--mute)',
                border: 'none', borderRight: i === 0 ? '1px solid var(--rule)' : 'none',
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
                letterSpacing: '.18em', cursor: 'pointer',
              }}>{o.label}</button>
            ))}
          </div>
          {rounds.length > 0 && gw !== null && (
            <div style={{ display: 'inline-flex', border: '1px solid var(--rule)', flexShrink: 0 }}>
              <button
                onClick={() => setGw(g => Math.max(minRound, g - 1))}
                disabled={gw <= minRound}
                style={{
                  width: 28, height: 28, background: 'transparent', border: 'none',
                  borderRight: '1px solid var(--rule)',
                  color: gw <= minRound ? 'var(--mute)' : 'var(--paper)',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                  cursor: gw <= minRound ? 'default' : 'pointer',
                }}
              >‹</button>
              <div style={{ padding: '0 10px', height: 28, display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)' }}>GW</div>
                <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 11 }}>{gw}</div>
              </div>
              <button
                onClick={() => setGw(g => Math.min(maxRound, g + 1))}
                disabled={gw >= maxRound}
                style={{
                  width: 28, height: 28, background: 'transparent', border: 'none',
                  borderLeft: '1px solid var(--rule)',
                  color: gw >= maxRound ? 'var(--mute)' : 'var(--paper)',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 12,
                  cursor: gw >= maxRound ? 'default' : 'pointer',
                }}
              >›</button>
            </div>
          )}
        </div>
        {/* Row B: scrollable comp chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          <AllChip active={filter === 'ALL'} count={gwFixtures.length} onClick={() => setFilter('ALL')} />
          {availableComps.map(c => (
            <CompChip
              key={c.code} comp={c}
              count={counts[c.code] || 0}
              active={filter === c.code}
              onClick={() => setFilter(c.code)}
            />
          ))}
        </div>
      </div>

      {/* ── Body: fixture groups ──────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding: '48px 32px', textAlign: 'center' }}>
            <div style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em', marginBottom: 10,
            }}>NO FIXTURES</div>
            <div style={{
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: 22, letterSpacing: '-0.02em',
            }}>Nothing scheduled</div>
          </div>
        )}

        {/* Desktop */}
        <div className="hidden lg:block">
          {view === 'date' && dateGroups.map(g => (
            <section key={g.date}>
              <DateBand g={g} />
              {g.fixtures.map(f => <FixtureRow key={f.id} f={f} showComp />)}
            </section>
          ))}
          {view === 'comp' && compGroups.map(g => (
            <section key={g.code}>
              <CompBand comp={g} count={g.fixtures.length} />
              {g.fixtures.map(f => <FixtureRow key={f.id} f={f} />)}
            </section>
          ))}
        </div>

        {/* Mobile */}
        <div className="lg:hidden">
          {view === 'date' && dateGroups.map(g => (
            <section key={g.date}>
              <DateBand g={g} mini />
              {g.fixtures.map(f => <MobileFixtureRow key={f.id} f={f} />)}
            </section>
          ))}
          {view === 'comp' && compGroups.map(g => (
            <section key={g.code}>
              <CompBand comp={g} count={g.fixtures.length} mini />
              {g.fixtures.map(f => <MobileFixtureRow key={f.id} f={f} />)}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
