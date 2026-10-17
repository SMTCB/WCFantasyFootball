import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useContext, useRef } from 'react';
import { ClubhouseNotifContext } from '../context/ClubhouseNotifContext';
import { useClubhouseContext } from '../context/ClubhouseContext';
import BrandMark from './BrandMark';
import SkipToContent from './SkipToContent';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { useActiveCompetition } from '../hooks/useActiveCompetition';
import { CompetitionNav, ClubhouseSwitcher } from './CompetitionNav';
import NewCompetitionFlow from './NewCompetitionFlow';
import ClubhouseInviteModal from './ClubhouseInviteModal';
import {
  NavIconHome,
  NavIconClubhouse,
  NavIconTrophy,
  NavIconChallenges,
  NavIconMyBets,
} from './NavIcons';

// ── Mobile bottom-bar nav — clubhouse-level, mirrors the desktop sidebar's
// "This Clubhouse" section. Sport/competition screens (Live/Squad/Market/etc.)
// live in CompetitionNav at the top of the screen, on both mobile and
// desktop, so the bottom bar no longer duplicates them per-sport.
const CLUBHOUSE_NAV = [
  { key: 'home',       label: 'Home',   path: '/home',       Icon: NavIconHome },
  { key: 'clubhouse',  label: 'Club',   path: '/clubhouse',  Icon: NavIconClubhouse },
  { key: 'trophy',     label: 'Trophy', path: '/trophy',     Icon: NavIconTrophy },
  { key: 'bets',       label: 'Bets',   path: '/my-bets',    Icon: NavIconMyBets },
  { key: 'challenges', label: 'Coins',  path: '/challenges', Icon: NavIconChallenges },
];

