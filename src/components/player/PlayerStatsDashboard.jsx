import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePlayerFullStats, buildBreakdownItems } from '../../hooks/usePlayerFullStats';
import { POS_TONE } from '../../lib/formations';

const MO = { fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase', letterSpacing: '.14em' };

const STATUS_C = { fit: 'var(--positive)', doubt: 'var(--gold)', returning: 'var(--gold)', out: 'var(--danger)' };
const STATUS_L = { fit: 'AVAILABLE', doubt: 'DOUBTFUL', returning: 'RETURNING', out: 'INJURED' };

function fmtPts(pts) {
  const n = Math.round(pts * 100) / 100;
  return `${n > 0 ? '+' : ''}${n}`;
}

function PosBadge({ pos, small }) {
  const c = POS_TONE[pos] || 'var(--mute)';
  return (
    <div style={{
      flexShrink: 0, width: small ? 36 : 44, height: small ? 20 : 24,
      border: `1.5px solid ${c}`, color: c,
      fontFamily: 'Archivo Black, sans-serif', fontSize: small ? 9 : 11, letterSpacing: '.04em',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{pos}</div>
  );
}

function StatusDot({ status }) {
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: STATUS_C[status] || 'var(--mute)', flexShrink: 0 }} />;
}

function MiniChart({ history }) {
  if (!history?.length) return <div style={{ ...MO, fontSize: 9, color: 'var(--mute)' }}>— NO DATA YET —</div>;
  const max = Math.max(...history.map(r => r.totalPts), 1);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 44 }}>
      {history.map((r, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
          <div style={{
            width: '100%', height: Math.max(16, (r.totalPts / max) * 32),
            background: r.totalPts >= 10 ? 'var(--positive)' : r.totalPts >= 5 ? 'var(--cyan)' : 'var(--mute)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ ...MO, fontSize: 8, color: 'var(--ink)', letterSpacing: 0 }}>{r.totalPts}</span>
          </div>
          <div style={{ ...MO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.06em' }}>{r.gw}</div>
        </div>
      ))}
    </div>
  );
}

function PosStatsStrip({ position, posStats, compact }) {
  const posC = POS_TONE[position] || 'var(--mute)';
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
      <div style={{ flex: '0 0 88px', padding: compact ? '7px 12px' : '10px 16px', borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
        <div style={{ ...MO, fontSize: 7, color: posC, letterSpacing: '.22em' }}>POS STATS</div>
        <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: compact ? 11 : 14, color: posC }}>{position}</div>
      </div>
      {posStats.map((s, i) => (
        <div key={i} style={{ flex: 1, padding: compact ? '7px 10px' : '10px 14px', borderRight: i < posStats.length - 1 ? '1px solid var(--rule)' : 'none' }}>
          <div style={{ ...MO, fontSize: 7, color: 'var(--mute)', marginBottom: compact ? 2 : 3, letterSpacing: '.18em' }}>{s.label}</div>
          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: compact ? 14 : 18, letterSpacing: '-0.02em', color: 'var(--paper)' }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function KeyStatsStrip({ stats, compact }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
      {stats.map((s, i) => (
        <div key={i} style={{ flex: 1, padding: compact ? '8px 6px' : '10px 14px', textAlign: compact ? 'center' : 'left', borderRight: i < stats.length - 1 ? '1px solid var(--rule)' : 'none' }}>
          <div style={{ ...MO, fontSize: compact ? 7 : 8, color: 'var(--mute)', marginBottom: compact ? 2 : 3 }}>{s.label}</div>
          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: compact ? 17 : 19, letterSpacing: '-0.02em', color: s.color || 'var(--paper)' }}>{s.value}</div>
        </div>
      ))}
    </div>
  );
}

function GWRow({ r, selected, onClick, columns, fontSize }) {
  return (
    <div onClick={onClick} style={{
      display: 'grid', gridTemplateColumns: columns,
      padding: '10px 16px', borderBottom: '1px solid var(--rule)',
      cursor: 'pointer', alignItems: 'center',
      background: selected ? 'rgba(0,180,216,.07)' : 'transparent',
      borderLeft: selected ? '2px solid var(--cyan)' : '2px solid transparent',
    }}>
      <span style={{ ...MO, fontSize: 9, color: 'var(--mute)' }}>{r.gw}</span>
      <span style={{ fontFamily: 'Archivo, sans-serif', fontSize }}>
        {r.opponent}{r.isHome ? ' (H)' : ' (A)'}
      </span>
      <span style={{ ...MO, fontSize: 9, color: 'var(--mute)' }}>{Math.round(r.minutes_played || 0)}'</span>
      <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: fontSize + 2, color: r.goals > 0 ? 'var(--positive)' : 'var(--mute)' }}>{r.goals || 0}</span>
      <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: fontSize + 2, color: r.assists > 0 ? 'var(--cyan)' : 'var(--mute)' }}>{r.assists || 0}</span>
      <span style={{ textAlign: 'right', fontFamily: 'Archivo Black, sans-serif', fontSize: fontSize + 4, color: 'var(--positive)' }}>{r.totalPts}</span>
    </div>
  );
}

