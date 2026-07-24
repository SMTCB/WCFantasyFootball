import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { COMPS, DAYS, MONTHS_SHORT, MONTHS_LONG, normalizeFixture } from '../lib/fixtures';

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
    const comp = COMPS[f.comp] || { code: f.comp, name: f.comp, tone: 'var(--accent)' };
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

// ── List view atoms ───────────────────────────────────────────────────────────

function StatusPill({ f, small }) {
  const isLive = f.status === 'LIVE';
  const isFT   = f.status === 'FT';
  const isKO   = f.status === 'KO';
  return (
    <div style={{
      minWidth: small ? 40 : 48, height: small ? 20 : 24, padding: '0 8px',
      background: isLive ? 'rgba(239,68,68,.12)' : isFT ? 'var(--ink-3)' : 'transparent',
      border: isKO ? '1px solid var(--rule)' : 'none',
      color: isLive ? 'var(--danger)' : isFT ? 'var(--mute)' : 'var(--paper)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      fontFamily: 'JetBrains Mono, monospace', fontSize: small ? 9 : 10,
      letterSpacing: '.16em', flexShrink: 0,
    }}>
      {isLive && <span style={{ width: 5, height: 5, background: 'var(--danger)', borderRadius: '50%', animation: 'fkPulse 1.2s infinite' }} />}
      <span>{isLive ? f.live : isFT ? 'FT' : f.kickoff}</span>
    </div>
  );
}

function ScoreBlock({ f, big }) {
  if (!f.score) {
    return (
      <div style={{
        minWidth: big ? 96 : 60, textAlign: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontSize: big ? 11 : 10,
        letterSpacing: '.18em', color: 'var(--mute)',
      }}>{f.kickoff}</div>
    );
  }
  const [h, a]    = f.score;
  const isLive    = f.status === 'LIVE';
  const homeColor = isLive ? 'var(--paper)' : h > a ? 'var(--paper)' : 'var(--mute)';
  const awayColor = isLive ? 'var(--paper)' : a > h ? 'var(--paper)' : 'var(--mute)';
  return (
    <div style={{
      minWidth: big ? 96 : 60,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: big ? 10 : 8,
      fontFamily: 'Archivo Black, sans-serif', fontSize: big ? 18 : 16, letterSpacing: '-0.02em',
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
      gridTemplateColumns: showComp ? '56px 1fr 96px 1fr 64px 40px 32px' : '56px 1fr 96px 1fr 64px 32px',
      gap: 16, alignItems: 'center',
      padding: '14px 18px', borderBottom: '1px solid var(--rule)',
      background:  f.status === 'LIVE' ? 'rgba(239,68,68,.04)' : 'transparent',
      borderLeft:  f.status === 'LIVE' ? '2px solid var(--danger)' : '2px solid transparent',
    }}>
      <StatusPill f={f} />
      <div style={{ textAlign: 'right', minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontFamily: 'Archivo Black, sans-serif', fontSize: 14, letterSpacing: '-0.01em', textTransform: 'uppercase',
          color: homeWon ? 'var(--paper)' : f.score ? 'var(--mute)' : 'var(--paper)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{f.home.name}</div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', marginTop: 2 }}>{f.home.code}</div>
      </div>
      <ScoreBlock f={f} big />
      <div style={{ minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          fontFamily: 'Archivo Black, sans-serif', fontSize: 14, letterSpacing: '-0.01em', textTransform: 'uppercase',
          color: awayWon ? 'var(--paper)' : f.score ? 'var(--mute)' : 'var(--paper)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{f.away.name}</div>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', marginTop: 2 }}>{f.away.code}</div>
      </div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', textAlign: 'right' }}>{f.kickoff}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', textAlign: 'right', letterSpacing: '.1em' }}>GW{f.gw}</div>
      {showComp && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div title={(COMPS[f.comp] || COMPS.EPL).name} style={{
            width: 32, height: 18, border: `1px solid ${tone}`, color: tone,
            fontFamily: 'Archivo Black, sans-serif', fontSize: 9, letterSpacing: '.04em',
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
      display: 'grid', gridTemplateColumns: '40px 1fr 60px 1fr 24px',
      gap: 10, alignItems: 'center',
      padding: '11px 18px', borderBottom: '1px solid var(--rule)',
      background: f.status === 'LIVE' ? 'rgba(239,68,68,.04)' : 'transparent',
      borderLeft: f.status === 'LIVE' ? '2px solid var(--danger)' : '2px solid transparent',
    }}>
      <StatusPill f={f} small />
      <div style={{ textAlign: 'right', minWidth: 0 }}>
        <div style={{
          fontFamily: 'Archivo Black, sans-serif', fontSize: 11, letterSpacing: '-0.01em', textTransform: 'uppercase',
          color: homeWon ? 'var(--paper)' : f.score ? 'var(--mute)' : 'var(--paper)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{f.home.code}</div>
      </div>
      <ScoreBlock f={f} />
      <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          fontFamily: 'Archivo Black, sans-serif', fontSize: 11, letterSpacing: '-0.01em', textTransform: 'uppercase',
          color: awayWon ? 'var(--paper)' : f.score ? 'var(--mute)' : 'var(--paper)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{f.away.code}</div>
        <span style={{ width: 2, height: 14, background: tone, marginLeft: 'auto', flexShrink: 0 }} />
      </div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 7, color: 'var(--mute)', textAlign: 'right', letterSpacing: '.1em' }}>GW{f.gw}</div>
    </div>
  );
}