// ── Desktop top bar ───────────────────────────────────────────────────────────
function TopBarLink({ label, path, active, badge, Icon }) {
  return (
    <Link
      to={path}
      aria-current={active ? 'page' : undefined}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 8,
        minHeight: 'var(--tap)', padding: '0 14px', borderRadius: 'var(--radius)',
        fontSize: 'var(--fs-label)', fontWeight: active ? 700 : 500,
        color: active ? 'var(--accent)' : 'var(--mute)', textDecoration: 'none',
        background: active ? 'var(--accent-soft)' : 'transparent',
      }}
    >
      {Icon && <Icon size={18} />}
      {label}
      {badge > 0 && (
        <span className="num" style={{
          minWidth: 18, height: 18, borderRadius: 9, background: 'var(--crit)',
          fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--on-accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </Link>
  );
}

const TOP_BAR_H = 56;

export default function AppLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { unreadCount: totalUnread, unreadByCircle } = useContext(ClubhouseNotifContext);
  const { myCircles, competitions, activeCircleId, setActiveCircleId, refreshCompetitions, showNewCompFlow, openNewCompetitionFlow, closeNewCompetitionFlow } = useClubhouseContext();
  // Only the open clubhouse's unread; falls back to the total when none is open.
  const unreadCount = activeCircleId ? (unreadByCircle[activeCircleId] ?? 0) : totalUnread;
  const { competitionId } = useActiveCompetition();
  const mainRef = useRef(null);
  const [showInvite, setShowInvite] = useState(false);
  const activeCircle = myCircles.find(c => c.id === activeCircleId);

  // #main-content persists across route changes and is the real scroll container
  // (not window) — reset it on navigation so e.g. switching Clubhouses doesn't
  // land the new screen scrolled to the previous screen's position.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  const [username, setUsername] = useState(
    user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? null
  );
  useEffect(() => {
    if (!user?.id) return;
    if (user.user_metadata?.username) { setUsername(user.user_metadata.username); return; }
    supabase.from('users').select('username').eq('id', user.id).maybeSingle()
      .then(({ data }) => { if (data?.username) setUsername(data.username); });
  }, [user?.id, user?.user_metadata?.username]);

  // Top-level, clubhouse-scoped hub screens — no "back" affordance, just the
  // username link (there's nowhere more "back" than these within a Clubhouse).
  const isMainRoute =
    location.pathname === '/' ||
    location.pathname === '/home' ||
    location.pathname === '/scores' ||
    /^\/clubhouse(\/[^/]+)?$/.test(location.pathname);

  // Screens that are "inside" a Clubhouse (a specific competition, or a
  // clubhouse-scoped feature like Trophy Cabinet/Coin Wallet/Coin Challenges) —
  // "Back" always returns to the Clubhouse itself, not browser history, so
  // it's reliable no matter how the user navigated in (deep link, switcher,
  // bottom nav, etc.).
  const isCompetitionScreen =
    location.pathname === '/squad' ||
    location.pathname === '/live' ||
    location.pathname === '/market' ||
    location.pathname === '/recap' ||
    location.pathname === '/league' ||
    /^\/league\/[^/]+$/.test(location.pathname) ||
    location.pathname === '/f1' ||
    /^\/f1\/[^/]+$/.test(location.pathname) ||
    /^\/f1\/[^/]+\/(picks|standings|report|season)$/.test(location.pathname) ||
    /^\/tennis(\/.*)?$/.test(location.pathname) ||
    location.pathname === '/trophy' ||
    location.pathname === '/challenges' ||
    location.pathname === '/wallet';

  // The 4 league-scoped tabs (Live/Squad/Market/Digest) are one level "deeper"
  // than the league frontpage itself — back from these should return to the
  // league (/league/:id), not skip past it straight to the Clubhouse. They
  // always carry ?leagueId= (see CompetitionNav) so it's read straight off
  // the URL rather than tracked in separate state.
  const isLeagueScopedScreen =
    location.pathname === '/squad' ||
    location.pathname === '/live' ||
    location.pathname === '/market' ||
    location.pathname === '/recap';
  // Wishlist Draft is also one level "deeper" than the league frontpage, but
  // nested under /league/:id/wishlist (path param, not ?leagueId=) — same
  // "back to league" treatment as the tabs above.
  const wishlistMatch = location.pathname.match(/^\/league\/([^/]+)\/wishlist$/);
  const backLeagueId = isLeagueScopedScreen
    ? new URLSearchParams(location.search).get('leagueId')
    : wishlistMatch ? wishlistMatch[1] : null;

  const showBackButton = !isMainRoute;

  const handleBack = () => {
    if (backLeagueId) navigate(`/league/${backLeagueId}`);
    else if (isCompetitionScreen) navigate(activeCircleId ? `/clubhouse/${activeCircleId}` : '/clubhouse');
    else navigate(-1);
  };

  return (
    <div className="min-h-screen flex items-start" style={{ background: 'var(--bg)' }}>
      <SkipToContent targetId="main-content" />

      {/* ── Desktop top bar — Clubhouse spine (never morphs) ── */}
      <nav
        data-testid="desktop-nav"
        aria-label="Main"
        className="hidden lg:flex fixed left-0 right-0 top-0 items-center z-50"
        style={{ height: TOP_BAR_H, padding: '0 20px', gap: 4, background: 'var(--card)', borderBottom: '1px solid var(--rule)' }}
      >
        <Link to="/home" aria-label="Home" style={{ display: 'flex', alignItems: 'center', marginRight: 16 }}>
          <BrandMark theme="light" compact />
        </Link>
        <TopBarLink label="Home" path="/home" Icon={NavIconHome} active={location.pathname === '/home'} />
        {location.pathname !== '/home' && (
          <ClubhouseSwitcher
            myCircles={myCircles}
            activeCircleId={activeCircleId}
            onSelectCircle={(id) => { setActiveCircleId(id); navigate(`/clubhouse/${id}`); }}
            competitions={competitions}
            pathname={location.pathname}
            onAdd={openNewCompetitionFlow}
            onInvite={activeCircle?.invite_code ? () => setShowInvite(true) : undefined}
            clubhouseName={activeCircle?.name}
            unreadCount={unreadCount}
          />
        )}
        <TopBarLink label="Trophies" path="/trophy" Icon={NavIconTrophy} active={location.pathname === '/trophy'} />
        <TopBarLink label="Bets" path="/my-bets" Icon={NavIconMyBets} active={location.pathname === '/my-bets'} />
        <TopBarLink label="Coins" path="/challenges" Icon={NavIconChallenges} active={location.pathname === '/challenges'} />
        <span style={{ flex: 1 }} />
        <Link to="/settings" aria-label={username ?? 'Account'} style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'grid', placeItems: 'center', fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--on-accent)', marginLeft: 8, textDecoration: 'none' }}>
          {username ? username[0].toUpperCase() : 'M'}
        </Link>
      </nav>

      {/* ── Main Content ─────────────────────────────────────────────── */}
      <div
        id="main-content"
        ref={mainRef}
        tabIndex={-1}
        data-testid="main-content"
        className="flex-1 min-w-0 overflow-y-auto h-[100dvh] lg:h-[calc(100dvh-56px)] lg:mt-14"
        style={{
          paddingBottom: 'calc(64px + env(safe-area-inset-bottom))',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {/* Mobile top bar */}
        <div
          className="lg:hidden sticky top-0 z-40 flex items-center justify-between px-4"
          style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', minHeight: 'var(--tap)', paddingTop: 'env(safe-area-inset-top)' }}
        >
          {showBackButton ? (
            <button
              onClick={handleBack}
              aria-label="Go back"
              className="hit-44 flex items-center gap-2 px-2 py-1.5 transition-colors"
              style={{ color: 'var(--accent)', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--paper)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--accent)'}
            >
              <span style={{ fontSize: 'var(--fs-body-lg)' }}>←</span>
              <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-label)', fontWeight: 800 }}>
                Back
              </span>
            </button>
          ) : username ? (
            <Link
              to="/home"
              style={{ fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)', textDecoration: 'none' }}
            >
              {username}
            </Link>
          ) : (
            <div />
          )}
          <Link
            to="/settings"
            aria-label="Settings"
            style={{ color: 'var(--mute)', fontSize: 'var(--fs-heading)', padding: '8px', lineHeight: 1 }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--mute)'}
          >
            ⚙
          </Link>
        </div>

        {/* Desktop back bar — the 4 league-scoped tabs (Live/Squad/Market/Digest)
            have no other way back to the league frontpage on desktop, since the
            sidebar is a persistent clubhouse-level spine, not per-screen nav. */}
        {backLeagueId && (
          <div
            className="hidden lg:flex items-center px-4"
            style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', minHeight: 'var(--tap)' }}
          >
            <button
              onClick={handleBack}
              aria-label="Back to league"
              className="hit-44 flex items-center gap-2 py-1.5 transition-colors"
              style={{ color: 'var(--accent)', cursor: 'pointer' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--paper)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--accent)'}
            >
              <span style={{ fontSize: 'var(--fs-body-lg)' }}>←</span>
              <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-label)', fontWeight: 800 }}>
                Back to League
              </span>
            </button>
          </div>
        )}

        {/* Competition nav — clubhouse/competition dropdown + the active sport's
            screen tabs, merged into one component. Hidden on the cross-clubhouse
            Home dashboard, which has no single active competition to show — it
            only makes sense once inside a clubhouse. */}
        {location.pathname !== '/home' && (
          <CompetitionNav
            myCircles={myCircles}
            activeCircleId={activeCircleId}
            onSelectCircle={(id) => { setActiveCircleId(id); navigate(`/clubhouse/${id}`); }}
            competitions={competitions}
            pathname={location.pathname}
            onAdd={openNewCompetitionFlow}
            onInvite={activeCircle?.invite_code ? () => setShowInvite(true) : undefined}
            hasClubhouse={myCircles.length > 0}
            unreadCount={unreadCount}
            clubhouseName={activeCircle?.name}
            paddockId={competitionId}
          />
        )}

        <div className="animate-page-enter">
          {children}
        </div>
      </div>

      {/* New Competition modal — self-portals to document.body */}
      {showNewCompFlow && (
        <NewCompetitionFlow
          circleId={activeCircleId}
          clubhouseName={activeCircle?.name}
          onCreated={refreshCompetitions}
          onClose={closeNewCompetitionFlow}
        />
      )}

      {/* Invite modal — reachable from the top-bar "+ Add" menu on any competition screen */}
      {showInvite && activeCircle && (
        <ClubhouseInviteModal circle={activeCircle} onClose={() => setShowInvite(false)} />
      )}

      {/* ── Mobile Bottom Bar ─────────────────────────────────────────── */}
      <nav
        data-testid="mobile-nav"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{
          background: 'var(--card)',
          borderTop: '1px solid var(--rule)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        <div className="flex items-stretch" style={{ minHeight: 64 }}>
          {CLUBHOUSE_NAV.map(({ key, label, path, Icon }) => {
            const isActive = location.pathname === path || location.pathname.startsWith(path + '/');
            const activeColor = 'var(--accent)';

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
                    style={{ width: '28px', height: '3px', borderRadius: 2, background: activeColor }}
                  />
                )}

                {Icon && <Icon size={20} />}

                <span style={{
                  fontSize: 'var(--fs-micro)',
                  fontWeight:    600,
                  lineHeight:    1,
                }}>
                  {label}
                </span>

                {/* Unread badge (Clubhouse) */}
                {key === 'clubhouse' && unreadCount > 0 && (
                  <div
                    className="absolute top-1.5 right-[calc(50%-18px)] flex items-center justify-center rounded-full"
                    style={{ minWidth: 14, height: 14, background: 'var(--danger)', padding: '0 3px', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--on-accent)' }}
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
