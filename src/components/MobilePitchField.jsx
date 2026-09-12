import { buildPitchTokens, STATUS_COLOR } from '../lib/pitchLayout';
import NumberFlow from './motion/NumberFlow';

/**
 * MobilePitchField — Concept A ("Tap-to-Expand Pitch") mobile field view.
 *
 * Unlike PitchView's desktop card token (148px, falls back to a stripped-down
 * compact pill once a row's spacing gets tight — which is effectively always
 * true at phone widths), this token is designed mobile-first at a fixed small
 * footprint, so it never needs a width-triggered fallback. Tapping a token
 * calls onPlayerClick, which SquadScreen wires to the same player action
 * bottom sheet used everywhere else in the squad screen.
 *
 * `ClubCrest` is passed in as a prop (rather than imported directly) because
 * SquadScreen already imports it at depth 1 — importing the same module again
 * here, at depth 2, is the Rolldown TDZ crash pattern documented in CLAUDE.md.
 */
export default function MobilePitchField({ squad, onPlayerClick, selectedPlayerId, matchdayLabel = '', ClubCrest }) {
  const { tokens, formation } = buildPitchTokens(squad.players, squad.captainId);

  return (
    <div
      data-testid="mobile-pitch-field"
      data-tour="squad-pitch-mobile"
      style={{ position: 'relative', width: '100%', aspectRatio: '3 / 4', background: '#2a5035', padding: '16px 12px 18px' }}
    >
      <div
        style={{
          position:     'absolute',
          inset:        '16px 12px 18px',
          background:   'linear-gradient(180deg, #3d6e4a 0%, #2a5035 100%)',
          borderRadius: 10,
          overflow:     'hidden',
          boxShadow:    'inset 0 0 0 1px var(--rule)',
        }}
      >
        {/* Lane lines */}
        {[22, 46, 70, 92].map(y => (
          <div key={y} style={{ position: 'absolute', left: 12, right: 12, top: `${y}%`, height: 1, background: 'var(--shell-fill-active)' }} />
        ))}

        {/* Halfway line + centre circle */}
        <div style={{ position: 'absolute', left: '8%', right: '8%', top: '50%', height: 1, background: 'var(--shell-fill-active)' }} />
        <div style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
          width: 104, height: 104, borderRadius: '50%', border: '1px solid var(--shell-rule-emphasis)',
        }} />

        {/* Fixture context strip */}
        <div style={{ position: 'absolute', top: 10, left: 10, right: 10, display: 'flex', justifyContent: 'space-between', zIndex: 5, pointerEvents: 'none' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.18em' }}>
            XI · {formation}
          </div>
          {matchdayLabel && (
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '.18em' }}>
              {matchdayLabel}
            </div>
          )}
        </div>

        {/* Player tokens */}
        {tokens.map(({ player, no, x, y, isCaptain }) => {
          const surname   = player.name?.split(' ').slice(-1)[0]?.toUpperCase() ?? player.name?.toUpperCase() ?? '?';
          const pts       = Math.round(player.points ?? 0);
          const sc        = STATUS_COLOR[player.intel?.status] ?? 'var(--positive)';
          const isSelected = selectedPlayerId === player.id;
          const posColor = player.position === 'GK' ? 'var(--pos-gk)'
            : player.position === 'DEF' ? 'var(--pos-def)'
            : player.position === 'MID' ? 'var(--pos-mid)'
            : 'var(--pos-fwd)';

          return (
            <div
              key={player.id}
              data-testid={`mobile-pitch-token-${player.id}`}
              onClick={() => (onPlayerClick ?? (() => {}))(player)}
              style={{
                position: 'absolute', left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                cursor: 'pointer', zIndex: 10, userSelect: 'none',
              }}
            >
              <div style={{ position: 'relative' }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9,
                  background: 'var(--card)',
                  border: `2px solid ${isSelected ? 'var(--cyan)' : posColor}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Archivo Black, sans-serif', fontSize: 13,
                  color: isSelected ? 'var(--cyan)' : posColor,
                }}>
                  {no}
                </div>
                <div style={{
                  position: 'absolute', bottom: -2, right: -2,
                  width: 9, height: 9, borderRadius: '50%',
                  background: sc, border: '1.5px solid var(--ink)',
                }} />
                {isCaptain && (
                  <div style={{
                    position: 'absolute', top: -5, left: -5,
                    width: 15, height: 15, borderRadius: '50%',
                    background: 'var(--gold)', color: 'var(--ink)',
                    fontFamily: 'Archivo Black, sans-serif', fontSize: 9,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1.5px solid var(--ink)',
                  }}>C</div>
                )}
                {ClubCrest && (
                  <div style={{
                    position: 'absolute', top: -5, right: -5,
                    borderRadius: '50%', background: 'var(--ink)',
                    border: '1.5px solid var(--ink)', lineHeight: 0,
                  }}>
                    <ClubCrest name={player.club} size={13} />
                  </div>
                )}
              </div>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                background: 'var(--card)', border: '1px solid var(--rule)', padding: '2px 5px 3px', borderRadius: 3,
                maxWidth: 68,
              }}>
                <div style={{
                  fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)',
                  letterSpacing: '-0.01em', color: 'var(--paper)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
                }}>
                  {surname}
                </div>
                <div style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)',
                  color: pts > 0 ? 'var(--positive)' : 'var(--mute)', letterSpacing: '.06em',
                }}>
                  <NumberFlow
                    value={player.points ?? 0}
                    format={(n) => { const r = Math.round(n); return r > 0 ? `+${r}` : '—'; }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
