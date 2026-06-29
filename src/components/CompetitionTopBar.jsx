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

export function CompetitionTopBar({ competitions, pathname }) {
  const navigate = useNavigate();
  const active = extractActiveCompId(pathname);

  const allComps = [
    ...(competitions.football ?? []).map(c => ({ ...c, sport: 'football', href: `/league/${c.id}` })),
    ...(competitions.f1      ?? []).map(c => ({ ...c, sport: 'f1',       href: `/f1/${c.id}` })),
    ...(competitions.tennis  ?? []).map(c => ({ ...c, sport: 'tennis',   href: `/tennis/tournament/${c.id}` })),
  ];

  if (allComps.length === 0) return null;

  return (
    <div
      role="navigation"
      aria-label="Competitions"
      style={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--card)',
        overflowX: 'auto', scrollbarWidth: 'none',
        minHeight: 40, flexShrink: 0,
      }}
    >
      {allComps.map(comp => {
        const isActive = active?.id === comp.id && active?.sport === comp.sport;
        const color = SPORT_COLOR[comp.sport] ?? 'var(--mute)';
        return (
          <button
            key={`${comp.sport}-${comp.id}`}
            onClick={() => navigate(comp.href)}
            style={{
              flexShrink: 0,
              padding: '0 16px',
              borderRight: '1px solid var(--rule)',
              borderBottom: isActive ? `2px solid ${color}` : '2px solid transparent',
              borderTop: 'none', borderLeft: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              color: isActive ? color : 'var(--mute)',
              whiteSpace: 'nowrap',
              transition: 'color .12s',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <span style={{
              display: 'inline-block', width: 5, height: 5, borderRadius: '50%',
              background: color, opacity: isActive ? 1 : 0.5, flexShrink: 0,
            }} />
            {comp.name}
          </button>
        );
      })}

      {/* + Add competition — Phase B placeholder */}
      <button
        disabled
        title="Add competition — coming soon"
        style={{
          flexShrink: 0,
          padding: '0 14px',
          background: 'transparent',
          border: 'none',
          borderBottom: '2px solid transparent',
          cursor: 'not-allowed',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 16,
          color: 'var(--rule)',
          lineHeight: 1,
        }}
      >
        +
      </button>
    </div>
  );
}