function DateBand({ g, mini }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: mini ? '12px 18px 6px' : '20px 18px 10px' }}>
      <div style={{ width: 3, height: mini ? 14 : 18, background: 'var(--paper)', flexShrink: 0 }} />
      <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: mini ? 16 : 20, letterSpacing: '-0.01em' }}>{g.day}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, letterSpacing: '.18em', color: 'var(--mute)' }}>{g.dlong}</div>
      <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)' }}>{g.fixtures.length} MATCH{g.fixtures.length > 1 ? 'ES' : ''}</div>
    </div>
  );
}

function CompBand({ comp, count, mini }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: mini ? '12px 18px 6px' : '20px 18px 10px' }}>
      <div style={{ width: 3, height: mini ? 14 : 18, background: comp.tone, flexShrink: 0 }} />
      <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: mini ? 14 : 16, letterSpacing: '.04em', color: 'var(--paper)' }}>{comp.name}</div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: comp.tone, letterSpacing: '.18em' }}>{comp.code}</div>
      <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)' }}>{count} MATCH{count > 1 ? 'ES' : ''}</div>
    </div>
  );
}

function CompChip({ comp, active, count, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px',
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
      display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 10px',
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

// GW pager — no date range
function GameweekPager({ gw, onPrev, onNext, disablePrev, disableNext }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid var(--rule)', flexShrink: 0 }}>
      <button onClick={onPrev} disabled={disablePrev} style={{
        width: 34, height: 34, background: 'transparent', border: 'none',
        borderRight: '1px solid var(--rule)',
        color: disablePrev ? 'var(--mute)' : 'var(--paper)',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 14,
        cursor: disablePrev ? 'default' : 'pointer',
      }}>‹</button>
      <div style={{
        padding: '0 16px', height: 34,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 96,
      }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>GAMEWEEK</div>
        <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, letterSpacing: '-0.01em', marginTop: 2 }}>GW {gw}</div>
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

// Month pager — for MONTH view controls strip
function MonthPager({ year, monthIndex, onPrev, onNext }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'stretch', border: '1px solid var(--rule)', flexShrink: 0 }}>
      <button onClick={onPrev} style={{
        width: 34, height: 34, background: 'transparent', border: 'none',
        borderRight: '1px solid var(--rule)',
        color: 'var(--paper)', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, cursor: 'pointer',
      }}>‹</button>
      <div style={{
        padding: '0 18px', height: 34,
        display: 'flex', alignItems: 'center', gap: 10, minWidth: 170, justifyContent: 'center',
      }}>
        <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, letterSpacing: '-0.01em' }}>{MONTHS_LONG[monthIndex]}</span>
        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)' }}>{year}</span>
      </div>
      <button onClick={onNext} style={{
        width: 34, height: 34, background: 'transparent', border: 'none',
        borderLeft: '1px solid var(--rule)',
        color: 'var(--paper)', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, cursor: 'pointer',
      }}>›</button>
    </div>
  );
}

// ── Week view ─────────────────────────────────────────────────────────────────

