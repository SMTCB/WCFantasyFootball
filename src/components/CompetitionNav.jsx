import { IconTrophy } from './UiIcons';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSport } from '../context/SportContext';
import {
  NavIconClubhouse,
  NavIconWishlist,
  NavIconF1Calendar,
  NavIconF1Standings,
  NavIconF1Report,
  NavIconF1Season,
} from './NavIcons';

const SPORT_COLOR = {
  football: 'var(--accent)',
  f1: 'var(--f1)',
  tennis: 'var(--ten)',
};

const IDENTITY_COLORS = ['var(--accent)', 'var(--gold)', 'var(--f1)', 'var(--positive)', 'var(--danger)'];

function extractActiveCompId(pathname) {
  const leagueMatch = pathname.match(/^\/league\/([^/]+)/);
  if (leagueMatch) return { id: leagueMatch[1], sport: 'football' };
  const f1Match = pathname.match(/^\/f1\/([^/]+)/);
  if (f1Match) return { id: f1Match[1], sport: 'f1' };
  const tennisMatch = pathname.match(/^\/tennis\/tournament\/([^/]+)/);
  if (tennisMatch) return { id: tennisMatch[1], sport: 'tennis' };
  return null;
}

function buildF1Screens(paddockId) {
  const base = paddockId ? `/f1/${paddockId}` : '/f1';
  return [
    { key: 'f1-cal',  label: 'CALENDAR',  path: base,                    Icon: NavIconF1Calendar  },
    { key: 'f1-std',  label: 'STANDINGS', path: `${base}/standings`,     Icon: NavIconF1Standings },
    { key: 'f1-rep',  label: 'REPORT',    path: `${base}/report`,        Icon: NavIconF1Report    },
    { key: 'f1-sea',  label: 'SEASON',    path: `${base}/season`,        Icon: NavIconF1Season    },
  ];
}

const TENNIS_SCREENS = [
  { key: 'ten-home', label: 'HOME',        path: '/tennis',             Icon: null },
  { key: 'ten-lb',   label: 'LEADERBOARD', path: '/tennis/leaderboard', Icon: null },
];

const CHEVRON = (open) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .12s', flexShrink: 0 }}><path d="M6 9l6 6 6-6" /></svg>
);

function UnreadDot({ count }) {
  if (!(count > 0)) return null;
  return (
    <span className="num" style={{
      minWidth: 18, height: 18, borderRadius: 9, background: 'var(--crit)', color: 'var(--on-accent)',
      fontSize: 'var(--fs-micro)', fontWeight: 700, display: 'inline-flex', alignItems: 'center',
      justifyContent: 'center', padding: '0 5px', flexShrink: 0,
    }}>{count > 99 ? '99+' : count}</span>
  );
}

/**
 * ClubhouseSwitcher — one pill showing "Clubhouse / Competition" that opens the
 * picker (clubhouses, this clubhouse's competitions, hub, new, invite). Used in
 * the desktop top bar and as row 1 of CompetitionNav on mobile.
 */
