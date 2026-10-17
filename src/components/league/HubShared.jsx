/* eslint-disable react-refresh/only-export-components */
import { useNavigate } from 'react-router-dom';
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

// LEAGUE ACTIVITY -> League activity
const sentence = (t) => (typeof t === 'string' ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t);

// Shared light tab row (redesign Wave 1) — underline tabs, 44px tap target, 12px+ labels.
function HubTabRow({ tabs, active, onTab }) {
  return (
    <div role="tablist" style={{ display: 'flex', borderBottom: '1px solid var(--rule)', padding: '0 max(12px, 3vw)', background: 'var(--card)', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden' }}>
      {tabs.map(t => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onTab(t.id)}
            style={{
              minHeight: 'var(--tap)', padding: '0 14px', position: 'relative', flexShrink: 0,
              fontFamily: 'inherit', fontSize: "14px", fontWeight: on ? 700 : 500,
              color: on ? 'var(--paper)' : 'var(--mute)',
              cursor: 'pointer', background: 'none', border: 'none', whiteSpace: 'nowrap',
            }}
          >
            {t.label}
            {t.notify && (
              <span aria-label="new" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--crit)', marginLeft: 5, verticalAlign: 'middle' }} />
            )}
            {on && <span style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 3, borderRadius: 2, background: 'var(--accent)' }} />}
          </button>
        );
      })}
    </div>
  );
}

function HubHeaderBar({ title, sub, cupPhase, leagueMode, isLive, rightSlot, onBack, backLabel, compact }) {
  const pill = { fontSize: "12px", fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0, whiteSpace: 'nowrap' };
  return (
    <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', borderLeft: '4px solid var(--accent)', padding: compact ? '10px max(14px, 4vw)' : '14px max(16px, 3vw)', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0, flex: '1 1 auto' }}>
          {onBack && (
            <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, minHeight: 24, cursor: 'pointer', fontSize: "13px", color: 'var(--mute)' }}>{backLabel || '← Back'}</button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
            <h1 style={{ margin: 0, fontFamily: DISPLAY, fontSize: compact ? "20px" : "26px", lineHeight: 1.15, letterSpacing: '-0.01em', color: 'var(--paper)', minWidth: 0 }}>{title}</h1>
            {cupPhase && cupPhase !== 'pre_cup' && <span style={pill}>{cupPhase.replace(/_/g, ' ')}</span>}
            {leagueMode === 'draft_h2h' && <span style={pill}>Draft · H2H</span>}
            {isLive && <span style={{ ...pill, background: 'var(--crit-soft)', color: 'var(--crit)' }}>● Live</span>}
          </div>
          {sub && <div className="num" style={{ fontSize: "13px", color: 'var(--mute)', marginTop: 2 }}>{sub}</div>}
        </div>
        {rightSlot && <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>{rightSlot}</div>}
      </div>
    </div>
  );
}

// Hub topbar (desktop) — league name, members, gameweek.
export function HubTopbar({ leagueName = 'Loading…', memberCount = 0, gw = '—', rightSlot, onBack, isLive = false, cupPhase, leagueMode }) {
  return <HubHeaderBar title={leagueName} sub={`${memberCount} members · GW${gw}`} cupPhase={cupPhase} leagueMode={leagueMode} isLive={isLive} rightSlot={rightSlot} onBack={onBack} />;
}

// League hub navigation — Chat and Frontpage live in Clubhouse (CH-5); Bets restored at league level (DATA-5).
// squad / market / live are separate routes; callers navigate when one is picked.
export const ROUTE_TABS = ['squad', 'market', 'live'];

function hubTabList({ isCommissioner, notifyBets, notifyTrading, h2hEnabled, isDraftLeague }) {
  return [
    { id: 'leaderboard', label: 'Standings' },
    { id: 'squad',       label: 'Squad' },
    { id: 'market',      label: 'Market' },
    { id: 'live',        label: 'Live' },
    ...(h2hEnabled ? [{ id: 'h2h', label: 'H2H' }] : []),
    { id: 'recap',       label: 'Recap' },
    { id: 'market_report', label: 'Market report' },
    { id: 'bets',        label: 'Bets',    notify: notifyBets },
    { id: 'betting',     label: 'Betting' },
    // TRADING tab (auctions + trade proposals) is draft-only — Classic leagues use
    // shared player pools so exclusive ownership transfers don't apply.
    ...(isDraftLeague ? [{ id: 'trading', label: 'Trading', notify: notifyTrading }] : []),
    { id: 'stats',       label: 'Stats' },
    ...(isCommissioner ? [{ id: 'admin', label: 'Admin' }] : []),
  ];
}

