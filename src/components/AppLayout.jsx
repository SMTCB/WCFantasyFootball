import { Link, useLocation } from 'react-router-dom';
import BrandMark from './BrandMark';
import {
  NavIconScores,
  NavIconSquad,
  NavIconLeagues,
  NavIconLive,
  NavIconMarket,
} from './NavIcons';

const NAV_ITEMS = [
  { key: 'scores',  label: 'SCORES',  path: '/',       Icon: NavIconScores,  desc: 'Match Scores & Fixtures' },
  { key: 'squad',   label: 'SQUAD',   path: '/squad',  Icon: NavIconSquad,   desc: 'Your Tactical Sheet' },
  { key: 'league',  label: 'LEAGUE',  path: '/league', Icon: NavIconLeagues, desc: 'League Standings & Chat' },
  { key: 'live',    label: 'LIVE',    path: '/live',   Icon: NavIconLive,    desc: 'Live Points & Projections', isLive: true },
  { key: 'market',  label: 'MARKET',  path: '/market', Icon: NavIconMarket,  desc: 'Player Transfer Market' },
];

export default function AppLayout({ children }) {
  const location = useLocation();

  return (
    <div className="min-h-screen flex items-start" style={{ background: 'var(--ink)' }}>

      {/* ── Desktop Left Sidebar ─────────────────────────────────────── */}
      <nav
        data-testid="desktop-nav"
        className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[220px] flex-col z-50"
        style={{ background: 'var(--ink-2)', borderRight: '1px solid var(--rule)' }}
      >
        {/* Editorial Brandmark */}
        <div className="px-5 pt-6 pb-5" style={{ borderBottom: '1px solid var(--rule)' }}>
          <BrandMark theme="dark" scale={0.72} />
        </div>

        {/* Nav Links */}
        <div className="flex-1 py-4 space-y-px">
          {NAV_ITEMS.map(({ key, label, path, Icon, desc, isLive }) => { // eslint-disable-line no-unused-vars
            const isActive = location.pathname === path ||
              (path !== '/' && location.pathname.startsWith(path));
            const liveColor = 'var(--danger)';
            const activeColor = isLive ? liveColor : 'var(--cyan)';

            return (
              <Link
                key={key}
                to={path}
                title={desc}
                className="relative flex items-center gap-3 mx-3 px-3 py-2.5 transition-all duration-150"
                style={{
                  background:  isActive ? (isLive ? 'rgba(239,68,68,0.08)' : 'rgba(0,180,216,0.08)') : 'transparent',
                  color:       isActive ? activeColor : 'var(--mute)',
                  borderLeft:  isActive ? `2px solid ${activeColor}` : '2px solid transparent',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(242,238,229,0.04)';
                    e.currentTarget.style.color = isLive ? liveColor : 'var(--paper)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--mute)';
                  }
                }}
              >
                <Icon size={18} />
                <span
                  style={{
                    fontFamily:    'JetBrains Mono, monospace',
                    fontSize:      '10px',
                    letterSpacing: '0.18em',
                    fontWeight:    600,
                  }}
                >
                  {label}
                </span>

                {/* Live pulse dot */}
                {isLive && (
                  <div
                    className="ml-auto w-1.5 h-1.5 rounded-full shrink-0 animate-live-pulse"
                    style={{ background: 'var(--danger)' }}
                  />
                )}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4" style={{ borderTop: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', letterSpacing: '0.15em', color: 'var(--mute)', textTransform: 'uppercase' }}>
            Alpha v0.1
          </div>
        </div>
      </nav>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <div
        data-testid="main-content"
        className="flex-1 min-w-0 lg:ml-[220px] overflow-y-auto"
        style={{
          height: '100dvh',
          paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="animate-page-enter">
          {children}
        </div>
      </div>

      {/* ── Mobile Bottom Bar ─────────────────────────────────────────── */}
      <nav
        data-testid="mobile-nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: 'rgba(15,18,24,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid var(--rule)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-stretch h-16">
          {NAV_ITEMS.map(({ key, label, path, Icon, isLive }) => { // eslint-disable-line no-unused-vars
            const isActive = location.pathname === path ||
              (path !== '/' && location.pathname.startsWith(path));
            const activeColor = isLive ? 'var(--danger)' : 'var(--cyan)';

            return (
              <Link
                key={key}
                to={path}
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
                  fontSize:      '8px',
                  letterSpacing: '0.15em',
                  fontWeight:    600,
                  lineHeight:    1,
                }}>
                  {label}
                </span>

                {/* Live pulse dot (inactive state) */}
                {isLive && !isActive && (
                  <div
                    className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full animate-live-pulse"
                    style={{ background: 'var(--danger)' }}
                  />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
