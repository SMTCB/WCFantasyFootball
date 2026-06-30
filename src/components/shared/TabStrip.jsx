import { useRef, useEffect } from 'react';

const MONO = "'JetBrains Mono', monospace";

/**
 * Shared scrollable tab bar. Two visual variants:
 *   "underline" — full-width underline active state (Clubhouse)
 *   "pill"      — filled pill active state with scroll (League)
 *
 * tabs: { key, label, count?, notify? }[]
 * count  — numeric badge shown on the tab (e.g. unread messages)
 * notify — small danger dot (unseen activity, not a count)
 */
export default function TabStrip({
  tabs = [],
  active,
  onTab,
  accent = 'var(--accent)',
  variant = 'pill',
  style,
}) {
  const containerRef = useRef(null);

  // Scroll active tab into the visible area when it changes
  useEffect(() => {
    if (!containerRef.current || !active) return;
    const buttons = containerRef.current.querySelectorAll('button[data-tabkey]');
    for (const btn of buttons) {
      if (btn.dataset.tabkey === String(active)) {
        btn.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        break;
      }
    }
  }, [active]);

  const isUnderline = variant === 'underline';

  const containerStyle = isUnderline
    ? {
        display: 'flex',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        borderBottom: '1px solid var(--rule)',
        flexShrink: 0,
        ...style,
      }
    : {
        display: 'flex',
        gap: 6,
        padding: '10px 18px',
        overflowX: 'auto',
        borderBottom: '1px solid var(--rule)',
        background: 'var(--ink)',
        flexShrink: 0,
        scrollbarWidth: 'none',
        ...style,
      };

  return (
    <div ref={containerRef} style={containerStyle}>
      {tabs.map(t => {
        const isActive = t.key === active;

        if (isUnderline) {
          return (
            <button
              key={t.key}
              data-tabkey={t.key}
              onClick={() => onTab(t.key)}
              style={{
                flex: '0 0 auto',
                padding: '12px 14px',
                fontFamily: MONO,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                cursor: 'pointer',
                border: 'none',
                borderBottom: isActive ? `2px solid ${accent}` : '2px solid transparent',
                background: 'transparent',
                color: isActive ? accent : 'var(--mute)',
                marginBottom: -1,
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {t.label}
              {t.notify && !isActive && (
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
              )}
              {!!t.count && (
                <span style={{ fontFamily: MONO, fontSize: 9, color: isActive ? accent : 'var(--danger)', fontWeight: 700 }}>
                  {t.count}
                </span>
              )}
            </button>
          );
        }

        // pill variant
        return (
          <button
            key={t.key}
            data-tabkey={t.key}
            onClick={() => onTab(t.key)}
            style={{
              flex: '0 0 auto',
              padding: '7px 12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: isActive ? accent : 'transparent',
              border: `1px solid ${isActive ? accent : 'var(--rule)'}`,
              borderRadius: 4,
              color: isActive ? 'var(--ink)' : 'var(--mute)',
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: '.18em',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {t.label}
            {t.notify && !isActive && (
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--danger)', flexShrink: 0 }} />
            )}
            {!!t.count && !isActive && (
              <span style={{ color: accent, fontSize: 9 }}>{t.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
