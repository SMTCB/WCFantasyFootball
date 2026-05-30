/* eslint-disable react-refresh/only-export-components */
// Shared chrome primitives for the League Hub.
// All components use inline styles + CSS custom properties to match the design spec exactly.
//
// IMPORTANT: string constants (MONO, DISPLAY, mgrMono, miniBtnStyle) live in
// HubConstants.js (a leaf module with no React). Import constants from there in
// any child panel to avoid Rolldown TDZ crashes (see CLAUDE.md TDZ Rule).

// var (not const) — LeagueScreen imports HubShared directly AND all 6 of its
// child view components (AuctionsView, BetsTabHub, BettingLeaderboardView,
// ChatView, LeagueDetailView, StatsView) also import HubShared. This multi-depth
// pattern causes Rolldown to sometimes evaluate a child module before HubShared,
// putting const MONO/DISPLAY in TDZ. var is hoisted and can never TDZ.
var MONO = "'JetBrains Mono', monospace";
var DISPLAY = "'Archivo Black', sans-serif";
var BODY = "'Archivo', sans-serif";

// 3-char monogram badge. `hue` is the manager's identity colour.
export function MgrTag({ mono = '???', hue = '#8B95A1', size = 18, dim = false }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: size + 10, height: size, padding: '0 4px',
      background: dim ? 'transparent' : `${hue}18`,
      border: `1px solid ${hue}${dim ? '44' : '66'}`,
      color: hue,
      fontFamily: MONO, fontSize: size <= 16 ? 9 : 10,
      letterSpacing: '.12em', fontWeight: 600, lineHeight: 1,
      flexShrink: 0,
    }}>{mono}</span>
  );
}

// Hub topbar — "← BACK · COMPETITIVE CENTER / LEAGUE NAME · N MEMBERS · GWX"
export function HubTopbar({ leagueName = 'LOADING…', memberCount = 0, gw = '—', rightSlot, onBack, isLive = false }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap',
      padding: 'max(12px, 2vw) max(16px, 4vw)', borderBottom: '1px solid var(--rule)',
      background: 'var(--ink)', flexShrink: 0, gap: 12,
    }}>
      <div style={{ minWidth: 0, flex: '1 1 auto' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            fontFamily: MONO, fontSize: 'clamp(8px, 2vw, 10px)', color: 'var(--mute)', letterSpacing: '.2em',
          }}
        >← BACK</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'max(8px, 1.5vw)', marginTop: 6, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cyan)', flexShrink: 0 }} />
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(18px, 5vw, 28px)', letterSpacing: '-0.02em', color: 'var(--paper)', minWidth: 0 }}>
            {leagueName.toUpperCase()}
          </div>
          <span style={{ fontFamily: MONO, fontSize: 'clamp(8px, 2vw, 10px)', color: 'var(--mute)', letterSpacing: '.2em', whiteSpace: 'nowrap' }}>
            {memberCount}M · GW{gw}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'max(10px, 2vw)', flexShrink: 0 }}>
        {rightSlot}
        {isLive && (
          <span style={{ fontFamily: MONO, fontSize: 'clamp(8px, 2vw, 10px)', color: 'var(--danger)', letterSpacing: '.22em', whiteSpace: 'nowrap' }}>● LIVE</span>
        )}
      </div>
    </div>
  );
}