function DayCard({ f }) {
  const tone    = (COMPS[f.comp] || COMPS.EPL).tone;
  const isLive  = f.status === 'LIVE';
  const [h, a]  = f.score || [null, null];
  const homeWon = f.score && h > a;
  const awayWon = f.score && a > h;
  return (
    <div style={{
      background: 'var(--ink-2)',
      borderLeft: `2px solid ${tone}`,
      padding: '10px 12px',
      display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: tone, letterSpacing: '.18em' }}>{f.comp}</div>
        {isLive
          ? <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, background: 'var(--danger)', borderRadius: '50%', animation: 'fkPulse 1.2s infinite' }} />
              {f.live}
            </div>
          : <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.16em' }}>{f.status === 'FT' ? 'FT' : f.kickoff}</div>
        }
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontFamily: 'Archivo Black, sans-serif', fontSize: 11, letterSpacing: '.02em', textTransform: 'uppercase',
            color: homeWon ? 'var(--paper)' : f.score ? 'var(--mute)' : 'var(--paper)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{f.home.code}</div>
          <div style={{
            fontFamily: 'Archivo Black, sans-serif', fontSize: 11, letterSpacing: '.02em', textTransform: 'uppercase',
            color: awayWon ? 'var(--paper)' : f.score ? 'var(--mute)' : 'var(--paper)',
            marginTop: 3,
          }}>{f.away.code}</div>
        </div>
        {f.score
          ? <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: homeWon ? 'var(--paper)' : 'var(--mute)', lineHeight: 1 }}>{h}</div>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, color: awayWon ? 'var(--paper)' : 'var(--mute)', lineHeight: 1, marginTop: 3 }}>{a}</div>
            </div>
          : <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--paper)', letterSpacing: '.16em' }}>{f.kickoff}</div>
        }
      </div>
    </div>
  );
}

function WeekView({ fixtures }) {
  const dateGroups = useMemo(() => groupByDate(fixtures), [fixtures]);

  if (!dateGroups.length) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em', marginBottom: 10 }}>NO FIXTURES</div>
          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 22, letterSpacing: '-0.02em' }}>Nothing scheduled</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1, display: 'grid',
      gridTemplateColumns: `repeat(${dateGroups.length}, 1fr)`,
      minHeight: 0, overflow: 'hidden',
    }}>
      {dateGroups.map((g, i) => (
        <div key={g.date} style={{
          borderRight: i < dateGroups.length - 1 ? '1px solid var(--rule)' : 'none',
          display: 'flex', flexDirection: 'column', minHeight: 0,
        }}>
          {/* Day column header */}
          <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>{g.day}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 2 }}>
              <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 28, letterSpacing: '-0.02em' }}>{g.dnum}</div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)' }}>{g.dlong.split(' ')[1]}</div>
            </div>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', marginTop: 6 }}>
              {g.fixtures.length} FIXTURE{g.fixtures.length > 1 ? 'S' : ''}
            </div>
          </div>
          {/* Cards */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {g.fixtures.map(f => <DayCard key={f.id} f={f} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Month view (V4 spec) ──────────────────────────────────────────────────────

function buildMonthCells(year, monthIndex) {
  const firstDow    = (new Date(year, monthIndex, 1).getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const prevDays    = new Date(year, monthIndex, 0).getDate();
  const todayISO    = new Date().toISOString().split('T')[0];
  const cells       = [];

  // Trailing days of previous month
  for (let i = firstDow - 1; i >= 0; i--) {
    const d = prevDays - i;
    cells.push({ key: `p${d}`, iso: null, dnum: d, otherMonth: true, today: false });
  }
  // Current month days
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({ key: iso, iso, dnum: d, otherMonth: false, today: iso === todayISO });
  }
  // Leading days of next month
  let n = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ key: `n${n}`, iso: null, dnum: n, otherMonth: true, today: false });
    n++;
  }
  return cells;
}

