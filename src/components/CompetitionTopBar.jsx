import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

const SPORT_COLOR = {
  football: 'var(--accent)',
  f1: 'var(--f1)',
  tennis: 'var(--ten)',
};

function extractActiveCompId(pathname) {
  const leagueMatch = pathname.match(/^\/league\/([^/]+)/);
  if (leagueMatch) return { id: leagueMatch[1], sport: 'football' };
  const f1Match = pathname.match(/^\/f1\/([^/]+)/);
  if (f1Match) return { id: f1Match[1], sport: 'f1' };
  const tennisMatch = pathname.match(/^\/tennis\/tournament\/([^/]+)/);
  if (tennisMatch) return { id: tennisMatch[1], sport: 'tennis' };
  return null;
}

const PILL_STYLE = {
  display: 'flex', alignItems: 'center', gap: 7,
  fontSize: 'var(--fs-label)', fontWeight: 600,
  padding: '0 10px', height: '100%',
  border: 'none', borderBottom: '2px solid transparent',
  background: 'transparent', cursor: 'pointer',
  whiteSpace: 'nowrap', flexShrink: 0,
  transition: 'color .12s, border-color .12s',
};

export function CompetitionTopBar({ competitions, pathname, onAdd, onInvite, hasClubhouse = true, clubhouseName }) {
  const navigate = useNavigate();
  const active = extractActiveCompId(pathname);
  const isClubhouseHome = /^\/clubhouse(\/[^/]+)?$/.test(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const buttonRef = useRef(null);
  const dropdownRef = useRef(null);

  // Menu is portaled to document.body (position: fixed, computed from the
  // button's rect) rather than rendered inline — this row sets overflowX:'auto'
  // for horizontal pill-scrolling, which per the CSS spec forces its overflowY
  // to compute to 'auto' too, silently clipping an inline absolutely-positioned
  // dropdown that pops out below it.
  const openMenu = () => {
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
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
    ...(competitions.football ?? []).map(c => ({ ...c, sport: 'football', href: `/league/${c.id}` })),
    ...(competitions.f1      ?? []).map(c => ({ ...c, sport: 'f1',       href: `/f1/${c.id}` })),
    ...(competitions.tennis  ?? []).map(c => ({ ...c, sport: 'tennis',   href: `/tennis/tournament/${c.id}` })),
  ];

  return (
    <>
    <div
      role="navigation"
      aria-label="Competitions"
      style={{
        display: 'flex', alignItems: 'stretch', gap: 6,
        borderBottom: '1px solid var(--rule)',
        background: 'var(--card)',
        padding: '12px 16px 0',
        overflowX: 'auto', scrollbarWidth: 'none',
        minHeight: 40, flexShrink: 0,
      }}
    >
      <button
        onClick={() => navigate('/clubhouse')}
        style={{
          ...PILL_STYLE,
          padding: '0 10px 0 0',
          color: isClubhouseHome ? 'var(--accent)' : 'var(--mute)',
          borderBottomColor: isClubhouseHome ? 'var(--accent)' : 'transparent',
        }}
      >
        <span aria-hidden="true">🏠</span>{clubhouseName ?? 'Clubhouse'}
      </button>

      {allComps.map(comp => {
        const isActive = active?.id === comp.id && active?.sport === comp.sport;
        const color = SPORT_COLOR[comp.sport] ?? 'var(--mute)';
        return (
          <button
            key={`${comp.sport}-${comp.id}`}
            onClick={() => navigate(comp.href)}
            style={{
              ...PILL_STYLE,
              color: isActive ? 'var(--paper)' : 'var(--mute)',
              borderBottomColor: isActive ? color : 'transparent',
            }}
          >
            <span style={{
              display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
              background: color, flexShrink: 0,
            }} />
            {comp.name}
          </button>
        );
      })}

      {/* Add / Invite menu — a competition must always belong to a Clubhouse, so
          without one this button redirects to Clubhouse creation instead of opening
          the dropdown. Once inside a Clubhouse, this is the persistent, always-visible
          entry point for both "new competition" and "invite people" (the equivalent
          empty-state buttons on ClubhouseScreen disappear once content exists). */}
      <div style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0, alignSelf: 'center' }}>
        <button
          ref={buttonRef}
          onClick={hasClubhouse ? () => (menuOpen ? setMenuOpen(false) : openMenu()) : () => navigate('/home')}
          title={hasClubhouse ? 'Add competition or invite people' : 'Create a Clubhouse first'}
          aria-haspopup={hasClubhouse ? 'menu' : undefined}
          aria-expanded={hasClubhouse ? menuOpen : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px',
            background: menuOpen ? 'var(--accent)' : 'var(--accent-bg)',
            border: '1px solid var(--accent)',
            borderRadius: 20,
            cursor: 'pointer',
            fontSize: 'var(--fs-label)', fontWeight: 700,
            color: menuOpen ? '#0a0e14' : 'var(--accent)',
            lineHeight: 1,
            transition: 'background .12s, color .12s',
          }}
        >
          <span aria-hidden="true" style={{ fontSize: 'var(--fs-body-lg)', lineHeight: 1 }}>+</span>
          Add
        </button>
      </div>
    </div>

    {menuOpen && hasClubhouse && menuPos && createPortal(
      <div
        ref={dropdownRef}
        role="menu"
        style={{
          position: 'fixed', top: menuPos.top, right: menuPos.right,
          background: 'var(--card)', border: '1px solid var(--rule)',
          borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.25)', zIndex: 9999,
          overflow: 'hidden', minWidth: 200,
        }}
      >
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
    </>
  );
}
