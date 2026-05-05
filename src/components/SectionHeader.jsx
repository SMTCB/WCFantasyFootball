const TONE = {
  cyan:   'var(--pos-def)',
  gold:   'var(--gold)',
  purple: 'var(--pos-gk)',
  red:    'var(--danger)',
  gk:     'var(--pos-gk)',
  def:    'var(--pos-def)',
  mid:    'var(--pos-mid)',
  fwd:    'var(--pos-fwd)',
};

export default function SectionHeader({ title, action, accent = 'cyan', count }) {
  const color = TONE[accent] ?? TONE.cyan;

  return (
    <div
      className="flex items-center gap-2.5 px-4 py-2"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      {/* 3px position-tone tab */}
      <div
        className="shrink-0"
        style={{ width: 3, height: 14, background: color }}
      />

      <span
        className="fk-mono flex-1 min-w-0 truncate"
        style={{ fontSize: '10px', letterSpacing: '0.18em', color: 'var(--mute)' }}
      >
        {title}
        {count != null && (
          <span style={{ color: 'var(--mute)', marginLeft: '0.5em', opacity: 0.6 }}>
            · {count}
          </span>
        )}
      </span>

      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}
