import { useState } from 'react';
import { MessageIcon, MESSAGE_LABELS } from './icons';

// FORZAKIT Inline Banner — see docs/brand/MESSAGES
// Direct response to a user action, or a decision the user must make.
//
// type: 'success' | 'warning' | 'error' | 'info'
// title: short headline (sentence case)
// text: optional body copy, max ~2 lines
// actions: optional [{ label, onClick, variant: 'primary' | 'ghost', disabled }]
// dismissible: show the close (x) control
// onDismiss: called when the user dismisses the banner

export default function InlineBanner({ type = 'info', title, text, actions, dismissible = false, onDismiss }) {
  const [busyIndex, setBusyIndex] = useState(null);

  const handleAction = async (action, index) => {
    if (action.disabled || busyIndex !== null) return;
    if (action.onClick) {
      const result = action.onClick();
      if (result && typeof result.then === 'function') {
        setBusyIndex(index);
        try {
          await result;
        } finally {
          setBusyIndex(null);
        }
      }
    }
  };

  return (
    <div className={`fk-msg ${type}`}>
      <div className="fk-msg-icon">
        <MessageIcon type={type} />
      </div>
      <div className="fk-msg-body">
        <div className="fk-msg-type">{MESSAGE_LABELS[type] ?? MESSAGE_LABELS.info}</div>
        {title && <div className="fk-msg-title">{title}</div>}
        {text && <div className="fk-msg-text">{text}</div>}
        {actions && actions.length > 0 && (
          <div className="fk-msg-actions">
            {actions.map((action, index) => (
              <button
                key={action.label}
                type="button"
                className={`fk-msg-btn ${action.variant === 'ghost' ? 'ghost' : ''}`}
                onClick={() => handleAction(action, index)}
                disabled={action.disabled || busyIndex !== null}
              >
                {busyIndex === index ? '...' : action.label}
              </button>
            ))}
          </div>
        )}
      </div>
      {dismissible && (
        <button type="button" className="fk-msg-dismiss" onClick={onDismiss} aria-label="Dismiss">
          ✕
        </button>
      )}
    </div>
  );
}