export function HubTabs({ active = 'leaderboard', onTab, isCommissioner = false, notifyBets = false, notifyTrading = false, h2hEnabled = false, isDraftLeague = false }) {
  return <HubTabRow tabs={hubTabList({ isCommissioner, notifyBets, notifyTrading, h2hEnabled, isDraftLeague })} active={active} onTab={onTab} />;
}

// Same tab row for the Squad / Market / Live routes, scoped to one league.
export function LeagueRouteTabs({ active, leagueId }) {
  const navigate = useNavigate();
  if (!leagueId) return null;
  const go = (t) => {
    if (t === active) return;
    if (ROUTE_TABS.includes(t)) navigate(`/${t}?leagueId=${leagueId}`);
    else navigate(`/league/${leagueId}?tab=${t}`);
  };
  return <HubTabRow tabs={hubTabList({})} active={active} onTab={go} />;
}

// Rank trend chip (▲2 / ▼1 / =)
export function TrendPill({ trend = 0 }) {
  if (trend === 0) return <span style={{ color: 'var(--mute)', fontFamily: MONO, fontSize: 'var(--fs-micro)' }}>=</span>;
  const up = trend > 0;
  return (
    <span style={{
      fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.12em',
      color: up ? 'var(--positive)' : 'var(--danger)',
      display: 'inline-flex', alignItems: 'center', gap: 3,
    }}>
      <span style={{ fontFamily: DISPLAY, fontSize: 'var(--fs-micro)' }}>{up ? '▲' : '▼'}</span>
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
          fontFamily: MONO, fontSize: 'var(--fs-micro)', color: tone[r] || 'var(--mute)', fontWeight: 600,
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
export function HubSectionLabel({ label, sub, tone = 'var(--accent)', right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, minHeight: 'var(--tap)',
      padding: '8px 20px', borderBottom: '1px solid var(--rule)',
      background: 'var(--card)', flexShrink: 0,
    }}>
      <span aria-hidden style={{ width: 4, height: 16, borderRadius: 2, background: tone, flexShrink: 0 }} />
      <h2 style={{ margin: 0, fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--paper)' }}>{sentence(label)}</h2>
      {sub && <span style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>· {sentence(sub)}</span>}
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

// Mini button style helper
export const miniBtnStyle = (color) => ({
  background: 'transparent', border: `1px solid ${color}55`, color,
  padding: '4px 8px', fontFamily: MONO, fontSize: 'var(--fs-micro)', letterSpacing: '.18em',
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
export function HubLeagueHeader({ leagueName = 'Loading…', memberCount = 0, gw = '—', backable = false, backTitle = '', onBack, rightSlot, cupPhase, leagueMode }) {
  return (
    <HubHeaderBar
      compact
      title={backable ? backTitle : leagueName}
      sub={backable ? null : `${memberCount} members · GW${gw}`}
      onBack={backable ? onBack : null}
      cupPhase={cupPhase}
      leagueMode={leagueMode}
      rightSlot={rightSlot}
    />
  );
}

// Mobile hub tabs — same row as desktop.
export function HubTabPills(props) {
  return <HubTabs {...props} />;
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
          fontFamily: MONO, fontSize: 'var(--fs-micro)', color: tone[f] || 'var(--mute)', fontWeight: 600,
        }}>{f}</span>
      ))}
    </span>
  );
}

// Mobile slim section header — no full-width background, used inside scrolling lists.
export function MobSection({ label, sub, tone = 'var(--accent)', right }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 16px 8px' }}>
      <span aria-hidden style={{ width: 4, height: 14, borderRadius: 2, background: tone, flexShrink: 0 }} />
      <h2 style={{ margin: 0, fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--paper)' }}>{sentence(label)}</h2>
      {sub && <span style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>· {sentence(sub)}</span>}
      <span style={{ flex: 1 }} />
      {right}
    </div>
  );
}

