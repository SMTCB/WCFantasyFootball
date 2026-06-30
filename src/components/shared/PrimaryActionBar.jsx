import { createPortal } from 'react-dom';

const MONO = 'JetBrains Mono, monospace';
const DISP = 'Archivo Black, sans-serif';

/**
 * Thumb-zone primary action bar — floats above the 64px mobile bottom nav.
 * Portaled to document.body (escapes AppLayout's iOS stacking-context trap).
 * Hidden on desktop via `lg:hidden` (Tailwind CSS is global, works in portals).
 *
 * Props:
 *   label     - the exact action to take, e.g. "Set your GW13 squad"
 *   countdown - optional deadline string, e.g. "2d 4h left"
 *   state     - 'action' (filled, urgent) | 'done' (muted, green check) | 'locked' (muted, lock)
 *   onPress   - callback when tapped (no-op in done/locked state)
 *   accent    - sport color for the action state, e.g. "var(--accent)"
 *
 * This phase (M0) only **builds** the primitive. Wire it into screens in M3.
 */
export default function PrimaryActionBar({
  label,
  countdown,
  state = 'action',
  onPress,
  accent = 'var(--accent)',
}) {
  const isDone   = state === 'done';
  const isLocked = state === 'locked';
  const isAction = !isDone && !isLocked;

  const bg = isAction
    ? accent
    : 'var(--elev)';

  const textColor = isAction ? '#fff' : 'var(--mute)';

  const stateIcon = isDone ? '✓' : isLocked ? '🔒' : null;

  const bar = (
    <div
      className="lg:hidden"
      style={{
        position: 'fixed',
        bottom:   'calc(64px + env(safe-area-inset-bottom))',
        left:     0,
        right:    0,
        zIndex:   49,
        padding:  '0 12px 8px',
        pointerEvents: 'none',
      }}
    >
      <button
        type="button"
        disabled={!isAction}
        onClick={isAction ? onPress : undefined}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          width:          '100%',
          minHeight:      '56px',
          padding:        '12px 20px',
          borderRadius:   '8px',
          border:         'none',
          background:     bg,
          cursor:         isAction ? 'pointer' : 'default',
          pointerEvents:  'auto',
          boxShadow:      isAction ? '0 4px 24px rgba(0,0,0,0.18)' : 'none',
          transition:     'background 0.2s ease, box-shadow 0.2s ease',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* Left: state icon + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {stateIcon && (
            <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{stateIcon}</span>
          )}
          <span
            style={{
              fontFamily: DISP,
              fontSize:   13,
              color:      textColor,
              letterSpacing: '-0.01em',
              whiteSpace: 'nowrap',
              overflow:   'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {label}
          </span>
        </div>

        {/* Right: countdown or arrow */}
        {isAction && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 12 }}>
            {countdown && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
                {countdown}
              </span>
            )}
            <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16, lineHeight: 1 }}>→</span>
          </div>
        )}
      </button>
    </div>
  );

  return createPortal(bar, document.body);
}
