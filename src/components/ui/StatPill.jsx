const TONES = {
  neutral: ['var(--raised)', 'var(--ink-soft)'],
  accent:  ['var(--accent-soft)', 'var(--accent)'],
  good:    ['var(--good-soft)', 'var(--good)'],
  warn:    ['var(--gold-soft)', 'var(--gold-text)'],
  crit:    ['var(--crit-soft)', 'var(--crit)'],
};

/** Small status chip (e.g. "Gameweek 3", "Doubt", "Free agent"). Sentence case, 13px. */
export default function StatPill({ tone = 'neutral', children, style }) {
  const [bg, fg] = TONES[tone] ?? TONES.neutral;
  return (
    <span
      className="num"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 10px', borderRadius: 20,
        background: bg, color: fg,
        fontSize: 'var(--fs-label)', fontWeight: 600, whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
