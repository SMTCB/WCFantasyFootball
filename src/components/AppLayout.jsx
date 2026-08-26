import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useContext, useRef } from 'react';
import { ClubhouseNotifContext } from '../context/ClubhouseNotifContext';
import { useClubhouseContext } from '../context/ClubhouseContext';
import BrandMark from './BrandMark';
import SkipToContent from './SkipToContent';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { useActiveCompetition } from '../hooks/useActiveCompetition';
import { CompetitionTopBar } from './CompetitionTopBar';
import { CompetitionScreenNav } from './CompetitionScreenNav';
import NewCompetitionFlow from './NewCompetitionFlow';
import {
  NavIconLive,
  NavIconSquad,
  NavIconLeagues,
  NavIconMarket,
  NavIconRecap,
  NavIconClubhouse,
  NavIconF1Calendar,
  NavIconF1Picks,
  NavIconF1Standings,
  NavIconF1Report,
} from './NavIcons';

// ── Mobile bottom-bar nav items ───────────────────────────────────────────────
const FOOTBALL_NAV = [
  { key: 'live',      label: 'LIVE',      path: '/live',      Icon: NavIconLive,      isLive: true },
  { key: 'squad',     label: 'SQUAD',     path: '/squad',     Icon: NavIconSquad   },
  { key: 'league',    label: 'LEAGUE',    path: '/league',    Icon: NavIconLeagues },
  { key: 'market',    label: 'MARKET',    path: '/market',    Icon: NavIconMarket  },
  { key: 'clubhouse', label: 'CLUB',      path: '/clubhouse', Icon: NavIconClubhouse },
];

function buildF1Nav(paddockId) {
  const base = paddockId ? `/f1/${paddockId}` : '/f1';
  return [
    { key: 'f1-calendar',  label: 'CAL',      path: base,                    Icon: NavIconF1Calendar  },
    { key: 'f1-picks',     label: 'PICKS',    path: `${base}/picks`,         Icon: NavIconF1Picks     },
    { key: 'f1-standings', label: 'STD',      path: `${base}/standings`,     Icon: NavIconF1Standings },
    { key: 'f1-report',    label: 'REPORT',   path: `${base}/report`,        Icon: NavIconF1Report    },
    { key: 'clubhouse',    label: 'CLUB',     path: '/clubhouse',            Icon: NavIconClubhouse   },
  ];
}

const TENNIS_NAV = [
  { key: 'ten-home',   label: 'HOME',  path: '/tennis',             Icon: NavIconRecap    },
  { key: 'ten-lb',     label: 'TABLE', path: '/tennis/leaderboard', Icon: NavIconLeagues  },
  { key: 'clubhouse',  label: 'CLUB',  path: '/clubhouse',          Icon: NavIconClubhouse },
];

// ── Desktop sidebar helpers ───────────────────────────────────────────────────
const MONO_STYLE = { fontFamily: 'JetBrains Mono, monospace' };

function NavSectionLabel({ children }) {
  return (
    <div style={{
      ...MONO_STYLE, fontSize: 'var(--fs-micro)', letterSpacing: '0.2em', textTransform: 'uppercase',
      color: 'var(--on-shell-faint)', padding: '10px 8px 4px',
    }}>
      {children}
    </div>
  );
}

const IDENTITY_COLORS = ['var(--accent)', 'var(--gold)', 'var(--f1)', 'var(--positive)', 'var(--danger)'];