export function ClubhouseSwitcher({
  myCircles, activeCircleId, onSelectCircle, competitions, pathname,
  onAdd, onInvite, clubhouseName, unreadCount = 0, grow = false,
}) {
  const navigate = useNavigate();
  const { setActivePlayerBoxId } = useSport();
  const active = extractActiveCompId(pathname);
  const isClubhouseHome = /^\/clubhouse(\/[^/]+)?$/.test(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  const openMenu = () => {
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)) });
    setMenuOpen(true);
  };

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) setMenuOpen(false);
    };
    const close = () => setMenuOpen(false);
    document.addEventListener('mousedown', handleClick);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [menuOpen]);

  const allComps = [
    ...(competitions.football ?? []).map(c => ({ ...c, sport: 'football' })),
    ...(competitions.f1      ?? []).map(c => ({ ...c, sport: 'f1' })),
    ...(competitions.tennis  ?? []).map(c => ({ ...c, sport: 'tennis' })),
  ];

  const goToComp = (comp) => {
    setMenuOpen(false);
    if (comp.sport === 'tennis') {
      // A tennis "competition" from get_clubhouse_competitions is a
      // player_box id, not a tournament id — TennisHomeScreen resolves the
      // active tournament from SportContext, not from a URL param.
      setActivePlayerBoxId(comp.id);
      navigate('/tennis');
    } else if (comp.sport === 'f1') {
      navigate(`/f1/${comp.id}`);
    } else {
      navigate(`/league/${comp.id}`);
    }
  };

  const activeComp = allComps.find(c => active && c.id === active.id && c.sport === active.sport);

  return (
    <>
      <button className="hit-44"
          ref={buttonRef}
          onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            minWidth: 0, flex: grow ? '1 1 auto' : '0 1 auto',
            minHeight: 'var(--tap)', padding: '6px 14px', borderRadius: 22,
            background: menuOpen ? 'var(--accent-soft)' : 'var(--elev)',
            border: 'none', maxWidth: '100%',
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <NavIconClubhouse size={18} />
          <span style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)',
          }}>
            {clubhouseName ?? 'Clubhouse'}
          </span>
          {activeComp && (
            <>
              <span aria-hidden="true" style={{ color: 'var(--mute)', flexShrink: 0 }}>/</span>
              <span aria-hidden="true" style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                background: SPORT_COLOR[activeComp.sport] ?? 'var(--mute)', flexShrink: 0,
              }} />
              <span style={{
                minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)',
              }}>
                {activeComp.name}
              </span>
            </>
          )}
          <UnreadDot count={unreadCount} />
          <span style={{ marginLeft: 'auto', color: 'var(--mute)', display: 'inline-flex' }}>{CHEVRON(menuOpen)}</span>
        </button>

      {menuOpen && menuPos && createPortal(
        <div
          ref={dropdownRef}
          role="menu"
          style={{
            position: 'fixed', top: menuPos.top, left: menuPos.left,
            background: 'var(--card)', border: '1px solid var(--rule)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 'var(--z-toast)',
            overflow: 'hidden', width: 260, maxHeight: '70vh', overflowY: 'auto',
          }}
        >
          {myCircles.length > 1 && (
            <>
              <div style={{ padding: '10px 14px 6px', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
                Your clubhouses
              </div>
              {myCircles.map((c, i) => {
                const isActive = c.id === activeCircleId;
                return (
                  <button
                    key={c.id}
                    role="menuitem"
                    onClick={() => { setMenuOpen(false); onSelectCircle(c.id); }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', minHeight: 'var(--tap)', border: 'none', textAlign: 'left', cursor: 'pointer',
                      background: isActive ? 'var(--elev)' : 'transparent',
                      color: isActive ? 'var(--paper)' : 'var(--mute)',
                      fontSize: 'var(--fs-label)', fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: IDENTITY_COLORS[i % IDENTITY_COLORS.length] }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    {isActive && <span aria-hidden="true" style={{ fontSize: 'var(--fs-label)', color: 'var(--accent)' }}>✓</span>}
                  </button>
                );
              })}
              <div style={{ borderTop: '1px solid var(--rule)' }} />
            </>
          )}

          <div style={{ padding: '10px 14px 6px', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
            {clubhouseName ?? 'This clubhouse'}
          </div>
          {!active && (
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); navigate('/clubhouse'); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', minHeight: 'var(--tap)', border: 'none', textAlign: 'left', cursor: 'pointer',
                background: isClubhouseHome ? 'var(--elev)' : 'transparent',
                color: isClubhouseHome ? 'var(--paper)' : 'var(--mute)',
                fontSize: 'var(--fs-label)', fontWeight: isClubhouseHome ? 600 : 500,
              }}
            >
              <NavIconClubhouse size={18} />
              <span style={{ flex: 1 }}>Clubhouse hub</span>
              <UnreadDot count={unreadCount} />
            </button>
          )}
          {allComps.map(comp => {
            const isActive = active?.id === comp.id && active?.sport === comp.sport;
            const color = SPORT_COLOR[comp.sport] ?? 'var(--mute)';
            return (
              <button
                key={`${comp.sport}-${comp.id}`}
                role="menuitem"
                onClick={() => goToComp(comp)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', minHeight: 'var(--tap)', border: 'none', textAlign: 'left', cursor: 'pointer',
                  background: isActive ? 'var(--elev)' : 'transparent',
                  color: isActive ? 'var(--paper)' : 'var(--mute)',
                  fontSize: 'var(--fs-label)', fontWeight: isActive ? 600 : 500,
                }}
              >
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: color }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comp.name}</span>
                {isActive && <span aria-hidden="true" style={{ fontSize: 'var(--fs-label)', color: 'var(--accent)' }}>✓</span>}
              </button>
            );
          })}

          <div style={{ borderTop: '1px solid var(--rule)' }} />
          <button
            role="menuitem"
            onClick={() => { setMenuOpen(false); onAdd(); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', minHeight: 'var(--tap)', border: 'none', textAlign: 'left', cursor: 'pointer',
              background: 'transparent', color: 'var(--paper)',
              fontSize: 'var(--fs-label)', fontWeight: 500,
            }}
          >
            <span aria-hidden="true"><IconTrophy size={20} /></span>
            Add competition
          </button>
          {onInvite && (
            <button
              role="menuitem"
              onClick={() => { setMenuOpen(false); onInvite(); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 14px', border: 'none', borderTop: '1px solid var(--rule)',
                textAlign: 'left', cursor: 'pointer',
                background: 'transparent', color: 'var(--paper)',
                fontSize: 'var(--fs-label)', fontWeight: 500,
              }}
            >
              Invite to Clubhouse
            </button>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

/**
 * CompetitionNav — merged top-bar: a single "where am I" dropdown (this
 * Clubhouse + its competitions, plus a switcher to other Clubhouses) on row 1,
 * and the current sport's screen tabs (Live/Squad/Market/Digest, F1, Tennis)
 * on row 2. Replaces the old CompetitionTopBar (flat competition pill list)
 * and CompetitionScreenNav — same two rows, but row 1 is now a compact
 * dropdown instead of an ever-growing row of pills, and it works identically
 * on mobile and desktop (no separate mobile treatment needed).
 */
export function CompetitionNav({
  myCircles, activeCircleId, onSelectCircle,
  competitions, pathname, onAdd, onInvite, hasClubhouse = true, clubhouseName,
  paddockId, unreadCount = 0,
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const active = extractActiveCompId(pathname);
  const allComps = [
    ...(competitions.football ?? []).map(c => ({ ...c, sport: 'football' })),
    ...(competitions.f1      ?? []).map(c => ({ ...c, sport: 'f1' })),
    ...(competitions.tennis  ?? []).map(c => ({ ...c, sport: 'tennis' })),
  ];

  const activeComp = allComps.find(c => active && c.id === active.id && c.sport === active.sport);

  // ── Row 2: sport screen tabs ────────────────────────────────────────────
  const isFoot   = ['/live', '/squad', '/league', '/market', '/recap'].some(
    p => pathname === p || pathname.startsWith(p + '/')
  );
  const isF1     = pathname.startsWith('/f1');
  const isTennis = pathname.startsWith('/tennis');

  // Resolve the current league id for the tab bar: prefer the route (on
  // /league/:id), then the active competition pill, then whatever ?leagueId=
  // is already on the current URL — that last fallback is what keeps the id
  // alive once the user is *on* /squad?leagueId=X or /market?leagueId=X,
  // where the pathname alone no longer carries it (pathname-only derivation
  // used to drop the id here, silently sending the next tab click to the
  // bare /market or /live route and triggering the multi-league picker).
  const footballLeagueId =
    active?.sport === 'football' ? active.id
    : activeComp?.sport === 'football' ? activeComp.id
    : (isFoot ? searchParams.get('leagueId') : null);
  // Football: Squad/Market/Live live in the league's own tab row, so no second strip here.
  let screens = isFoot
    ? []
    : isF1 ? buildF1Screens(paddockId) : isTennis ? TENNIS_SCREENS : [];

  // Wishlist Draft tab — draft-mode football leagues only. Nested under
  // /league/:id/wishlist (unlike the other flat ?leagueId= screens), so it's
  // inserted with its own baked-in path rather than via carriesLeagueId.
  //
  // Looked up via footballLeagueId (not activeComp) deliberately: activeComp
  // only resolves when the pathname itself is /league/:id, so on the flat
  // /squad, /live, /market, /recap routes (reached via the query-string
  // fallback baked into footballLeagueId above) activeComp was always
  // undefined and this tab would vanish the moment the user left the league
  // hub — the "Wishlist tab disappears when switching tabs" bug.
  const draftLeagueComp = footballLeagueId
    ? allComps.find(c => c.sport === 'football' && c.id === footballLeagueId)
    : null;
  const isDraftLeague = draftLeagueComp?.format === 'noduplicate';
  if (isFoot && isDraftLeague && footballLeagueId) {
    const wishlistPath = `/league/${footballLeagueId}/wishlist`;
    screens = [{ key: 'wishlist', label: 'Wishlist', path: wishlistPath, href: wishlistPath, Icon: NavIconWishlist }];
  }
  const activeColor = isF1 ? 'var(--f1)' : isTennis ? 'var(--ten)' : 'var(--accent)';
  const homePath     = isFoot ? null : isF1 ? (paddockId ? `/f1/${paddockId}` : '/f1') : '/tennis';

  return (
    <>
      {/* ── Row 1: clubhouse + competition dropdown ── */}
      <div
        role="navigation"
        aria-label="Clubhouse and competition"
        className="lg:hidden"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '1px solid var(--rule)',
          background: 'var(--card)',
          padding: '10px 16px',
          flexShrink: 0,
        }}
      >
        <ClubhouseSwitcher
          myCircles={myCircles} activeCircleId={activeCircleId} onSelectCircle={onSelectCircle}
          competitions={competitions} pathname={pathname} onAdd={onAdd} onInvite={onInvite}
          clubhouseName={clubhouseName} unreadCount={unreadCount} grow
        />

        <button
          onClick={hasClubhouse ? onAdd : () => navigate('/home')}
          title={hasClubhouse ? 'New competition' : 'Create a Clubhouse first'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, flexShrink: 0,
            background: 'var(--accent-soft)', border: '1px solid var(--accent)',
            borderRadius: 20, cursor: 'pointer',
            fontSize: 'var(--fs-body-lg)', fontWeight: 700, lineHeight: 1,
            color: 'var(--accent)',
          }}
        >+</button>
      </div>

      {/* ── Row 2: sport screen tabs ── */}
      {screens.length > 0 && (
        <div
          role="navigation"
          aria-label="Sport screens"
          style={{
            display: 'flex', alignItems: 'stretch',
            borderBottom: '1px solid var(--rule)',
            background: 'var(--bg)',
            overflowX: 'auto', scrollbarWidth: 'none',
            minHeight: 44, flexShrink: 0,
          }}
        >
          {screens.map(({ key, label, path, href, Icon, isLive }) => {
            const isActive =
              pathname === path ||
              (path !== homePath && pathname.startsWith(path + '/'));
            const liveColor = 'var(--danger)';
            const color = isActive ? (isLive ? liveColor : activeColor) : 'var(--mute)';

            return (
              <button
                key={key}
                onClick={() => navigate(href ?? path)}
                style={{
                  flexShrink: 0,
                  padding: '0 14px',
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'transparent', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                  borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
                  fontFamily: 'Archivo, sans-serif',
                  fontSize: 'var(--fs-label)', fontWeight: 700,
                  color,
                  whiteSpace: 'nowrap', cursor: 'pointer',
                  transition: 'color .12s',
                }}
              >
                {Icon && <Icon size={13} />}
                {label}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
