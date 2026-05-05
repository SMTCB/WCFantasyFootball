/**
 * Gold captain pill — always inline next to the player name.
 * triple=true renders "3×C" for Triple Captain.
 */
export default function CaptainPill({ triple = false }) {
  return (
    <span
      style={{
        fontFamily:    'Archivo Black, sans-serif',
        fontSize:      9,
        fontWeight:    900,
        background:    'var(--gold)',
        color:         'var(--ink)',
        padding:       '2px 6px',
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        flexShrink:    0,
        lineHeight:    1,
      }}
    >
      {triple ? '3×C' : 'C'}
    </span>
  );
}
