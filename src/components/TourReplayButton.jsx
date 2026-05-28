// src/components/TourReplayButton.jsx
/**
 * TourReplayButton — branded replay button for onboarding tours.
 * Renders a fixed-position pill (bottom-right of the viewport content area)
 * that fires onReplay() when clicked. Only renders when onReplay is provided.
 *
 * Used by: CommissionerPanel, BetsTabHub
 */

const MONO = "'JetBrains Mono', monospace";

export default function TourReplayButton({ onReplay, label = 'REPLAY GUIDE' }) {
  if (!onReplay) return null;

  return (
    <button
      onClick={onReplay}
      title="Replay the commissioner guide"
      style={{
        position:      'fixed',
        bottom:        88,          // above bottom nav bar (~72px)
        right:         20,
        zIndex:        200,
        display:       'flex',
        alignItems:    'center',
        gap:           8,
        padding:       '8px 14px 8px 10px',
        background:    'var(--ink-2)',
        border:        '1px solid rgba(224,168,0,0.45)',
        borderRadius:  '999px',
        cursor:        'pointer',
        boxShadow:     '0 4px 20px rgba(0,0,0,0.5)',
        transition:    'border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(224,168,0,0.08)';
        e.currentTarget.style.borderColor = 'rgba(224,168,0,0.8)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--ink-2)';
        e.currentTarget.style.borderColor = 'rgba(224,168,0,0.45)';
      }}
    >
      {/* Gold circle with ? glyph */}
      <span style={{
        width:         20,
        height:        20,
        borderRadius:  '50%',
        background:    'rgba(224,168,0,0.15)',
        border:        '1px solid rgba(224,168,0,0.6)',
        color:         'var(--gold)',
        fontFamily:    MONO,
        fontSize:      11,
        fontWeight:    700,
        display:       'flex',
        alignItems:    'center',
        justifyContent: 'center',
        flexShrink:    0,
        lineHeight:    1,
      }}>?</span>

      {/* Label */}
      <span style={{
        fontFamily:    MONO,
        fontSize:      9,
        letterSpacing: '.2em',
        color:         'var(--gold)',
        fontWeight:    600,
        whiteSpace:    'nowrap',
      }}>{label}</span>
    </button>
  );
}
