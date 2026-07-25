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
  fontSize: 12, fontWeight: 600,
  padding: '0 10px', height: '100%',
  border: 'none', borderBottom: '2px solid transparent',
  background: 'transparent', cursor: 'pointer',
  whiteSpace: 'nowrap', flexShrink: 0,
  transition: 'color .12s, border-color .12s',
};

export function CompetitionTopBar({ competitions, pathname, onAdd }) {
  const navigate = useNavigate();
  const active = extractActiveCompId(pathname);
  const isClubhouseHome = /^\/clubhouse(\/[^/]+)?$/.test(pathname);

  const allComps = [
    ...(competitions.football ?? []).map(c => ({ ...c, sport: 'football', href: `/league/${c.id}` })),
    ...(competitions.f1      ?? []).map(c => ({ ...c, sport: 'f1',       href: `/f1/${c.id}` })),
    ...(competitions.tennis  ?? []).map(c => ({ ...c, sport: 'tennis',   href: `/tennis/tournament/${c.id}` })),
  ];

  return (
    <div
      role="navigation"
      aria-label="Competitions"
      style={{
        display: 'flex', alignItems: 'stretch', gap: 6,
        borderBottom: '1px solid var(--rule)',
        background: 'var(--card)',
        padding: '0 16px',
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
        <span aria-hidden="true">🏠</span>Clubhouse
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

      {/* + Add competition */}
      <button
        onClick={onAdd}
        title="Add competition"
        style={{
          marginLeft: 'auto',
          flexShrink: 0,
          padding: '0 0 0 10px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--mute)',
          lineHeight: 1,
          transition: 'color .12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--paper)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--mute)'; }}
      >
        +
      </button>
    </div>
  );
}
