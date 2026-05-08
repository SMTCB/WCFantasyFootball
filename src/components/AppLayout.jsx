import { Link, useLocation } from 'react-router-dom';
import BrandMark from './BrandMark';

const NAV_ITEMS = [
  { name: '📊 SCORES',  path: '/',       label: 'Match Scores & Fixtures' },
  { name: '👥 SQUAD',   path: '/squad',  label: 'Your Tactical Sheet' },
  { name: '🏆 LEAGUE',  path: '/league', label: 'League Standings & Chat' },
  { name: '🔴 LIVE',    path: '/live',   label: 'Live Points & Projections' },
  { name: '💰 MARKET',  path: '/market', label: 'Player Transfer Market' },
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
        {/* Brandmark */}
        <div className="px-6 pt-6 pb-5" style={{ borderBottom: '1px solid var(--rule)' }}>
          <BrandMark theme="dark" scale={0.75} />
        </div>

        {/* Nav Links */}
        <div className="flex-1 py-4 space-y-px">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                className="relative flex items-center gap-3 mx-3 px-3 py-2.5 transition-all duration-150"
                style={{
                  background:  isActive ? 'rgba(0,180,216,0.08)' : 'transparent',
                  color:       isActive ? 'var(--cyan)' : 'var(--paper)',
                  borderLeft:  isActive ? '2px solid var(--cyan)' : '2px solid transparent',
                  marginLeft:  isActive ? '12px' : '12px',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'rgba(242,238,229,0.04)';
                    e.currentTarget.style.color = 'var(--paper)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--paper)';
                  }
                }}
              >
                <span
                  className="fk-mono text-[11px]"
                  style={{ letterSpacing: '0.18em' }}
                >
                  {item.name}
                </span>

                {/* Live indicator */}
                {item.path === '/live' && (
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
          <div
            className="fk-eyebrow"
            style={{ fontSize: '9px', color: 'var(--mute)' }}
          >
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
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                className="relative flex-1 flex flex-col items-center justify-center gap-1 transition-all"
                style={{ color: isActive ? 'var(--cyan)' : 'var(--mute)' }}
              >
                {/* Top active underline */}
                {isActive && (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2"
                    style={{ width: '28px', height: '2px', background: 'var(--cyan)' }}
                  />
                )}

                {/* Label */}
                <span
                  className="fk-mono leading-none"
                  style={{ fontSize: '9px', letterSpacing: '0.18em' }}
                >
                  {item.name === '📊 SCORES' ? '📊 SCORE' : item.name}
                </span>

                {/* Live dot */}
                {item.path === '/live' && !isActive && (
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
