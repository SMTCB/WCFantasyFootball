import { useState } from 'react';
import { MessageIcon } from './icons';
import { MESSAGE_LABELS } from './labels';
import BottomSheet from '../shared/BottomSheet';

// FORZAKIT Mobile Action Sheet — see docs/brand/MESSAGES
// Interrupting decision on mobile. Replaces System Banner on small screens
// when the user must choose a next step. Never auto-dismisses.
//
// type: 'success' | 'warning' | 'error' | 'info'
// title: short headline (sentence case)
// text: body copy explaining the decision
// actions: [{ label, onClick, variant: 'primary' | 'ghost', disabled }]
// onDismiss: called when the user taps the backdrop (optional — omit to force a choice)

export default function ActionSheet({ type = 'info', title, text, actions, onDismiss }) {
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
    <BottomSheet open onClose={onDismiss} dismissOnBackdrop={!!onDismiss}>
      <div className={`fk-mob-sheet ${type}`}>
        <div className="fk-mob-sheet-head">
          <div className="fk-mob-sheet-icon">
            <MessageIcon type={type} />
          </div>
          <div>
            <div className="fk-mob-sheet-kicker">{MESSAGE_LABELS[type] ?? MESSAGE_LABELS.info}</div>
            {title && <div className="fk-mob-sheet-title">{title}</div>}
          </div>
        </div>
        {text && <div className="fk-mob-sheet-text">{text}</div>}
        {actions && actions.length > 0 && (
          <div className="fk-mob-sheet-btns">
            {actions.map((action, index) => (
              <button
                key={action.label}
                type="button"
                className={`fk-mob-sheet-btn ${action.variant === 'ghost' ? 'ghost' : ''}`}
                onClick={() => handleAction(action, index)}
                disabled={action.disabled || busyIndex !== null}
              >
                {busyIndex === index ? '...' : action.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
