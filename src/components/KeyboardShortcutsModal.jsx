import { useEffect } from 'react';

export function KeyboardShortcutsModal({ isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts = [
    { key: 'g s', action: 'Go to Scores' },
    { key: 'g l', action: 'Go to League' },
    { key: 'g m', action: 'Go to Market' },
    { key: '?', action: 'Show this help' },
    { key: 'Esc', action: 'Close dialog' },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--ink-2)',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          padding: '32px 28px',
          maxWidth: 420,
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontFamily: 'Archivo Black, sans-serif',
            fontSize: 18,
            color: 'var(--paper)',
            marginBottom: 24,
            letterSpacing: '0.02em',
          }}
        >
          Keyboard Shortcuts
        </h2>

        <div style={{ display: 'grid', gap: 16 }}>
          {shortcuts.map((s, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
              <kbd
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 11,
                  fontWeight: 700,
                  color: 'var(--cyan)',
                  background: 'rgba(0, 180, 216, 0.12)',
                  border: '1px solid rgba(0, 180, 216, 0.25)',
                  padding: '4px 8px',
                  borderRadius: 2,
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.05em',
                }}
              >
                {s.key}
              </kbd>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 12,
                  color: 'var(--mute)',
                  flex: 1,
                  textAlign: 'left',
                }}
              >
                {s.action}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            marginTop: 24,
            paddingTop: 16,
            borderTop: '1px solid var(--rule)',
            fontSize: 11,
            color: 'var(--mute)',
            fontFamily: 'JetBrains Mono, monospace',
            lineHeight: 1.5,
          }}
        >
          Press <kbd style={{ background: 'rgba(224,168,0,0.12)', color: 'var(--gold)', padding: '1px 3px', borderRadius: 1 }}>Esc</kbd> or click outside to close
        </div>
      </div>
    </div>
  );
}
