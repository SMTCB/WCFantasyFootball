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
var MONO = "Archivo, sans-serif";
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

// Shared light tab row (redesign Wave 1) — underline tabs, 46px tap target, 15px labels.
// A tab with id '|' renders as a thin divider (Standings Squad Market Live | Recap Bets Stats).
function HubTabRow({ tabs, active, onTab }) {
  return (
    <div role="tablist" style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--rule)', padding: '0 max(12px, 3vw)', background: 'var(--card)', flexShrink: 0, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none' }}>
      {tabs.map(t => {
        if (t.id === '|') return <span key="div" aria-hidden="true" style={{ width: 1, background: 'var(--rule)', margin: '10px 6px', flexShrink: 0 }} />;
        const on = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onTab(t.id)}
            style={{
              minHeight: 46, padding: '0 12px', position: 'relative', flexShrink: 0,
              fontFamily: 'inherit', fontSize: '15px', fontWeight: 600,
              color: on ? 'var(--paper)' : 'var(--mute)',
              cursor: 'pointer', background: 'none', border: 'none', whiteSpace: 'nowrap',
            }}
          >
            {t.label}
            {t.notify && (
              <span aria-label="new" style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--crit)', marginLeft: 5, verticalAlign: 'middle' }} />
            )}
            {on && <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 3, borderRadius: 2, background: 'var(--accent)' }} />}
          </button>
        );
      })}
    </div>
  );
}

const crestInitials = (title = '') => {
  const w = title.replace(/[^\p{L}\p{N} ]/gu, '').trim().split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] || '?').slice(0, 2)).toUpperCase();
};

const chipStyle = (tone) => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '13px', fontWeight: 600, padding: '3px 10px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0,
  background: tone === 'accent' ? 'var(--accent-soft)' : tone === 'crit' ? 'var(--crit-soft)' : 'var(--elev)',
  color: tone === 'accent' ? 'var(--accent)' : tone === 'crit' ? 'var(--crit)' : 'var(--paper)',
});

