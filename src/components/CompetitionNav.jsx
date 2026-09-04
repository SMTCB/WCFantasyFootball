import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSport } from '../context/SportContext';
import {
  NavIconLive,
  NavIconSquad,
  NavIconMarket,
  NavIconRecap,
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

const FOOTBALL_SCREENS = [
  { key: 'live',   label: 'LIVE',   path: '/live',   Icon: NavIconLive,      isLive: true },
  { key: 'squad',  label: 'SQUAD',  path: '/squad',  Icon: NavIconSquad              },
  { key: 'market', label: 'MARKET', path: '/market', Icon: NavIconMarket             },
  // "Digest" here is the cross-league activity feed (RecapScreen, internally
  // "MY DIGEST") — kept as a distinct label from the in-league "Recap" tab
  // further down the screen (LeagueScreen's HubTabs) so the two aren't confused.
  { key: 'digest', label: 'DIGEST', path: '/recap',  Icon: NavIconRecap              },
];

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
  paddockId,
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
    setMenuPos({ top: rect.bottom + 6, left: rect.left });
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

  // ── Row 2: sport screen tabs ────────────────────────────────────────────
  const isFoot   = ['/live', '/squad', '/league', '/market', '/recap'].some(
    p => pathname === p || pathname.startsWith(p + '/')
  );
  const isF1     = pathname.startsWith('/f1');
  const isTennis = pathname.startsWith('/tennis');

  // SQUAD and MARKET are per-league screens — carry the current league across
  // tabs via the resolved competition id (route-derived when on /league/:id,
  // otherwise whatever the active competition pill resolves to) so switching
  // tabs never drops it. LIVE and DIGEST are cross-league views and take none.
  const footballLeagueId = active?.sport === 'football' ? active.id : activeComp?.sport === 'football' ? activeComp.id : null;
  const screens = isFoot
    ? FOOTBALL_SCREENS.map(s =>
        footballLeagueId && (s.key === 'squad' || s.key === 'market')
          ? { ...s, href: `${s.path}?leagueId=${footballLeagueId}` }
          : s
      )
    : isF1 ? buildF1Screens(paddockId) : isTennis ? TENNIS_SCREENS : [];
  const activeColor = isF1 ? 'var(--f1)' : isTennis ? 'var(--ten)' : 'var(--accent)';
  const homePath     = isFoot ? null : isF1 ? (paddockId ? `/f1/${paddockId}` : '/f1') : '/tennis';

  return (
    <>
      {/* ── Row 1: clubhouse + competition dropdown ── */}
      <div
        role="navigation"
        aria-label="Clubhouse and competition"
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          borderBottom: '1px solid var(--rule)',
          background: 'var(--card)',
          padding: '10px 16px',
          flexShrink: 0,
        }}
      >
        <button
          ref={buttonRef}
          onClick={() => (menuOpen ? setMenuOpen(false) : openMenu())}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            minWidth: 0, flex: '1 1 auto',
            padding: '6px 10px', borderRadius: 7,
            background: menuOpen ? 'var(--shell-fill-strong, rgba(255,255,255,0.08))' : 'transparent',
            border: '1px solid var(--rule)',
            cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span aria-hidden="true">🏠</span>
          <span style={{
            minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--paper)',
          }}>
            {clubhouseName ?? 'Clubhouse'}
          </span>
          {activeComp && (
            <>
              <span aria-hidden="true" style={{ color: 'var(--mute)', flexShrink: 0 }}>›</span>
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
          <span aria-hidden="true" style={{ marginLeft: 'auto', fontSize: 'var(--fs-micro)', opacity: 0.6, color: 'var(--mute)', transform: menuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .12s', flexShrink: 0 }}>⌄</span>
        </button>

        <button
          onClick={hasClubhouse ? onAdd : () => navigate('/home')}
          title={hasClubhouse ? 'New competition' : 'Create a Clubhouse first'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, flexShrink: 0,
            background: 'var(--accent-bg)', border: '1px solid var(--accent)',
            borderRadius: 20, cursor: 'pointer',
            fontSize: 'var(--fs-body-lg)', fontWeight: 700, lineHeight: 1,
            color: 'var(--accent)',
          }}
        >+</button>
      </div>

      {menuOpen && menuPos && createPortal(
        <div
          ref={dropdownRef}
          role="menu"
          style={{
            position: 'fixed', top: menuPos.top, left: menuPos.left,
            background: 'var(--card)', border: '1px solid var(--rule)',
            borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 9999,
            overflow: 'hidden', width: 260, maxHeight: '70vh', overflowY: 'auto',
          }}
        >
          {myCircles.length > 1 && (
            <>
              <div style={{ padding: '9px 14px 5px', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '.16em', color: 'var(--mute)' }}>
                YOUR CLUBHOUSES
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
                      padding: '8px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
                      background: isActive ? 'var(--shell-fill-strong, rgba(255,255,255,0.08))' : 'transparent',
                      color: isActive ? 'var(--paper)' : 'var(--mute)',
                      fontSize: 'var(--fs-label)', fontWeight: isActive ? 600 : 500,
                    }}
                  >
                    <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: IDENTITY_COLORS[i % IDENTITY_COLORS.length] }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    {isActive && <span aria-hidden="true" style={{ fontSize: 'var(--fs-micro)', color: 'var(--accent)' }}>✓</span>}
                  </button>
                );
              })}
              <div style={{ borderTop: '1px solid var(--rule)' }} />
            </>
          )}

          <div style={{ padding: '9px 14px 5px', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '.16em', color: 'var(--mute)' }}>
            {(clubhouseName ?? 'THIS CLUBHOUSE').toUpperCase()}
          </div>
          <button
            role="menuitem"
            onClick={() => { setMenuOpen(false); navigate('/clubhouse'); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
              background: isClubhouseHome ? 'var(--shell-fill-strong, rgba(255,255,255,0.08))' : 'transparent',
              color: isClubhouseHome ? 'var(--paper)' : 'var(--mute)',
              fontSize: 'var(--fs-label)', fontWeight: isClubhouseHome ? 600 : 500,
            }}
          >
            <span aria-hidden="true">🏠</span>
            Frontpage
          </button>
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
                  padding: '8px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
                  background: isActive ? 'var(--shell-fill-strong, rgba(255,255,255,0.08))' : 'transparent',
                  color: isActive ? 'var(--paper)' : 'var(--mute)',
                  fontSize: 'var(--fs-label)', fontWeight: isActive ? 600 : 500,
                }}
              >
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: color }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{comp.name}</span>
                {isActive && <span aria-hidden="true" style={{ fontSize: 'var(--fs-micro)', color: 'var(--accent)' }}>✓</span>}
              </button>
            );
          })}

          <div style={{ borderTop: '1px solid var(--rule)' }} />
          <button
            role="menuitem"
            onClick={() => { setMenuOpen(false); onAdd(); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', border: 'none', textAlign: 'left', cursor: 'pointer',
              background: 'transparent', color: 'var(--paper)',
              fontSize: 'var(--fs-label)', fontWeight: 500,
            }}
          >
            <span aria-hidden="true">🏆</span>
            New competition
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
              <span aria-hidden="true">💬</span>
              Invite to Clubhouse
            </button>
          )}
        </div>,
        document.body
      )}

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
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.12em',
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
