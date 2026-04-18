import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { name: 'Scores',   path: '/',       icon: '⚽', label: 'Match Scores & Fixtures' },
  { name: 'My Squad', path: '/squad',  icon: '👕', label: 'Your Tactical Sheet' },
  { name: 'League',   path: '/league', icon: '🏆', label: 'League Standings & Chat' },
  { name: 'Live',     path: '/live',   icon: '⚡', label: 'Live Points & Projections' },
  { name: 'Market',   path: '/market', icon: '🛒', label: 'Player Transfer Market' },
];

export default function AppLayout({ children }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-bg flex">

      {/* ── Desktop Left Sidebar ─────────────────────────────── */}
      <nav className="hidden lg:flex fixed left-0 top-0 bottom-0 w-[200px] bg-surface flex-col z-50 border-r border-border">

        {/* Wordmark */}
        <div className="px-5 py-5 border-b border-border">
          <div className="fz-label mb-0.5">Forza Fantasy</div>
          <div className="fz-display text-[26px] text-white leading-none tracking-tight">
            Fantasy<span className="text-cyan">Kit</span>
          </div>
        </div>

        {/* Nav Links */}
        <div className="flex-1 py-3">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                className={`relative flex items-center gap-3 px-5 py-3 text-[12px] font-semibold uppercase tracking-widest transition-all duration-150 ${
                  isActive
                    ? 'text-cyan bg-cyan/10'
                    : 'text-text-secondary hover:text-white hover:bg-white/[0.04]'
                }`}
              >
                {/* Active left accent stripe */}
                {isActive && (
                  <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-cyan rounded-r-full" />
                )}
                <span className="text-[16px] leading-none">{item.icon}</span>
                <span className="font-['DM_Sans']">{item.name}</span>
              </Link>
            );
          })}
        </div>

        {/* Footer badge */}
        <div className="px-5 py-4 border-t border-border">
          <div className="text-[9px] fz-label text-text-tertiary">Alpha v0.1</div>
          <div className="text-[10px] text-text-tertiary mt-0.5 font-medium">
            Forza Ecosystem
          </div>
        </div>
      </nav>

      {/* ── Main Content Area ────────────────────────────────── */}
      <div className="flex-1 lg:ml-[200px] min-h-screen pb-20 lg:pb-0">
        {children}
      </div>

      {/* ── Mobile Bottom Bar ────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/95 backdrop-blur-xl border-t border-border">
        <div className="flex justify-around items-center py-2.5">
          {NAV_ITEMS.map(item => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`relative flex flex-col items-center gap-1 px-3 pt-1 pb-0.5 rounded-sm transition-all ${
                  isActive
                    ? 'text-cyan'
                    : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {isActive && (
                  <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-cyan rounded-full" />
                )}
                <span className="text-[18px] leading-none">{item.icon}</span>
                <span className="text-[8px] font-black uppercase tracking-[0.12em]">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
