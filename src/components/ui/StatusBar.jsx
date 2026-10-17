const TONES = {
  good: ['var(--good-soft)', 'var(--good)'],
  warn: ['var(--gold-soft)', 'var(--gold-text)'],
  crit: ['var(--crit-soft)', 'var(--crit)'],
  info: ['var(--accent-soft)', 'var(--accent)'],
};

/** One-line status strip (transfer window, deadline, live). Replaces stacked banners. */
export default function StatusBar({ tone = 'info', icon = null, children, action = null, style }) {
  const [bg, fg] = TONES[tone] ?? TONES.info;
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 16px', minHeight: 'var(--tap)',
        background: bg, color: fg,
        fontSize: 'var(--fs-label)', fontWeight: 600,
        ...style,
      }}
    >
      {icon}
      <span style={{ flex: 1, minWidth: 0 }}>{children}</span>
      {action}
    </div>
  );
}