function BreakdownItems({ sel, items }) {
  return (
    <>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--rule)' }}>
          <span style={{ ...MO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.1em' }}>{item.label}</span>
          <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 16, letterSpacing: '-0.01em', color: item.kind === 'pos' ? 'var(--positive)' : item.kind === 'bonus' ? 'var(--gold)' : 'var(--danger)' }}>
            {fmtPts(item.pts)}
          </span>
        </div>
      ))}
      {!items.length && (
        <div style={{ ...MO, fontSize: 9, color: 'var(--mute)', padding: '12px 0' }}>NO SCORING DATA FOR THIS GW</div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', padding: '11px 0 4px', marginTop: 4, borderTop: '2px solid var(--rule)' }}>
        <div>
          <span style={{ ...MO, fontSize: 10, color: 'var(--paper)' }}>TOTAL</span>
          <div style={{ ...MO, fontSize: 7, color: 'var(--mute)', marginTop: 2, letterSpacing: '.16em' }}>ROUNDED TO NEAREST PT</div>
        </div>
        <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 28, color: 'var(--positive)', letterSpacing: '-0.02em' }}>~{sel.totalPts}</span>
      </div>
    </>
  );
}

export default function PlayerStatsDashboard({ player, ownershipPct, onClose }) {
  const { gwHistory, season, posStats, loading } = usePlayerFullStats(player);
  const [sel, setSel] = useState(null);
  const [mobileTab, setMobileTab] = useState('history');

  useEffect(() => {
    if (gwHistory.length && !sel) setSel(gwHistory[0]);
  }, [gwHistory, sel]);

  if (!player) return null;

  const status = player.intel?.status || 'fit';
  const breakdownItems = sel ? buildBreakdownItems(sel) : [];

  const keyStatsDesktop = [
    { label: 'APPS', value: season.apps },
    { label: 'GOALS', value: season.goals, color: 'var(--positive)' },
    { label: 'ASSISTS', value: season.assists, color: 'var(--cyan)' },
    { label: 'TOTAL PTS', value: season.totalPts },
    { label: 'AVG / GW', value: season.apps > 0 ? season.avgPts.toFixed(1) : '—' },
    { label: 'OWNED BY', value: `${ownershipPct ?? 0}%`, color: 'var(--mute)' },
  ];

  const keyStatsMobile = [
    { label: 'APPS', value: season.apps },
    { label: 'G', value: season.goals, color: 'var(--positive)' },
    { label: 'A', value: season.assists, color: 'var(--cyan)' },
    { label: 'PTS', value: season.totalPts },
    { label: 'AVG', value: season.apps > 0 ? season.avgPts.toFixed(1) : '—' },
  ];

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center" style={{ background: 'rgba(6,7,10,.86)' }} onClick={onClose}>

      {/* ── DESKTOP ───────────────────────────────────────────── */}
      <div
        className="hidden lg:flex lg:flex-col"
        onClick={e => e.stopPropagation()}
        style={{ width: 900, maxHeight: '88vh', background: 'var(--ink)', border: '1px solid var(--rule)', overflow: 'hidden', color: 'var(--paper)', fontFamily: 'Archivo, sans-serif' }}
      >
        {/* header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 20px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
          <PosBadge pos={player.position} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 18, letterSpacing: '-0.01em', textTransform: 'uppercase' }}>{player.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <StatusDot status={status} />
              <span style={{ ...MO, fontSize: 9, color: 'var(--mute)' }}>{player.club}</span>
              <span style={{ ...MO, fontSize: 9, color: STATUS_C[status] }}>· {STATUS_L[status]}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 18 }}>€{Number(player.price || 0).toFixed(1)}M</div>
            <div style={{ ...MO, fontSize: 8, color: 'var(--mute)', marginTop: 2 }}>PRICE</div>
          </div>
          <button onClick={onClose} style={{ width: 24, height: 24, border: '1px solid var(--rule)', color: 'var(--mute)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, background: 'transparent', flexShrink: 0 }}>✕</button>
        </div>

        {/* key stats */}
        <KeyStatsStrip stats={keyStatsDesktop} />

        {/* position stats */}
        <PosStatsStrip position={player.position} posStats={posStats} />

        {/* body */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
          {/* left — GW history */}
          <div style={{ flex: '0 0 55%', borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ ...MO, fontSize: 9, color: 'var(--mute)', padding: '8px 16px', borderBottom: '1px solid var(--rule)', flexShrink: 0, letterSpacing: '.2em' }}>GW HISTORY</div>
            <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 54px 36px 36px 50px', padding: '6px 16px', borderBottom: '1px solid var(--rule)', ...MO, fontSize: 8, color: 'var(--mute)', flexShrink: 0 }}>
              <span>GW</span><span>FIXTURE</span><span>MIN</span>
              <span style={{ color: 'var(--positive)' }}>G</span>
              <span style={{ color: 'var(--cyan)' }}>A</span>
              <span style={{ textAlign: 'right' }}>PTS</span>
            </div>
            <div style={{ flex: 1, overflow: 'auto' }}>
              {loading && <div style={{ padding: '18px 16px', ...MO, fontSize: 9, color: 'var(--mute)' }}>LOADING…</div>}
              {!loading && gwHistory.map(r => (
                <GWRow key={r.fixtureId} r={r} selected={sel === r} onClick={() => setSel(r)} columns="44px 1fr 54px 36px 36px 50px" fontSize={12} />
              ))}
              {!loading && !gwHistory.length && (
                <div style={{ padding: '18px 16px', ...MO, fontSize: 9, color: 'var(--mute)' }}>— NO GAMEWEEKS PLAYED —</div>
              )}
            </div>
            <div style={{ borderTop: '1px solid var(--rule)', padding: '10px 16px', flexShrink: 0 }}>
              <div style={{ ...MO, fontSize: 8, color: 'var(--mute)', marginBottom: 8, letterSpacing: '.2em' }}>POINTS HISTORY</div>
              <MiniChart history={gwHistory} />
            </div>
          </div>

          {/* right — breakdown */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
              <span style={{ ...MO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.2em' }}>POINT BREAKDOWN</span>
              {sel ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ ...MO, fontSize: 8, color: 'var(--cyan)', background: 'rgba(0,180,216,.1)', border: '1px solid rgba(0,180,216,.25)', padding: '3px 8px', letterSpacing: '.12em' }}>{sel.gw}</div>
                  <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 11, color: 'var(--mute)' }}>{sel.opponent}{sel.isHome ? ' (H)' : ' (A)'}</span>
                </div>
              ) : (
                <span style={{ ...MO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.12em' }}>SELECT A ROW ←</span>
              )}
            </div>
            {sel ? (
              <div style={{ flex: 1, padding: '12px 16px', overflow: 'auto' }}>
                <BreakdownItems sel={sel} items={breakdownItems} />
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: .5 }}>
                <div style={{ ...MO, fontSize: 10, color: 'var(--mute)' }}>TAP ANY GW ROW</div>
                <div style={{ ...MO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em' }}>TO SEE POINT BREAKDOWN</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── MOBILE ────────────────────────────────────────────── */}
      <div
        className="flex lg:hidden"
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', height: '100%', background: 'var(--ink)', color: 'var(--paper)', flexDirection: 'column', fontFamily: 'Archivo, sans-serif', overflow: 'hidden' }}
      >
        {/* back nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
          <div onClick={onClose} style={{ ...MO, fontSize: 9, color: 'var(--cyan)', cursor: 'pointer' }}>← BACK</div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <PosBadge pos={player.position} small />
            <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 15, letterSpacing: '-0.01em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
          </div>
          <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, flexShrink: 0 }}>€{Number(player.price || 0).toFixed(1)}M</span>
        </div>
        {/* meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 16px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
          <StatusDot status={status} />
          <span style={{ ...MO, fontSize: 8, color: 'var(--mute)' }}>{player.club}</span>
          <span style={{ ...MO, fontSize: 8, color: STATUS_C[status] }}>· {STATUS_L[status]}</span>
          <span style={{ ...MO, fontSize: 8, color: 'var(--mute)', marginLeft: 'auto' }}>OWNED {ownershipPct ?? 0}%</span>
        </div>
        {/* stats strip */}
        <KeyStatsStrip stats={keyStatsMobile} compact />
        {/* position stats */}
        <PosStatsStrip position={player.position} posStats={posStats} compact />
        {/* tabs */}
        <div style={{ display: 'flex', gap: 20, padding: '9px 16px 0', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
          {['HISTORY', 'BREAKDOWN'].map(t => (
            <div key={t} onClick={() => setMobileTab(t.toLowerCase())} style={{ ...MO, fontSize: 10, paddingBottom: 7, cursor: 'pointer', position: 'relative', color: mobileTab === t.toLowerCase() ? 'var(--paper)' : 'var(--mute)' }}>
              {t}
              {mobileTab === t.toLowerCase() && <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2, background: 'var(--cyan)' }} />}
            </div>
          ))}
        </div>
        {/* tab content */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {mobileTab === 'history' && <>
            <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr 44px 28px 28px 38px', padding: '6px 16px', borderBottom: '1px solid var(--rule)', position: 'sticky', top: 0, background: 'var(--ink)', ...MO, fontSize: 8, color: 'var(--mute)' }}>
              <span>GW</span><span>FIXTURE</span><span>MIN</span>
              <span style={{ color: 'var(--positive)' }}>G</span><span style={{ color: 'var(--cyan)' }}>A</span>
              <span style={{ textAlign: 'right' }}>PTS</span>
            </div>
            {loading && <div style={{ padding: '18px 16px', ...MO, fontSize: 9, color: 'var(--mute)' }}>LOADING…</div>}
            {!loading && gwHistory.map(r => (
              <GWRow key={r.fixtureId} r={r} selected={sel === r} onClick={() => { setSel(r); setMobileTab('breakdown'); }} columns="34px 1fr 44px 28px 28px 38px" fontSize={11} />
            ))}
            {!loading && !gwHistory.length && (
              <div style={{ padding: '18px 16px', ...MO, fontSize: 9, color: 'var(--mute)' }}>— NO GAMEWEEKS PLAYED —</div>
            )}
            <div style={{ padding: '12px 16px' }}>
              <div style={{ ...MO, fontSize: 8, color: 'var(--mute)', marginBottom: 8, letterSpacing: '.2em' }}>POINTS HISTORY</div>
              <MiniChart history={gwHistory} />
            </div>
          </>}
          {mobileTab === 'breakdown' && (
            <div style={{ padding: '12px 16px' }}>
              {sel ? <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ ...MO, fontSize: 8, color: 'var(--cyan)', background: 'rgba(0,180,216,.1)', border: '1px solid rgba(0,180,216,.25)', padding: '3px 8px' }}>{sel.gw}</div>
                  <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 11, color: 'var(--mute)' }}>{sel.opponent}{sel.isHome ? ' (H)' : ' (A)'} · {Math.round(sel.minutes_played || 0)}'</span>
                </div>
                <BreakdownItems sel={sel} items={breakdownItems} />
              </> : (
                <div style={{ padding: '20px 0', ...MO, fontSize: 10, color: 'var(--mute)' }}>GO TO HISTORY AND TAP A GAMEWEEK</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