function ClubhouseSwitcher({ circles, activeCircleId, onSelect, onAdd }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const activeCircle = circles.find(c => c.id === activeCircleId);

  return (
    <div ref={rootRef} style={{ position: 'relative', padding: '0 6px 12px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 9px', borderRadius: 7,
          background: open ? 'var(--shell-fill-strong)' : 'var(--shell-fill)',
          border: '1px solid var(--shell-rule)', cursor: 'pointer',
        }}
      >
        <span aria-hidden="true" style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: IDENTITY_COLORS[circles.findIndex(c => c.id === activeCircleId) % IDENTITY_COLORS.length] || IDENTITY_COLORS[0],
        }} />
        <span style={{
          flex: 1, textAlign: 'left', fontSize: 'var(--fs-label)', fontWeight: 600, color: '#fff',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {activeCircle?.name ?? 'Select Clubhouse'}
        </span>
        <span aria-hidden="true" style={{ fontSize: 'var(--fs-micro)', opacity: 0.6, color: '#fff', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }}>⌄</span>
      </button>

      {open && (
        <div role="listbox" style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
          background: '#232D3F', border: '1px solid var(--shell-rule-strong)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.4)', zIndex: 60,
          overflow: 'hidden',
        }}>
          {circles.map((c, i) => {
            const isActive = c.id === activeCircleId;
            return (
              <button
                key={c.id}
                role="option"
                aria-selected={isActive}
                onClick={() => { onSelect(c.id); setOpen(false); }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '9px 10px', border: 'none', textAlign: 'left', cursor: 'pointer',
                  background: isActive ? 'var(--shell-fill-strong)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--on-shell-mid)',
                  fontSize: 'var(--fs-label)', fontWeight: isActive ? 600 : 500,
                }}
              >
                <span aria-hidden="true" style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: IDENTITY_COLORS[i % IDENTITY_COLORS.length],
                }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                {isActive && <span aria-hidden="true" style={{ fontSize: 'var(--fs-micro)', color: 'var(--accent)' }}>✓</span>}
              </button>
            );
          })}
          <button
            onClick={() => { setOpen(false); onAdd(); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '9px 10px', border: 'none', borderTop: '1px solid var(--shell-rule)',
              textAlign: 'left', cursor: 'pointer', background: 'transparent',
              color: 'var(--on-shell-dim)', fontSize: 'var(--fs-label)', fontWeight: 500,
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 'var(--fs-body)', width: 7, textAlign: 'center' }}>+</span>
            Find or create a Clubhouse
          </button>
        </div>
      )}
    </div>
  );
}

