export default function PowerToolCard({
  label,
  description,
  isActive = false,
  accentColor = 'var(--cyan)',
  onAction,
  actionLabel,
}) {
  return (
    <button
      onClick={onAction}
      className="w-full h-full min-h-[90px] border transition-all duration-200 active:scale-95"
      style={{
        background:     isActive ? `color-mix(in srgb, ${accentColor} 8%, var(--ink-2))` : 'var(--ink-2)',
        border:         `1px solid ${isActive ? accentColor : 'var(--rule)'}`,
        padding:        '12px',
        display:        'flex',
        flexDirection:  'column',
        alignItems:     'flex-start',
        justifyContent: 'space-between',
        gap:            '8px',
        cursor:         'pointer',
        position:       'relative',
        borderRadius:   0,
      }}
    >
      {/* Active dot */}
      {isActive && (
        <div
          className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full animate-live-pulse"
          style={{ background: accentColor }}
        />
      )}

      {/* Label */}
      <div
        className="fk-display"
        style={{ fontSize: 11, color: isActive ? accentColor : 'var(--paper)', letterSpacing: '-0.01em' }}
      >
        {label.toUpperCase()}
      </div>

      {/* Description */}
      {description && (
        <div style={{ fontSize: 9, color: 'var(--mute)', lineHeight: 1.4, fontFamily: 'Archivo, sans-serif' }}>
          {description}
        </div>
      )}

      {/* Action label */}
      {actionLabel && (
        <div
          className="fk-mono"
          style={{ fontSize: 8, color: isActive ? accentColor : 'var(--mute)', letterSpacing: '0.18em' }}
        >
          {isActive ? 'ACTIVE' : actionLabel.toUpperCase()}
        </div>
      )}
    </button>
  );
}