// Manage Squad + Market dual CTA strip
export function HubActionBar({ onManageSquad, onMarket }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
      <button
        onClick={onManageSquad}
        style={{
          padding: '14px 18px', background: 'transparent',
          borderTop: 'none', borderBottom: 'none', borderLeft: 'none',
          borderRight: '1px solid var(--rule)',
          color: 'var(--purple)',
          fontFamily: MONO, fontSize: 12, letterSpacing: '.22em',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}
      >
        <span style={{ width: 14, height: 10, border: '1.5px solid currentColor', display: 'inline-block' }} />
        MANAGE SQUAD
      </button>
      <button
        onClick={onMarket}
        style={{
          padding: '14px 18px', background: 'transparent', border: 'none',
          color: 'var(--positive)',
          fontFamily: MONO, fontSize: 12, letterSpacing: '.22em',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}
      >
        <span style={{ width: 14, height: 10, border: '1.5px solid currentColor', display: 'inline-block' }} />
        MARKET
      </button>
    </div>
  );
}

// 8-tab hub navigation
export function HubTabs({ active = 'leaderboard', onTab, isCommissioner = false, unreadChat = 0, notifyBets = false, notifyAuctions = false }) {
  const tabs = [
    { id: 'leaderboard', label: 'LEADERBOARD' },
    { id: 'recap',       label: 'RECAP' },
    { id: 'frontpage',   label: 'FRONTPAGE' },
    { id: 'bets',        label: 'BETS',     notify: notifyBets },
    { id: 'betting',     label: 'BETTING' },
    { id: 'auctions',    label: 'AUCTIONS', notify: notifyAuctions },
    { id: 'chat',        label: 'CHAT',     count: unreadChat },
    { id: 'stats',       label: 'STATS' },
    ...(isCommissioner ? [{ id: 'admin', label: '⚙ ADMIN', dim: true }] : []),
  ];

  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', padding: '0 max(16px, 3vw)', background: 'var(--ink)', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onTab(t.id)}
          style={{
            padding: 'clamp(10px, 2vw, 14px) clamp(12px, 2.5vw, 22px)', position: 'relative', flexShrink: 0,
            fontFamily: MONO, fontSize: 'clamp(8px, 1.8vw, 11px)', letterSpacing: '.22em',
            color: t.id === active ? 'var(--paper)' : 'var(--mute)',
            fontWeight: t.id === active ? 600 : 400,
            cursor: 'pointer', background: 'none', border: 'none', whiteSpace: 'nowrap',
          }}
        >
          {t.label}
          {!!t.count && (
            <span style={{ marginLeft: 4, color: 'var(--cyan)', fontSize: 'clamp(7px, 1.5vw, 10px)', fontFamily: MONO }}>{t.count}</span>
          )}
          {t.notify && (
            <span style={{
              display: 'inline-block', width: 4, height: 4, borderRadius: '50%',
              background: 'var(--danger)', marginLeft: 4, verticalAlign: 'middle',
            }} />
          )}
          {t.id === active && (
            <span style={{ position: 'absolute', left: '10%', right: '10%', bottom: -1, height: 2, background: 'var(--cyan)' }} />
          )}
        </button>
      ))}
    </div>
  );
}

// Rank trend chip (▲2 / ▼1 / =)
export function TrendPill({ trend = 0 }) {
  if (trend === 0) return <span style={{ color: 'var(--mute)', fontFamily: MONO, fontSize: 10 }}>=</span>;
  const up = trend > 0;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
      color: up ? 'var(--positive)' : 'var(--danger)',
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 8 }}>{up ? '▲' : '▼'}</span>
      {Math.abs(trend)}
    </span>
  );
}

// W/D/L form dots row
export function FormDots({ form = [] }) {
  const tone = { W: 'var(--positive)', D: 'var(--mute)', L: 'var(--danger)' };
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {form.map((r, i) => (
        <span key={i} style={{
          width: 14, height: 14,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: `${tone[r] || 'var(--mute)'}22`,
          border: `1px solid ${tone[r] || 'var(--mute)'}55`,
          fontFamily: MONO, fontSize: 8, color: tone[r] || 'var(--mute)', fontWeight: 600,
        }}>{r}</span>
      ))}
    </span>
  );
}

// Tiny sparkline SVG
export function Spark({ data = [], w = 88, h = 22, tone = 'var(--cyan)', zero = true }) {
  if (!data.length) return null;
  const max = Math.max(...data.map(v => Math.abs(v)), 1);
  const pts = data.map((v, i) => {
    const x = data.length > 1 ? (i / (data.length - 1)) * w : w / 2;
    const y = h / 2 - (v / max) * (h / 2 - 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ flexShrink: 0 }}>
      {zero && <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="var(--rule)" strokeDasharray="2,2" />}
      <polyline points={pts} fill="none" stroke={tone} strokeWidth="1.5" />
      {data.map((v, i) => {
        const x = data.length > 1 ? (i / (data.length - 1)) * w : w / 2;
        const y = h / 2 - (v / max) * (h / 2 - 2);
        return <circle key={i} cx={x} cy={y} r="1.5" fill={tone} />;
      })}
    </svg>
  );
}

