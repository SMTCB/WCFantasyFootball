const STATUS_COLOR = {
  fit:   'var(--positive)',
  doubt: 'var(--gold)',
  out:   'var(--danger)',
};

const STATUS_LABEL = {
  fit:   'AVAILABLE',
  doubt: 'DOUBTFUL',
  out:   'INJURED',
};

/**
 * Coloured dot + optional word label.
 * status: 'fit' | 'doubt' | 'out'
 */
export default function StatusDot({ status = 'fit', showLabel = false, mobile = false }) {
  const color = STATUS_COLOR[status] ?? STATUS_COLOR.fit;
  const size  = mobile ? 6 : 8;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <span
        style={{
          width:        size,
          height:       size,
          borderRadius: '50%',
          background:   color,
          display:      'inline-block',
          flexShrink:   0,
        }}
      />
      {showLabel && (
        <span
          style={{
            fontFamily:    'JetBrains Mono, monospace',
            fontSize:      9,
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
            color,
          }}
        >
          {STATUS_LABEL[status] ?? status.toUpperCase()}
        </span>
      )}
    </span>
  );
}

export { STATUS_COLOR, STATUS_LABEL };