// One match entry inside a calendar day cell
function MatchStrip({ f }) {
  const isLive  = f.status === 'LIVE';
  const tone    = (COMPS[f.comp] || COMPS.EPL).tone;
  const barColor = isLive ? 'var(--danger)' : tone;
  const homeWon = f.score && f.score[0] > f.score[1];
  const awayWon = f.score && f.score[1] > f.score[0];
  const codeColor = (won) => f.score ? (won ? 'var(--paper)' : 'var(--mute)') : 'var(--paper)';
  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', height: 22,
      background: isLive ? 'rgba(239,68,68,.07)' : 'rgba(255,255,255,.015)',
    }}>
      <div style={{ width: 3, background: barColor, flexShrink: 0 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '0 6px', flex: 1, minWidth: 0 }}>
        <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 10, letterSpacing: '.02em', color: codeColor(homeWon), flexShrink: 0 }}>{f.home.code}</span>
        {f.score ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontFamily: 'Archivo Black, sans-serif', fontSize: 10, letterSpacing: '-0.02em', flexShrink: 0 }}>
            <span style={{ color: codeColor(homeWon) }}>{f.score[0]}</span>
            <span style={{ width: 3, height: 1, background: 'var(--mute)' }} />
            <span style={{ color: codeColor(awayWon) }}>{f.score[1]}</span>
          </span>
        ) : (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '.18em', flexShrink: 0 }}>VS</span>
        )}
        <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 10, letterSpacing: '.02em', color: codeColor(awayWon), flexShrink: 0 }}>{f.away.code}</span>
        <span style={{ flex: 1 }} />
        {isLive ? (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--danger)', letterSpacing: '.14em', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
            <span style={{ width: 4, height: 4, background: 'var(--danger)', borderRadius: '50%', animation: 'fkPulse 1.2s infinite' }} />
            {f.live}
          </span>
        ) : !f.score ? (
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '.14em', flexShrink: 0 }}>{f.kickoff}</span>
        ) : null}
      </div>
    </div>
  );
}

