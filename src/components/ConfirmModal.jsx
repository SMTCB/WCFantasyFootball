/**
 * ConfirmModal — reusable confirmation dialog for destructive actions.
 *
 * Usage:
 *   const [confirm, setConfirm] = useState(null);
 *
 *   setConfirm({
 *     title:      'Sell Bellingham?',
 *     body:       'You will receive €11.5M back into your budget.',
 *     warning:    'He is your current captain — selling removes the armband.',  // optional
 *     confirmLabel: 'Sell',
 *     danger:     true,   // red confirm button
 *     onConfirm:  async () => await doTheSell(),
 *   });
 *
 *   {confirm && <ConfirmModal {...confirm} onCancel={() => setConfirm(null)} />}
 */

import { useEffect, useRef, useState } from 'react';
import Button from './Button';
import { MessageIcon } from './messages/icons';

const TITLE_ID = 'confirm-modal-title';

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
  const cancelRef = useRef(null);
  const [loading, setLoading] = useState(false);

  // Focus cancel button on mount so keyboard users can dismiss immediately
  useEffect(() => { cancelRef.current?.focus(); }, []);

  // Escape key cancels
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, loading]);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      onCancel();
    }
  };

  const confirmVariant = danger ? 'danger' : 'gold';

  return (
    /* Backdrop */
    <div
      onClick={() => { if (!loading) onCancel(); }}
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={TITLE_ID}
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
        <div
          id={TITLE_ID}
          style={{
            fontSize:      '20px',
            fontFamily:    'Archivo Black, sans-serif',
            fontWeight:    900,
            textTransform: 'uppercase',
            color:         'var(--paper)',
            letterSpacing: '-0.01em',
            lineHeight:    1.1,
            marginBottom:  '10px',
          }}
        >
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
            gap:          '10px',
            padding:      '10px 12px',
            background:   'color-mix(in srgb, var(--warn) 9%, var(--ink-2))',
            border:       '1px solid color-mix(in srgb, var(--warn) 22%, transparent)',
            marginBottom: '24px',
          }}>
            <div style={{
              width:          '24px',
              height:         '24px',
              flexShrink:     0,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              background:     'color-mix(in srgb, var(--warn) 14%, transparent)',
              border:         '1px solid color-mix(in srgb, var(--warn) 35%, transparent)',
              color:          'var(--warn)',
            }}>
              <MessageIcon type="warning" style={{ width: 12, height: 12 }} />
            </div>
            <div>
              <div className="fk-mono" style={{ fontSize: '9px', color: 'var(--warn)', marginBottom: '3px' }}>
                Warning
              </div>
              <p style={{
                fontSize:   '12px',
                lineHeight: 1.55,
                color:      'var(--paper)',
                margin:     0,
              }}>
                {warning}
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <Button
            ref={cancelRef}
            variant="secondary"
            size="md"
            fullWidth
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>

          <Button
            variant={confirmVariant}
            size="md"
            fullWidth
            onClick={handleConfirm}
            disabled={loading}
            style={{ whiteSpace: 'normal', lineHeight: 1.25, textAlign: 'center' }}
          >
            {loading ? '…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
