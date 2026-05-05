/**
 * ConfirmModal — reusable confirmation dialog for destructive actions.
 *
 * Usage:
 *   const [confirm, setConfirm] = useState(null);
 *
 *   setConfirm({
 *     title:      'Sell Bellingham?',
 *     body:       'You will receive $11.5M back into your budget.',
 *     warning:    'He is your current captain — selling removes the armband.',  // optional
 *     confirmLabel: 'Sell',
 *     danger:     true,   // red confirm button
 *     onConfirm:  () => doTheSell(),
 *   });
 *
 *   {confirm && <ConfirmModal {...confirm} onCancel={() => setConfirm(null)} />}
 */

import { useEffect } from 'react';

export default function ConfirmModal({
  title,
  body,
  warning       = null,
  confirmLabel  = 'Confirm',
  cancelLabel   = 'Cancel',
  danger        = false,
  onConfirm,
  onCancel,
}) {
  // Escape key cancels
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const confirmBg    = danger ? 'var(--danger)' : 'var(--gold)';
  const confirmColor = danger ? '#fff'    : 'var(--ink-2)';

  return (
    /* Backdrop */
    <div
      onClick={onCancel}
      style={{
        position:   'fixed',
        inset:      0,
        zIndex:     9998,
        background: 'rgba(7,10,15,0.75)',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding:    '24px',
        backdropFilter: 'blur(4px)',
      }}
    >
      {/* Card — stopPropagation so clicking inside doesn't dismiss */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width:        '100%',
          maxWidth:     '360px',
          background:   'var(--ink-2)',
          border:       '1px solid rgba(255,255,255,0.10)',
          borderRadius: '12px',
          padding:      '28px 24px 24px',
          boxShadow:    '0 24px 64px rgba(0,0,0,0.7)',
        }}
      >
        {/* Title */}
        <div style={{
          fontSize:      '20px',
          fontFamily:    'Archivo Black, sans-serif',
          fontWeight:    900,
          textTransform: 'uppercase',
          color:         'var(--paper)',
          letterSpacing: '-0.01em',
          lineHeight:    1.1,
          marginBottom:  '10px',
        }}>
          {title}
        </div>

        {/* Body */}
        <p style={{
          fontSize:     '13px',
          lineHeight:   1.6,
          color:        'rgba(240,242,245,0.6)',
          marginBottom: warning ? '12px' : '24px',
        }}>
          {body}
        </p>

        {/* Warning (optional — e.g. "this is your captain") */}
        {warning && (
          <div style={{
            display:      'flex',
            alignItems:   'flex-start',
            gap:          '8px',
            padding:      '10px 12px',
            borderRadius: '6px',
            background:   'rgba(240,180,0,0.08)',
            border:       '1px solid rgba(240,180,0,0.25)',
            marginBottom: '24px',
          }}>
            <span className="fk-mono" style={{ fontSize: '9px', color: 'var(--gold)', flexShrink: 0 }}>!</span>
            <p style={{
              fontSize:   '12px',
              lineHeight: 1.55,
              color:      'var(--gold)',
              margin:     0,
            }}>
              {warning}
            </p>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onCancel}
            style={{
              flex:          1,
              padding:       '11px',
              background:    'rgba(255,255,255,0.05)',
              border:        '1px solid rgba(255,255,255,0.10)',
              borderRadius:  '7px',
              color:         'rgba(240,242,245,0.6)',
              fontSize:      '12px',
              fontFamily:    'Archivo Black, sans-serif',
              fontWeight:    700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor:        'pointer',
              transition:    'background 0.15s',
            }}
            onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.09)'}
            onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.05)'}
          >
            {cancelLabel}
          </button>

          <button
            onClick={() => { onConfirm(); onCancel(); }}
            style={{
              flex:          1,
              padding:       '11px',
              background:    confirmBg,
              border:        'none',
              borderRadius:  '7px',
              color:         confirmColor,
              fontSize:      '12px',
              fontFamily:    'Archivo Black, sans-serif',
              fontWeight:    800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor:        'pointer',
              transition:    'opacity 0.15s',
            }}
            onMouseEnter={e => e.target.style.opacity = '0.85'}
            onMouseLeave={e => e.target.style.opacity = '1'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