// Section header with 3px tone bar
export function HubSectionLabel({ label, sub, tone = 'var(--cyan)', right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 20px', borderBottom: '1px solid var(--rule)',
      background: 'var(--ink-2)', flexShrink: 0,
    }}>
      <span style={{ width: 3, height: 14, background: tone, flexShrink: 0 }} />
      <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--paper)', letterSpacing: '.22em' }}>{label}</span>
      {sub && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.18em' }}>· {sub}</span>}
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// Mini button style helper
export const miniBtnStyle = (color) => ({
  background: 'transparent', border: `1px solid ${color}55`, color,
  padding: '4px 8px', fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
  cursor: 'pointer',
});

// Manager identity helpers — deterministic hue + 3-char monogram from username
var MANAGER_HUES = [
  '#00B4D8','#E0A800','#A855F7','#22C55E','#F59E0B',
  '#34D399','#7DD3FC','#FB7185','#FCD34D','#C4B5FD','#67E8F9',
];
export function mgrHue(str = '') {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return MANAGER_HUES[h % MANAGER_HUES.length];
}
export const mgrMono = (username = '') => username.substring(0, 3).toUpperCase() || '???';

// ─── Mobile components ────────────────────────────────────────────────────────

// Mobile hub league header — replaces HubTopbar on mobile viewports.
export function HubLeagueHeader({ leagueName = 'LOADING…', memberCount = 0, gw = '—', backable = false, backTitle = '', onBack, rightSlot }) {
  return (
    <div style={{ padding: '10px max(18px, 4vw) 8px', borderBottom: '1px solid var(--rule)', background: 'var(--ink)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {backable ? (
          <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>← BACK</button>
        ) : (
          <>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>COMPETITIVE</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>·</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>{memberCount}M</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em', marginLeft: 'auto' }}>GW {gw}</span>
          </>
        )}
        {rightSlot && <div style={{ marginLeft: 'auto' }}>{rightSlot}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--cyan)', flexShrink: 0 }} />
        <span style={{ fontFamily: DISPLAY, fontSize: backable ? 18 : 22, letterSpacing: '-0.02em', color: 'var(--paper)' }}>
          {backable ? backTitle : leagueName.toUpperCase()}
        </span>
      </div>
    </div>
  );
}

// Mobile horizontal-scroll hub tab pills — replaces HubTabs on mobile viewports.
export function HubTabPills({ active = 'leaderboard', onTab, isCommissioner = false, unreadChat = 0, notifyBets = false, notifyAuctions = false }) {
  const tabs = [
    { id: 'leaderboard', label: 'BOARD' },
    { id: 'recap',       label: 'RECAP' },
    { id: 'frontpage',   label: 'FRONTPAGE' },
    { id: 'bets',        label: 'BETS',     notify: notifyBets },
    { id: 'betting',     label: 'BETTING' },
    { id: 'auctions',    label: 'AUCTIONS', notify: notifyAuctions },
    { id: 'chat',        label: 'CHAT',     count: unreadChat },
    { id: 'stats',       label: 'STATS' },
    ...(isCommissioner ? [{ id: 'admin', label: 'ADMIN' }] : []),
  ];
  return (
    <div style={{ display: 'flex', gap: 6, padding: '10px 18px', overflowX: 'auto', borderBottom: '1px solid var(--rule)', background: 'var(--ink)', flexShrink: 0, scrollbarWidth: 'none' }}>
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <button key={t.id} onClick={() => onTab(t.id)} style={{
            flex: '0 0 auto', padding: '7px 12px', cursor: 'pointer', whiteSpace: 'nowrap',
            background: isActive ? 'var(--cyan)' : 'transparent',
            border: isActive ? '1px solid var(--cyan)' : '1px solid var(--rule)',
            color: isActive ? 'var(--ink)' : 'var(--mute)',
            fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', fontWeight: 600,
            display: 'inline-flex', alignItems: 'center', gap: 5,
          }}>
            {t.label}
            {t.notify && !isActive && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />}
            {!!t.count && !isActive && <span style={{ color: 'var(--cyan)', fontSize: 9 }}>{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Mobile 3-dot form indicator — compact subset of FormDots for tight rows.
export function MobFormDots({ form = [], max = 3 }) {
  const tone = { W: 'var(--positive)', D: 'var(--mute)', L: 'var(--danger)' };
  return (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {form.slice(0, max).map((f, i) => (
        <span key={i} style={{
          width: 12, height: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: `${tone[f] || 'var(--mute)'}22`, border: `1px solid ${tone[f] || 'var(--mute)'}55`,
          fontFamily: MONO, fontSize: 8, color: tone[f] || 'var(--mute)', fontWeight: 600,
        }}>{f}</span>
      ))}
    </span>
  );
}

// Mobile slim section header — no full-width background, used inside scrolling lists.
export function MobSection({ label, sub, tone = 'var(--cyan)', right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px 6px' }}>
      <span style={{ width: 3, height: 12, background: tone, flexShrink: 0 }} />
      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--paper)', letterSpacing: '.22em' }}>{label}</span>
      {sub && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.16em' }}>· {sub}</span>}
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

