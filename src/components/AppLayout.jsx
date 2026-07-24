import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useContext } from 'react';
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
      ...MONO_STYLE, fontSize: 7, letterSpacing: '0.2em', textTransform: 'uppercase',
      color: 'rgba(255,255,255,.16)', padding: '10px 8px 4px',
    }}>
      {children}
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
    color: active ? '#fff' : hovered ? 'rgba(255,255,255,.78)' : 'rgba(255,255,255,.46)',
    cursor: 'pointer',
    background: active ? 'rgba(255,255,255,.09)' : hovered ? 'rgba(255,255,255,.05)' : 'transparent',
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
          ...MONO_STYLE, fontSize: 6.5, letterSpacing: '0.08em', textTransform: 'uppercase',
          padding: '1.5px 5px', borderRadius: 2, fontWeight: 600, flexShrink: 0, marginLeft: 'auto',
          ...(tagStyle ?? {}),
        }}>
          {tag}
        </span>
      )}
      {badge > 0 && (
        <span style={{
          minWidth: 16, height: 16, borderRadius: '50%', background: 'var(--danger)',
          ...MONO_STYLE, fontSize: 9, fontWeight: 700, color: '#fff',
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
  const { competitions, activeCircleId, refreshCompetitions } = useClubhouseContext();
  const { sport, competitionId } = useActiveCompetition();
  const [showNewCompFlow, setShowNewCompFlow] = useState(false);

  // Mobile bottom bar is the active competition's screens; sidebar never changes
  const MOBILE_NAV = sport === 'f1' ? buildF1Nav(competitionId) : sport === 'tennis' ? TENNIS_NAV : FOOTBALL_NAV;

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
        style={{ background: 'var(--shell)', borderRight: '1px solid rgba(255,255,255,0.08)' }}
      >
        {/* Brand */}
        <div style={{ padding: '16px 14px 13px', borderBottom: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 24, height: 24, borderRadius: 5, background: 'var(--accent)', display: 'grid', placeItems: 'center', fontFamily: 'Archivo Black, sans-serif', fontSize: 11, color: '#fff', flexShrink: 0 }}>
            K
          </div>
          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 13, color: '#fff', letterSpacing: '-0.01em' }}>
            Fantasy<span style={{ color: 'rgba(255,255,255,.32)' }}>Kit</span>
          </div>
        </div>

        {/* Nav — clubhouse-centric, never morphs */}
        <div style={{ padding: '8px 6px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0, scrollbarWidth: 'none' }}>

          {/* CLUBHOUSE */}
          <NavSectionLabel>Clubhouse</NavSectionLabel>
          <NavItem
            label="Clubhouse"
            path="/clubhouse"
            active={location.pathname.startsWith('/clubhouse') && !location.search.includes('tab=frontrow')}
            dotColor="rgba(255,255,255,.55)"
            badge={unreadCount}
          />
          <NavItem
            label="The FrontRow"
            path="/clubhouse?tab=frontrow"
            active={location.pathname.startsWith('/clubhouse') && location.search.includes('tab=frontrow')}
            dotColor="var(--gold)"
            sub
          />

          {/* COMMUNITY */}
          <NavSectionLabel>Community</NavSectionLabel>
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
            tagStyle={{ background: 'rgba(184,114,14,.15)', color: 'var(--gold)' }}
          />
          <NavItem
            label="Settings"
            path="/settings"
            active={location.pathname === '/settings'}
            dotColor="rgba(255,255,255,.35)"
          />
        </div>

        {/* Footer — username */}
        <div style={{ padding: '10px 12px', borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--accent)', display: 'grid', placeItems: 'center', fontFamily: 'Archivo Black, sans-serif', fontSize: 10, color: '#fff', flexShrink: 0 }}>
            {username ? username[0].toUpperCase() : 'M'}
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.68)', fontWeight: 600 }}>{username ?? 'Manager'}</div>
            <div style={{ ...MONO_STYLE, fontSize: 7.5, letterSpacing: '0.06em', color: 'rgba(255,255,255,.26)' }}>Multi-sport</div>
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
              <span style={{ fontSize: '16px' }}>←</span>
              <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: '11px', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Back
              </span>
            </button>
          ) : username ? (
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.12em', color: 'var(--mute)', textTransform: 'uppercase' }}>
              {username}
            </div>
          ) : (
            <div />
          )}
          <Link
            to="/settings"
            aria-label="Settings"
            style={{ color: 'var(--mute)', fontSize: '18px', padding: '8px', lineHeight: 1 }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--cyan)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--mute)'}
          >
            ⚙
          </Link>
        </div>

        {/* Competition top bar — flat list of competition tabs (sport-colored) */}
        <CompetitionTopBar
          competitions={competitions}
          pathname={location.pathname}
          onAdd={() => setShowNewCompFlow(true)}
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
          borderTop: '1px solid rgba(255,255,255,0.07)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-stretch h-16">
          {MOBILE_NAV.map(({ key, label, path, Icon, isLive }) => { // eslint-disable-line no-unused-vars
            const isActive = location.pathname === path ||
              (path !== '/' && location.pathname.startsWith(path));
            const activeColor = isLive ? 'var(--danger)' : 'var(--cyan)';
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
                style={{ color: isActive ? activeColor : 'var(--mute)' }}
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
                  fontSize:      '10px',
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
                    style={{ minWidth: 14, height: 14, background: 'var(--danger)', padding: '0 3px', fontFamily: 'JetBrains Mono, monospace', fontSize: 8, fontWeight: 700, color: '#fff' }}
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
