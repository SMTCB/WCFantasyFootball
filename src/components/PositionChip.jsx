const POS_TONE = {
  GK:  'var(--pos-gk)',
  DEF: 'var(--pos-def)',
  MID: 'var(--pos-mid)',
  FWD: 'var(--pos-fwd)',
};

/**
 * Outlined rectangle, position-tinted.
 * empty=true renders the empty-slot variant with a dashed border and "+" content.
 */
export default function PositionChip({ pos, empty = false, mobile = false }) {
  const color = POS_TONE[pos] ?? 'var(--mute)';

  return (
    <div
      style={{
        width:          mobile ? 30 : 42,
        height:         mobile ? 16 : 22,
        border:         `1px ${empty ? 'dashed' : 'solid'} ${color}`,
        color,
        fontFamily:     'Archivo Black, sans-serif',
        fontSize:       mobile ? 8 : 10,
        fontWeight:     900,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        letterSpacing:  '0.04em',
        flexShrink:     0,
        textTransform:  'uppercase',
      }}
    >
      {empty ? '+' : pos}
    </div>
  );
}
