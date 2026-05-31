import { useState, useCallback } from 'react';
import DigestView from './DigestView';
import RecapView from './RecapView';
import { MONO } from './HubConstants';

export default function RecapContainer({ leagueId, tournamentId, members, currentUser, onNavigateToLeague }) {
  const [mode, setMode] = useState('digest');

  const handleSelectLeague = useCallback((id) => {
    setMode('league');
    if (id !== leagueId) onNavigateToLeague?.(id);
  }, [leagueId, onNavigateToLeague]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '10px 20px',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--ink)', flexShrink: 0,
      }}>
        {[
          { key: 'digest', label: 'MY DIGEST' },
          { key: 'league', label: 'THIS LEAGUE' },
        ].map(({ key, label }) => {
          const active = mode === key;
          return (
            <button
              key={key}
              onClick={() => setMode(key)}
              style={{
                padding: '4px 12px',
                border: active ? '1px solid var(--cyan)' : '1px solid var(--rule)',
                background: active ? 'rgba(0,180,216,.14)' : 'transparent',
                color: active ? 'var(--cyan)' : 'var(--mute)',
                fontFamily: MONO, fontSize: 10, letterSpacing: '.12em',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {mode === 'digest' ? (
        <DigestView onSelectLeague={handleSelectLeague} />
      ) : (
        <RecapView
          leagueId={leagueId}
          tournamentId={tournamentId}
          members={members}
          currentUser={currentUser}
        />
      )}
    </div>
  );
}