// Competition header (redesign): crest with sport marker, title + chips, your position, then the actions.
// `stats` = [{ value, label }]; shown right of the title on desktop and as one line under it on mobile.
function HubHeaderBar({ title, chips = [], stats = [], cupPhase, leagueMode, isLive, rightSlot, onBack, backLabel, compact }) {
  const all = [
    ...(leagueMode === 'draft_h2h' ? [{ label: 'Draft · H2H' }] : []),
    ...(cupPhase && cupPhase !== 'pre_cup' ? [{ label: cupPhase.replace(/_/g, ' ') }] : []),
    ...chips,
    ...(isLive ? [{ label: '● Live', tone: 'crit' }] : []),
  ];
  return (
    <div style={{ background: 'var(--card)', padding: compact ? '12px max(14px, 4vw) 8px' : '14px max(16px, 3vw)', flexShrink: 0 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: 'none', border: 'none', padding: 0, minHeight: 24, marginBottom: 6, cursor: 'pointer', fontSize: '13px', color: 'var(--mute)' }}>{backLabel || '← Back'}</button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div aria-hidden="true" style={{ position: 'relative', width: 46, height: 46, borderRadius: 12, background: 'var(--navy)', color: 'var(--on-navy)', display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontSize: '16px', flexShrink: 0, marginLeft: 4 }}>
          {crestInitials(title)}
          <span style={{ position: 'absolute', left: -4, top: 10, bottom: 10, width: 4, borderRadius: 2, background: 'var(--sport-marker, var(--accent))' }} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 style={{ margin: 0, fontFamily: DISPLAY, fontSize: '20px', lineHeight: 1.2, letterSpacing: '-0.01em', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
          {all.length > 0 && (
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              {all.map((c, i) => <span key={i} style={chipStyle(c.tone)}>{c.label}</span>)}
            </div>
          )}
        </div>
        {stats.length > 0 && (
          <div className="hidden md:flex" style={{ gap: 18, textAlign: 'right', flexShrink: 0 }}>
            {stats.map(st => (
              <div key={st.label}>
                <b className="num" style={{ display: 'block', fontFamily: DISPLAY, fontWeight: 400, fontSize: '24px', lineHeight: 1.1, color: 'var(--paper)' }}>{st.value}</b>
                <span style={{ fontSize: '12px', color: 'var(--mute)' }}>{st.label}</span>
              </div>
            ))}
          </div>
        )}
        {rightSlot && <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>{rightSlot}</div>}
      </div>
      {stats.length > 0 && (
        <div className="md:hidden num" style={{ marginTop: 6, fontSize: '13px', color: 'var(--mute)' }}>
          {stats.map((st, i) => <span key={st.label}>{i > 0 && ' · '}<b style={{ color: 'var(--paper)' }}>{st.value}</b> {st.label.toLowerCase()}</span>)}
        </div>
      )}
    </div>
  );
}

// Hub topbar (desktop) — crest, league name, chips, your position.
export function HubTopbar({ leagueName = 'Loading…', memberCount = 0, gw = '—', chips = [], stats = [], rightSlot, onBack, isLive = false, cupPhase, leagueMode }) {
  return <HubHeaderBar title={leagueName} chips={[...(gw !== '—' ? [{ label: `Gameweek ${gw}`, tone: 'accent' }] : []), { label: `${memberCount} members` }, ...chips]} stats={stats} cupPhase={cupPhase} leagueMode={leagueMode} isLive={isLive} rightSlot={rightSlot} onBack={onBack} />;
}

// League hub navigation — Chat and Frontpage live in Clubhouse (CH-5); Bets restored at league level (DATA-5).
// squad / market / live are separate routes; callers navigate when one is picked.
export const ROUTE_TABS = ['squad', 'market', 'live'];

// One tab row (redesign): H2H sits under Standings, Market report under Recap, Betting under Bets.
// Those views stay separate; HubSubSwitch moves between them.
const HUB_GROUP = { h2h: 'leaderboard', market_report: 'recap', betting: 'bets' };
export const hubGroupOf = (tab) => HUB_GROUP[tab] ?? tab;

function hubTabList({ notifyBets, notifyTrading, isDraftLeague }) {
  return [
    { id: 'leaderboard', label: 'Standings' },
    { id: 'squad',       label: 'Squad' },
    { id: 'market',      label: 'Market' },
    { id: 'live',        label: 'Live' },
    { id: '|' },
    { id: 'recap',       label: 'Recap' },
    { id: 'bets',        label: 'Bets',    notify: notifyBets },
    // TRADING tab (auctions + trade proposals) is draft-only — Classic leagues use
    // shared player pools so exclusive ownership transfers don't apply.
    ...(isDraftLeague ? [{ id: 'trading', label: 'Trading', notify: notifyTrading }] : []),
    { id: 'stats',       label: 'Stats' },
  ];
}

export function HubTabs({ active = 'leaderboard', onTab, isCommissioner = false, notifyBets = false, notifyTrading = false, isDraftLeague = false }) {
  return <HubTabRow tabs={hubTabList({ isCommissioner, notifyBets, notifyTrading, isDraftLeague })} active={hubGroupOf(active)} onTab={onTab} />;
}

// Second-level switch for the grouped views. Renders nothing when the group has one view.
export function HubSubSwitch({ active, onTab, h2hEnabled = false }) {
  const group = hubGroupOf(active);
  const options = {
    leaderboard: [{ id: 'leaderboard', label: 'Table' }, ...(h2hEnabled ? [{ id: 'h2h', label: 'H2H fixtures' }] : [])],
    recap: [{ id: 'recap', label: 'Scores' }, { id: 'market_report', label: 'Transfers' }],
    bets: [{ id: 'bets', label: 'My bets' }, { id: 'betting', label: 'Leaderboard' }],
  }[group];
  if (!options || options.length < 2) return null;
  return (
    <div role="group" aria-label="View" style={{ display: 'flex', gap: 6, padding: '10px max(12px, 3vw)', background: 'var(--bg)', flexShrink: 0 }}>
      {options.map(o => {
        const on = o.id === active;
        return (
          <button key={o.id} aria-pressed={on} onClick={() => onTab(o.id)} style={{
            minHeight: 'var(--tap)', padding: '0 16px', borderRadius: 999, cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 'var(--fs-label)', fontWeight: on ? 700 : 500,
            background: on ? 'var(--accent-soft)' : 'var(--card)', color: on ? 'var(--accent)' : 'var(--mute)',
            border: `1px solid ${on ? 'var(--accent)' : 'var(--rule)'}`,
          }}>{o.label}</button>
        );
      })}
    </div>
  );
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
  return <HubTabRow tabs={hubTabList({})} active={hubGroupOf(active)} onTab={go} />;
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
export function Spark({ data = [], w = 88, h = 22, tone = 'var(--accent)', zero = true }) {
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
export function HubLeagueHeader({ leagueName = 'Loading…', memberCount = 0, gw = '—', chips = [], stats = [], backable = false, backTitle = '', onBack, rightSlot, cupPhase, leagueMode }) {
  return (
    <HubHeaderBar
      compact
      title={backable ? backTitle : leagueName}
      chips={backable ? [] : [...(gw !== '—' ? [{ label: `Gameweek ${gw}`, tone: 'accent' }] : []), { label: `${memberCount} members` }, ...chips]}
      stats={backable ? [] : stats}
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