function NavItem({ label, path, active, dotColor, tag, tagStyle, sub, onClick, badge }) {
  const [hovered, setHovered] = useState(false);
  const style = {
    display: 'flex', alignItems: 'center', gap: 9,
    padding: sub ? '6px 10px' : '7.5px 10px',
    borderRadius: 5,
    fontSize: sub ? 12 : 12.5,
    fontWeight: 500,
    color: active ? '#fff' : hovered ? 'var(--on-shell)' : 'var(--on-shell-dim)',
    cursor: 'pointer',
    background: active ? 'var(--shell-fill-strong)' : hovered ? 'var(--shell-fill)' : 'transparent',
    transition: 'all .12s',
    userSelect: 'none',
    textDecoration: 'none',
  };
  const dotStyle = {
    width: sub ? 3 : 5, height: sub ? 3 : 5, borderRadius: '50%',
    background: active && dotColor ? dotColor : 'currentColor',
    opacity: active ? 1 : 0.5,
    flexShrink: 0, transition: 'all .12s',
  };
  return (
    <Link
      to={path}
      onClick={onClick}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span style={dotStyle} />
      <span style={{ flex: 1 }}>{label}</span>
      {tag && (
        <span style={{
          ...MONO_STYLE, fontSize: 'var(--fs-micro)', letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '1.5px 5px', borderRadius: 2, fontWeight: 600, flexShrink: 0, marginLeft: 'auto',
          ...(tagStyle ?? {}),
        }}>
          {tag}
        </span>
      )}
      {badge > 0 && (
        <span style={{
          minWidth: 16, height: 16, borderRadius: '50%', background: 'var(--danger)',
          ...MONO_STYLE, fontSize: 'var(--fs-micro)', fontWeight: 700, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

export default function AppLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unreadCount } = useContext(ClubhouseNotifContext);
  const { myCircles, competitions, activeCircleId, setActiveCircleId, refreshCompetitions } = useClubhouseContext();
  const { sport, competitionId } = useActiveCompetition();
  const [showNewCompFlow, setShowNewCompFlow] = useState(false);

  // Mobile bottom bar is the active competition's screens; sidebar never changes
  const MOBILE_NAV = sport === 'f1' ? buildF1Nav(competitionId) : sport === 'tennis' ? TENNIS_NAV : FOOTBALL_NAV;
  // The group's own "home" tab path is a real prefix of every sibling sub-route path
  // (e.g. f1-calendar's `/f1/<id>` is a prefix of `/f1/<id>/standings`) — exclude it from
  // the startsWith prefix-match below so only one tab lights up at a time.
  const mobileNavHomePath = sport === 'f1' ? (competitionId ? `/f1/${competitionId}` : '/f1')
    : sport === 'tennis' ? '/tennis' : null;

  const [username, setUsername] = useState(
    user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? null
  );
  useEffect(() => {
    if (!user?.id) return;
    if (user.user_metadata?.username) { setUsername(user.user_metadata.username); return; }
    supabase.from('users').select('username').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.username) setUsername(data.username); });
  }, [user?.id, user?.user_metadata?.username]);

  const isMainRoute =
    location.pathname === '/' ||
    location.pathname === '/scores' ||
    location.pathname === '/squad' ||
    location.pathname === '/league' ||
    location.pathname === '/live' ||
    location.pathname === '/market' ||
    location.pathname === '/recap' ||
    location.pathname === '/trophy' ||
    location.pathname === '/challenges' ||
    location.pathname === '/wallet' ||
    location.pathname === '/f1' ||
    /^\/clubhouse(\/[^/]+)?$/.test(location.pathname) ||
    /^\/league\/[^/]+$/.test(location.pathname) ||
    /^\/f1\/[^/]+$/.test(location.pathname) ||
    /^\/f1\/[^/]+\/(picks|standings|report|season)$/.test(location.pathname) ||
    /^\/tennis(\/.*)?$/.test(location.pathname);
  const showBackButton = !isMainRoute;

  return (
    <div className="min-h-screen flex items-start" style={{ background: 'var(--ink)' }}>
      <SkipToContent targetId="main-content" />

      {/* ── Desktop Left Sidebar — Clubhouse spine (never morphs) ── */}
      <nav
        data-testid="desktop-nav"
        className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[220px] flex-col z-50"
        style={{ background: 'var(--shell)', borderRight: '1px solid var(--shell-rule)' }}
      >
        {/* Brand */}
        <div style={{ padding: '16px 14px 13px', borderBottom: '1px solid var(--shell-rule)' }}>
          <BrandMark theme="dark" compact />
        </div>

        {/* Clubhouse switcher — always visible, even with a single Clubhouse */}
        <NavSectionLabel>Your Clubhouses</NavSectionLabel>
        <ClubhouseSwitcher
          circles={myCircles}
          activeCircleId={activeCircleId}
          onSelect={(id) => { setActiveCircleId(id); navigate(`/clubhouse/${id}`); }}
          onAdd={() => navigate('/clubhouse?tab=find')}
        />

        {/* Nav — clubhouse-centric, never morphs */}
        <div style={{ padding: '8px 6px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0, scrollbarWidth: 'none' }}>

          {/* THIS CLUBHOUSE — all items here are scoped to the active clubhouse above */}
          <NavSectionLabel>This Clubhouse</NavSectionLabel>
          <NavItem
            label="Frontpage"
            path="/clubhouse"
            active={location.pathname.startsWith('/clubhouse') && !location.search.includes('tab=frontrow')}
            dotColor="var(--on-shell-dim)"
            badge={unreadCount}
          />
          <NavItem
            label="The FrontRow"
            path="/clubhouse?tab=frontrow"
            active={location.pathname.startsWith('/clubhouse') && location.search.includes('tab=frontrow')}
            dotColor="var(--gold)"
          />
          <NavItem
            label="Trophy Cabinet"
            path="/trophy"
            active={location.pathname === '/trophy'}
            dotColor="var(--gold)"
          />
          <NavItem
            label="Coin Challenges"
            path="/challenges"
            active={location.pathname === '/challenges'}
            dotColor="var(--gold)"
            tag="Beta"
            tagStyle={{ background: 'rgba(184,114,14,.15)', color: 'var(--on-shell-gold)' }}
          />

          {/* ACCOUNT — the one item here that is NOT clubhouse-scoped */}
          <NavSectionLabel>Account</NavSectionLabel>
          <NavItem
            label="Settings"
            path="/settings"
            active={location.pathname === '/settings'}
            dotColor="var(--on-shell-faint)"
          />
        </div>

        {/* Footer — username */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--shell-rule)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', display: 'grid', placeItems: 'center', fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)', color: '#fff', flexShrink: 0 }}>
            {username ? username[0].toUpperCase() : 'M'}
          </div>
          <div>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--on-shell-mid)', fontWeight: 600 }}>{username ?? 'Manager'}</div>
            <div style={{ ...MONO_STYLE, fontSize: 'var(--fs-micro)', letterSpacing: '0.06em', color: 'var(--on-shell-faint)' }}>Multi-sport</div>
          </div>
        </div>
      </nav>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <div
        id="main-content"
        tabIndex={-1}
        data-testid="main-content"
        className="flex-1 min-w-0 lg:ml-[220px] overflow-y-auto"
        style={{
          height: '100dvh',
          paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Mobile top bar */}
        <div
          className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4"
          style={{ background: 'var(--ink)', borderBottom: '1px solid var(--rule)', minHeight: 44, paddingTop: 'env(safe-area-inset-top)' }}
        >
          {showBackButton ? (
            <button
              onClick={() => navigate(-1)}
              aria-label="Go back"
              className="flex items-center gap-2 px-2 py-1.5 transition-colors"
              style={{ color: 'var(--cyan)', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--paper)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--cyan)'}
            >
              <span style={{ fontSize: 'var(--fs-body-lg)' }}>←</span>
              <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Back
              </span>
            </button>
          ) : username ? (
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', color: 'var(--mute)', textTransform: 'uppercase' }}>
              {username}
            </div>
          ) : (
            <div />
          )}
          <Link
            to="/settings"
            aria-label="Settings"
            style={{ color: 'var(--mute)', fontSize: 'var(--fs-heading)', padding: '8px', lineHeight: 1 }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--cyan)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--mute)'}
          >
            ⚙
          </Link>
        </div>

        {/* Desktop-only breathing room above the competition top bar — it sits flush under the
            mobile top bar's spot on small screens, but needs a gap from the viewport edge on desktop. */}
        <div className="hidden lg:block" style={{ height: 12 }} />

        {/* Competition top bar — flat list of competition tabs (sport-colored) */}
        <CompetitionTopBar
          competitions={competitions}
          pathname={location.pathname}
          onAdd={() => setShowNewCompFlow(true)}
          hasClubhouse={myCircles.length > 0}
        />

        {/* Competition screen nav — screens within the active sport/competition */}
        <CompetitionScreenNav
          pathname={location.pathname}
          paddockId={competitionId}
        />

        <div className="animate-page-enter">
          {children}
        </div>
      </div>

      {/* New Competition modal — self-portals to document.body */}
      {showNewCompFlow && (
        <NewCompetitionFlow
          circleId={activeCircleId}
          clubhouseName={myCircles.find(c => c.id === activeCircleId)?.name}
          onCreated={refreshCompetitions}
          onClose={() => setShowNewCompFlow(false)}
        />
      )}

      {/* ── Mobile Bottom Bar ─────────────────────────────────────────── */}
      <nav
        data-testid="mobile-nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: 'var(--shell)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid var(--shell-rule)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-stretch h-16">
          {MOBILE_NAV.map(({ key, label, path, Icon, isLive }) => { // eslint-disable-line no-unused-vars
            const isActive = location.pathname === path ||
              (path !== '/' && path !== mobileNavHomePath && location.pathname.startsWith(path + '/'));
            const activeColor = isLive ? 'var(--on-shell-danger)' : 'var(--on-shell-accent)';
            const alreadyOnLeague = key === 'league' && location.pathname.startsWith('/league/');
            const alreadyOnPaddockMobile = key === 'f1-calendar' && /^\/f1\/[^/]+/.test(location.pathname);
            const navTo = (alreadyOnLeague || alreadyOnPaddockMobile)
              ? location.pathname + location.search
              : path;

            return (
              <Link
                key={key}
                to={navTo}
                className="relative flex-1 flex flex-col items-center justify-center gap-1 transition-all"
                style={{ color: isActive ? activeColor : 'var(--on-shell-dim)' }}
              >
                {/* Top active bar */}
                {isActive && (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2"
                    style={{ width: '28px', height: '2px', background: activeColor }}
                  />
                )}

                <Icon size={20} />

                <span style={{
                  fontFamily:    'JetBrains Mono, monospace',
                  fontSize: 'var(--fs-micro)',
                  letterSpacing: '0.15em',
                  fontWeight:    600,
                  lineHeight:    1,
                }}>
                  {label}
                </span>

                {/* Live pulse dot */}
                {isLive && !isActive && (
                  <div
                    className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full animate-live-pulse"
                    style={{ background: 'var(--danger)' }}
                  />
                )}

                {/* Unread badge (Clubhouse) */}
                {key === 'clubhouse' && unreadCount > 0 && (
                  <div
                    className="absolute top-1.5 right-[calc(50%-18px)] flex items-center justify-center rounded-full"
                    style={{ minWidth: 14, height: 14, background: 'var(--danger)', padding: '0 3px', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', fontWeight: 700, color: '#fff' }}
                  >
                    {unreadCount > 99 ? '99' : unreadCount}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