// One day cell in the calendar grid
function DayCell({ cell, matches, isWeekend }) {
  const isOther   = cell.otherMonth;
  const isToday   = cell.today;
  const hasMatches = matches.length > 0;
  const visible   = matches.slice(0, 4);
  const overflow  = matches.length - visible.length;

  // Surface hierarchy per spec §8.4
  const bg = isOther
    ? 'transparent'
    : hasMatches
      ? 'var(--ink-2)'
      : isWeekend ? 'rgba(26,111,168,.06)' : 'transparent';

  return (
    <div style={{
      position: 'relative',
      padding: '8px',
      background: bg,
      borderRight: '1px solid var(--rule)',
      borderBottom: '1px solid var(--rule)',
      display: 'flex', flexDirection: 'column', gap: 4,
      minHeight: 0, minWidth: 0,
      opacity: isOther ? 0.35 : 1,
    }}>
      {/* Today cyan top bar */}
      {isToday && <div style={{ position: 'absolute', inset: '0 0 auto 0', height: 2, background: 'var(--cyan)' }} />}

      {/* Header row: label left, day number right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 }}>
        {isToday
          ? <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--cyan)', letterSpacing: '.22em' }}>TODAY</span>
          : hasMatches
            ? <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '.22em' }}>{matches.length} MATCH{matches.length > 1 ? 'ES' : ''}</span>
            : <span />
        }
        <span style={{
          fontFamily: (hasMatches || isToday) ? 'Archivo Black, sans-serif' : 'JetBrains Mono, monospace',
          fontSize: (hasMatches || isToday) ? 15 : 12,
          letterSpacing: (hasMatches || isToday) ? '-0.01em' : '.04em',
          color: isToday ? 'var(--cyan)' : hasMatches ? 'var(--paper)' : 'var(--mute)',
        }}>{cell.dnum}</span>
      </div>

      {/* Match strips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minHeight: 0 }}>
        {visible.map(f => <MatchStrip key={f.id} f={f} />)}
        {overflow > 0 && (
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 8, color: 'var(--mute)', letterSpacing: '.18em', padding: '2px 0 0 6px' }}>+{overflow} MORE</div>
        )}
      </div>
    </div>
  );
}

// Month calendar grid — desktop only
function MonthView({ fixtures, month, year }) {
  const cells = useMemo(() => buildMonthCells(year, month), [year, month]);
  const weeks = useMemo(() => {
    const out = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  const byDate = useMemo(() => {
    const m = new Map();
    for (const f of fixtures) {
      const [fy, fm] = f.date.split('-').map(Number);
      if (fy === year && fm - 1 === month) {
        const key = f.date;
        if (!m.has(key)) m.set(key, []);
        m.get(key).push(f);
      }
    }
    for (const arr of m.values()) arr.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    return m;
  }, [fixtures, year, month]);

  return (
    <>
      {/* Weekday header row — SAT/SUN in --paper, weekdays in --mute */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
        {['MON','TUE','WED','THU','FRI','SAT','SUN'].map((d, i) => (
          <div key={d} style={{
            padding: '10px 12px',
            fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '.22em',
            color: i >= 5 ? 'var(--paper)' : 'var(--mute)',
            borderRight: i < 6 ? '1px solid var(--rule)' : 'none',
          }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid — equal row heights, no overflow */}
      <div style={{
        flex: 1,
        display: 'grid',
        gridTemplateRows: `repeat(${weeks.length}, 1fr)`,
        minHeight: 0,
        borderLeft: '1px solid var(--rule)',
      }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', minHeight: 0 }}>
            {week.map((cell, ci) => (
              <DayCell
                key={cell.key}
                cell={cell}
                matches={cell.iso ? (byDate.get(cell.iso) || []) : []}
                isWeekend={ci >= 5}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ── Date arithmetic (UTC-safe, avoids DST off-by-one) ─────────────────────────
function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const result = new Date(Date.UTC(y, m - 1, d + n));
  return result.toISOString().split('T')[0];
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const [allFixtures, setAllFixtures] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [viewMode,    setViewMode]    = useState('list');  // 'list' | 'week' | 'month'
  const [view,        setView]        = useState('date');  // 'date' | 'comp' (list only)
  const [filter,      setFilter]      = useState('ALL');
  const [selectedDate,setSelectedDate] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  });
  const [calMonth,    setCalMonth]    = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const fetchFixtures = useCallback(async () => {
    const { data } = await supabase
      .from('fixtures')
      .select('*')
      .order('kickoff_at', { ascending: true });
    if (data?.length) setAllFixtures(data.map(normalizeFixture));
    setLoading(false);
  }, []);

  useEffect(() => { fetchFixtures(); }, [fetchFixtures]);

  useEffect(() => {
    const ch = supabase
      .channel('home-fixtures')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fixtures' }, fetchFixtures)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [fetchFixtures]);

  useEffect(() => {
    if (!allFixtures.some(f => f.status === 'LIVE')) return;
    const t = setInterval(fetchFixtures, 30000);
    return () => clearInterval(t);
  }, [allFixtures, fetchFixtures]);

  // ── Calendar-based navigation (not fixture-locked) ───────────────
  // List mode: ±1 day.  Week mode: ±7 days (prev/next whole week).
  const calInputRef    = useRef(null);
  const mobCalInputRef = useRef(null);

  const datePrev = useCallback(() => {
    setSelectedDate(prev => addDays(prev, viewMode === 'week' ? -7 : -1));
  }, [viewMode]);

  const dateNext = useCallback(() => {
    setSelectedDate(prev => addDays(prev, viewMode === 'week' ? 7 : 1));
  }, [viewMode]);

  // ── Derived fixture sets ──────────────────────────────────────────
  // Calculate week dates for WEEK view
  const getWeekDates = useCallback((date) => {
    const d = new Date(date + 'T00:00:00Z');
    const dayOfWeek = d.getUTCDay();
    const weekStart = new Date(d);
    weekStart.setUTCDate(d.getUTCDate() - dayOfWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);

    const start = weekStart.toISOString().split('T')[0];
    const end = weekEnd.toISOString().split('T')[0];
    return { start, end };
  }, []);

  // Human-readable week range label — declared AFTER getWeekDates to avoid TDZ.
  // weekRange referenced getWeekDates in its dep array before getWeekDates was
  // declared (line 619 vs 631), which Rolldown minified to 'b' in TDZ.
  const weekRange = useMemo(() => {
    const { start, end } = getWeekDates(selectedDate);
    const s = new Date(start + 'T12:00:00Z');
    const e = new Date(end   + 'T12:00:00Z');
    const sm = MONTHS_SHORT[s.getUTCMonth()];
    const em = MONTHS_SHORT[e.getUTCMonth()];
    if (sm === em) return `${s.getUTCDate()}–${e.getUTCDate()} ${sm}`;
    return `${s.getUTCDate()} ${sm} – ${e.getUTCDate()} ${em}`;
  }, [selectedDate, getWeekDates]);

  // WEEK mode: all fixtures in the 7-day window containing selectedDate.
  // List mode in COMP grouping: all fixtures across all dates (so you can browse by competition).
  // List mode in DATE grouping: only fixtures on the selected date.
  // viewMode === 'week' MUST be checked first — 'view' defaults to 'date' and would
  // otherwise always match the single-day branch, preventing the week view from ever
  // receiving more than one day of fixtures.
  const baseFixtures = useMemo(() => {
    if (viewMode === 'week') {
      const { start, end } = getWeekDates(selectedDate);
      return allFixtures.filter(f => f.date >= start && f.date <= end);
    }
    if (view === 'comp') return allFixtures;
    return allFixtures.filter(f => f.date === selectedDate);
  }, [allFixtures, viewMode, view, selectedDate, getWeekDates]);

  // Comp-filtered fixtures for list/week views
  const filtered = useMemo(
    () => (filter === 'ALL' ? baseFixtures : baseFixtures.filter(f => f.comp === filter)),
    [baseFixtures, filter],
  );

  // All fixtures in the selected calendar month (unfiltered for chip counts)
  const allMonthFixtures = useMemo(() => {
    const { year, month } = calMonth;
    return allFixtures.filter(f => {
      const [fy, fm] = f.date.split('-').map(Number);
      return fy === year && fm - 1 === month;
    });
  }, [allFixtures, calMonth]);

  // Comp-filtered month fixtures for the calendar display
  const monthFixtures = useMemo(
    () => (filter === 'ALL' ? allMonthFixtures : allMonthFixtures.filter(f => f.comp === filter)),
    [allMonthFixtures, filter],
  );

  // Chip counts and total by context
  const monthCounts = useMemo(() => countByComp(allMonthFixtures), [allMonthFixtures]);
  const dateCounts  = useMemo(() => countByComp(filtered), [filtered]);
  const counts      = viewMode === 'month' ? monthCounts : dateCounts;
  const chipTotal   = viewMode === 'month' ? allMonthFixtures.length : filtered.length;

  const liveCount   = useMemo(() => filtered.filter(f => f.status === 'LIVE').length, [filtered]);
  const availableComps = useMemo(
    () => Object.keys(counts).map(k => COMPS[k] || { code: k, name: k, tone: 'var(--accent)' }),
    [counts],
  );
  const dateGroups = useMemo(() => groupByDate(filtered), [filtered]);
  const compGroups = useMemo(() => groupByComp(filtered), [filtered]);

  // ── Calendar month navigation ─────────────────────────────────────
  const prevMonth = useCallback(() => setCalMonth(cm => {
    const d = new Date(cm.year, cm.month - 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }), []);
  const nextMonth = useCallback(() => setCalMonth(cm => {
    const d = new Date(cm.year, cm.month + 1, 1);
    return { year: d.getFullYear(), month: d.getMonth() };
  }), []);

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

  // ── List body (shared between LIST mode on desktop and all modes on mobile) ──
  const listBody = (mini) => (
    <>
      {filtered.length === 0 && (
        <div style={{ padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em', marginBottom: 10 }}>NO FIXTURES</div>
          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 22, letterSpacing: '-0.02em' }}>Nothing scheduled</div>
        </div>
      )}
      {view === 'date' && dateGroups.map(g => (
        <section key={g.date}>
          <DateBand g={g} mini={mini} />
          {g.fixtures.map(f => mini ? <MobileFixtureRow key={f.id} f={f} /> : <FixtureRow key={f.id} f={f} showComp />)}
        </section>
      ))}
      {view === 'comp' && compGroups.map(g => (
        <section key={g.code}>
          <CompBand comp={g} count={g.fixtures.length} mini={mini} />
          {g.fixtures.map(f => mini ? <MobileFixtureRow key={f.id} f={f} /> : <FixtureRow key={f.id} f={f} />)}
        </section>
      ))}
    </>
  );

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
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>MATCH CENTRE</div>
          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 34, marginTop: 4, letterSpacing: '-0.02em' }}>Scores</div>
        </div>
        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>FIXTURES</div>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 20, marginTop: 2 }}>{filtered.length}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>LIVE NOW</div>
            <div style={{
              fontFamily: 'Archivo Black, sans-serif', fontSize: 20, marginTop: 2,
              color: liveCount > 0 ? 'var(--danger)' : 'var(--mute)',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
            }}>
              {liveCount > 0 && <span style={{ width: 8, height: 8, background: 'var(--danger)', borderRadius: '50%', display: 'inline-block', animation: 'fkPulse 1.2s infinite' }} />}
              {liveCount}
            </div>
          </div>
          {/* Hidden date input — triggered by clicking the DATE display box above */}
          <input
            ref={calInputRef}
            type="date"
            value={selectedDate}
            onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }}
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none', overflow: 'hidden' }}
          />
        </div>
      </div>

      {/* ── Band 2: Controls — Desktop ───────────────────────────── */}
      <div className="hidden lg:flex" style={{
        alignItems: 'center', justifyContent: 'space-between',
        gap: 24, padding: '14px 32px',
        borderBottom: '1px solid var(--rule)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, overflow: 'hidden' }}>
          {/* 3-way view toggle: LIST | WEEK | MONTH */}
          <div style={{ display: 'inline-flex', border: '1px solid var(--rule)', flexShrink: 0 }}>
            {[{ id: 'list', label: 'LIST' }, { id: 'week', label: 'WEEK' }, { id: 'month', label: 'MONTH' }].map((o, i) => (
              <button key={o.id} onClick={() => setViewMode(o.id)} style={{
                padding: '7px 14px',
                background: viewMode === o.id ? 'var(--accent-bg)' : 'transparent',
                color: viewMode === o.id ? 'var(--cyan)' : 'var(--mute)',
                border: 'none',
                borderRight: i < 2 ? '1px solid var(--rule)' : 'none',
                fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                letterSpacing: '.18em', cursor: 'pointer',
              }}>{o.label}</button>
            ))}
          </div>

          {/* DATE | COMPETITION toggle — list mode only */}
          {viewMode === 'list' && (
            <>
              <div style={{ width: 1, height: 20, background: 'var(--rule)', flexShrink: 0 }} />
              <div style={{ display: 'inline-flex', border: '1px solid var(--rule)', flexShrink: 0 }}>
                {[{ id: 'date', label: 'DATE' }, { id: 'comp', label: 'COMPETITION' }].map((o, i) => (
                  <button key={o.id} onClick={() => setView(o.id)} style={{
                    padding: '7px 14px',
                    background: view === o.id ? 'var(--accent-bg)' : 'transparent',
                    color: view === o.id ? 'var(--cyan)' : 'var(--mute)',
                    border: 'none', borderRight: i === 0 ? '1px solid var(--rule)' : 'none',
                    fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                    letterSpacing: '.18em', cursor: 'pointer',
                  }}>{o.label}</button>
                ))}
              </div>
            </>
          )}

          <div style={{ width: 1, height: 20, background: 'var(--rule)', flexShrink: 0 }} />

          {/* Comp filter chips */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', overflowX: 'auto' }}>
            <AllChip active={filter === 'ALL'} count={chipTotal} onClick={() => setFilter('ALL')} />
            {availableComps.map(c => (
              <CompChip key={c.code} comp={c} count={counts[c.code] || 0} active={filter === c.code} onClick={() => setFilter(c.code)} />
            ))}
          </div>
        </div>

        {/* Right pager — calendar-based, not fixture-locked */}
        {viewMode !== 'month' && (
          <div style={{ display: 'inline-flex', alignItems: 'stretch', border: '1px solid var(--rule)', flexShrink: 0 }}>
            <button onClick={datePrev} style={{
              width: 34, height: 34, background: 'transparent', border: 'none',
              borderRight: '1px solid var(--rule)',
              color: 'var(--paper)', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, cursor: 'pointer',
            }}>‹</button>
            <div style={{ padding: '0 14px', height: 34, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', minWidth: 140 }}>
              {viewMode === 'week' ? (
                <>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>WEEK</div>
                  <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 12, letterSpacing: '-0.01em', marginTop: 2 }}>{weekRange}</div>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>DATE</div>
                  <div
                    onClick={() => calInputRef.current?.showPicker?.() || calInputRef.current?.click()}
                    style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 12, letterSpacing: '-0.01em', marginTop: 2, cursor: 'pointer' }}
                  >{selectedDate.split('-').reverse().join('/')}</div>
                </>
              )}
            </div>
            <button onClick={dateNext} style={{
              width: 34, height: 34, background: 'transparent', border: 'none',
              borderLeft: '1px solid var(--rule)',
              color: 'var(--paper)', fontFamily: 'JetBrains Mono, monospace', fontSize: 14, cursor: 'pointer',
            }}>›</button>
          </div>
        )}
        {viewMode === 'month' && (
          <MonthPager year={calMonth.year} monthIndex={calMonth.month} onPrev={prevMonth} onNext={nextMonth} />
        )}
      </div>

      {/* ── Band 2: Controls — Mobile (list only; week/month are desktop-only) ── */}
      <div className="lg:hidden" style={{ padding: '12px 18px 10px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
        {/* Row A: DATE|COMP toggle + date pager + calendar picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ display: 'inline-flex', border: '1px solid var(--rule)', flex: 1 }}>
            {[{ id: 'date', label: 'DATE' }, { id: 'comp', label: 'COMP' }].map((o, i) => (
              <button key={o.id} onClick={() => setView(o.id)} style={{
                flex: 1, padding: '6px 0',
                background: view === o.id ? 'var(--accent-bg)' : 'transparent',
                color: view === o.id ? 'var(--cyan)' : 'var(--mute)',
                border: 'none', borderRight: i === 0 ? '1px solid var(--rule)' : 'none',
                fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '.18em', cursor: 'pointer',
              }}>{o.label}</button>
            ))}
          </div>
          {view === 'date' && (
            <div style={{ display: 'inline-flex', border: '1px solid var(--rule)', flexShrink: 0 }}>
              <button onClick={datePrev} style={{
                width: 28, height: 28, background: 'transparent', border: 'none',
                borderRight: '1px solid var(--rule)',
                color: 'var(--paper)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, cursor: 'pointer',
              }}>‹</button>
              <div
                onClick={() => mobCalInputRef.current?.showPicker?.() || mobCalInputRef.current?.click()}
                style={{ padding: '0 6px', height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, minWidth: 72, cursor: 'pointer' }}
              >
                <div style={{ fontFamily: 'Archivo Black, sans-serif' }}>{selectedDate.split('-').reverse().join('/')}</div>
              </div>
              <button onClick={dateNext} style={{
                width: 28, height: 28, background: 'transparent', border: 'none',
                borderLeft: '1px solid var(--rule)',
                color: 'var(--paper)', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, cursor: 'pointer',
              }}>›</button>
            </div>
          )}
          {/* Hidden mobile date input — triggered by clicking the DATE display box */}
          <input
            ref={mobCalInputRef}
            type="date"
            value={selectedDate}
            onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }}
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1, pointerEvents: 'none', overflow: 'hidden' }}
          />
        </div>
        {/* Row B: comp chips */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
          <AllChip active={filter === 'ALL'} count={filtered.length} onClick={() => setFilter('ALL')} />
          {Object.keys(counts).map(k => COMPS[k] || { code: k, name: k, tone: 'var(--accent)' }).map(c => (
            <CompChip key={c.code} comp={c} count={counts[c.code] || 0} active={filter === c.code} onClick={() => setFilter(c.code)} />
          ))}
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}

      {/* LIST mode */}
      {viewMode === 'list' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div className="hidden lg:block">{listBody(false)}</div>
          <div className="lg:hidden">{listBody(true)}</div>
        </div>
      )}

      {/* WEEK mode — desktop grid, mobile falls back to list */}
      {viewMode === 'week' && (
        <>
          <div className="hidden lg:flex" style={{ flex: 1, minHeight: 0, flexDirection: 'column' }}>
            <WeekView fixtures={filtered} />
          </div>
          <div className="lg:hidden" style={{ flex: 1, overflowY: 'auto' }}>{listBody(true)}</div>
        </>
      )}

      {/* MONTH mode — desktop calendar, mobile falls back to list */}
      {viewMode === 'month' && (
        <>
          <div className="hidden lg:flex" style={{ flex: 1, minHeight: 0, flexDirection: 'column' }}>
            <MonthView fixtures={monthFixtures} month={calMonth.month} year={calMonth.year} />
          </div>
          <div className="lg:hidden" style={{ flex: 1, overflowY: 'auto' }}>{listBody(true)}</div>
        </>
      )}
    </div>
  );
}
