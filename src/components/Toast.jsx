import { useState, useCallback } from 'react';
import { ToastContext } from '../lib/toastContext';
import { MESSAGE_LABELS } from './messages/labels';

function ToastItem({ toast, onDismiss }) {
  const [isRetrying, setIsRetrying] = useState(false);
  const type = toast.type ?? 'info';

  const handleRetry = async (e) => {
    e.stopPropagation();
    if (toast.onRetry && !isRetrying) {
      setIsRetrying(true);
      try {
        await toast.onRetry();
        onDismiss(toast.id);
      } finally {
        setIsRetrying(false);
      }
    }
  };

  return (
    <div className={`fk-toast ${type}`} style={{ width: '100%', maxWidth: 380, animation: 'toast-in 0.18s ease-out' }}>
      <span className="fk-toast-dot" />
      <div className="fk-toast-body">
        <div className="fk-toast-label">{MESSAGE_LABELS[type] ?? MESSAGE_LABELS.info}</div>
        <div className="fk-toast-title">{toast.message}</div>
        {toast.sub && <div className="fk-toast-sub">{toast.sub}</div>}
        {toast.onRetry && (
          <div className="fk-toast-actions">
            <button type="button" className="fk-msg-btn" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? '...' : 'RETRY'}
            </button>
          </div>
        )}
      </div>
      <button type="button" className="fk-toast-dismiss" onClick={() => onDismiss(toast.id)} aria-label="Dismiss">
        ✕
      </button>
      {!toast.onRetry && (
        <span className="fk-toast-progress" style={{ animationDuration: `${toast.duration}ms` }} />
      )}
    </div>
  );
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  const visible = toasts.slice(-3);
  return (
    <div style={{ position: 'fixed', bottom: 'calc(80px + env(safe-area-inset-bottom))', left: 0, right: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none', padding: '0 16px' }}>
      {visible.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto', width: '100%', maxWidth: 380 }}>
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((message, type = 'info', duration = 3500, onRetry = null, sub = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, onRetry, sub, duration }]);
    if (!onRetry) {
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
    }
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}
