import { Link, useLocation } from 'react-router-dom';

/* ── SVG Icons — clean, football-specific ───────────────────────────────────── */
const Icons = {
  scores: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c0 0 2 3 2 9s-2 9-2 9" />
      <path d="M3 12h18" />
      <path d="M4.5 7.5C6.5 9 9 9.5 12 9.5s5.5-.5 7.5-2" />
      <path d="M4.5 16.5C6.5 15 9 14.5 12 14.5s5.5.5 7.5 2" />
    </svg>
  ),
  squad: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  league: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6h8M6 10h12M8 14h8M10 18h4" />
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  ),
  live: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  market: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <line x1="3" y1="6" x2="21" y2="6" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
};

const NAV_ITEMS = [
  { name: 'Scores',   path: '/',       icon: 'scores',  label: 'Match Scores & Fixtures' },
  { name: 'My Squad', path: '/squad',  icon: 'squad',   label: 'Your Tactical Sheet' },
  { name: 'League',   path: '/league', icon: 'league',  label: 'League Standings & Chat' },
  { name: 'Live',     path: '/live',   icon: 'live',    label: 'Live Points & Projections' },
  { name: 'Market',   path: '/market', icon: 'market',  label: 'Player Transfer Market' },
];

export default function AppLayout({ children }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-bg flex">

      {/* ── Desktop Left Sidebar ─────────────────────────────── */}
      <nav
        data-testid="desktop-nav"
        className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[220px] flex-col z-50"
        style={{
          background: 'linear-gradient(180deg, #0D1117 0%, #080A0E 100%)',
          borderRight: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* Wordmark */}
        <div className="px-6 pt-6 pb-5 border-b border-border">
          <div
            className="text-[9px] font-bold uppercase tracking-[0.25em] mb-1"
            style={{ color: '#3D4B5C', fontFamily: 'DM Sans, sans-serif' }}
          >
            Fantasy Football
          </div>
          <div
            className="text-[28px] leading-none font-black uppercase tracking-tight"
            style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#F0F2F5' }}
          >
            Forza<span style={{ color: '#00C4E8' }}>Kit</span>
          </div>
          <div
            className="mt-1.5 text-[9px] uppercase tracking-[0.2em] font-semibold"
            style={{ color: '#3D4B5C', fontFamily: 'DM Sans, sans-serif' }}
          >
            Fantasy League
          </div>
        </div>

        {/* Nav Links */}
        <div className="flex-1 py-4 space-y-0.5">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path ||
              (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                className="relative flex items-center gap-3.5 mx-3 px-3 py-2.5 rounded-md transition-all duration-150 group"
                style={{
                  background: isActive ? 'rgba(0,196,232,0.1)' : 'transparent',
                  color: isActive ? '#00C4E8' : '#7D8A96',
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                  if (!isActive) e.currentTarget.style.color = '#F0F2F5';
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                  if (!isActive) e.currentTarget.style.color = '#7D8A96';
                }}
              >
                {/* Active left bar */}
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full"
                    style={{ background: '#00C4E8', marginLeft: '-12px' }}
                  />
                )}

                {/* Icon */}
                <div className="w-[18px] h-[18px] shrink-0 opacity-90">
                  {Icons[item.icon]}
                </div>

                {/* Label */}
                <span
                  className="text-[12px] font-semibold"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {item.name}
                </span>

                {/* Live dot for Live screen */}
                {item.path === '/live' && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-negative animate-live-pulse shrink-0" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          <div
            className="text-[9px] uppercase tracking-[0.2em] font-semibold"
            style={{ color: '#3D4B5C', fontFamily: 'DM Sans, sans-serif' }}
          >
            Alpha v0.1 · Forza Ecosystem
          </div>
        </div>
      </nav>

      {/* ── Main Content ─────────────────────────────────────── */}
      <div data-testid="main-content" className="flex-1 min-w-0 lg:ml-[220px] min-h-screen" style={{ paddingBottom: 'calc(64px + env(safe-area-inset-bottom))' }}>
        <div className="animate-page-enter">
          {children}
        </div>
      </div>

      {/* ── Mobile Bottom Bar ────────────────────────────────── */}
      <nav
        data-testid="mobile-nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: 'rgba(13,17,23,0.97)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
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
                className="relative flex-1 flex flex-col items-center justify-center gap-1.5 transition-all"
                style={{ color: isActive ? '#00C4E8' : '#3D4B5C' }}
              >
                {/* Top active indicator */}
                {isActive && (
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 rounded-b-full"
                    style={{ width: '28px', height: '2.5px', background: '#00C4E8' }}
                  />
                )}

                {/* Icon */}
                <div
                  className="w-[22px] h-[22px] transition-all duration-150"
                  style={{ transform: isActive ? 'scale(1.05)' : 'scale(1)' }}
                >
                  {Icons[item.icon]}
                </div>

                {/* Label */}
                <span
                  className="text-[9.5px] font-semibold uppercase tracking-[0.1em] leading-none"
                  style={{ fontFamily: 'DM Sans, sans-serif' }}
                >
                  {item.name === 'My Squad' ? 'Squad' : item.name}
                </span>

                {/* Live dot */}
                {item.path === '/live' && !isActive && (
                  <div className="absolute top-2 right-[calc(50%-14px)] w-1.5 h-1.5 rounded-full bg-negative animate-live-pulse" />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
