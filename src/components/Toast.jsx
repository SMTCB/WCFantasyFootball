import { useState, useCallback } from 'react';
import { ToastContext } from '../lib/toastContext';

const ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'i' };
const STYLES = {
  success: { border: 'rgba(24,201,107,0.35)', bg: 'rgba(24,201,107,0.12)', color: '#18c96b' },
  error:   { border: 'rgba(240,58,58,0.35)',  bg: 'rgba(240,58,58,0.12)',  color: '#f03a3a' },
  warning: { border: 'rgba(240,180,0,0.35)',  bg: 'rgba(240,180,0,0.12)',  color: '#f0b400' },
  info:    { border: 'rgba(0,180,216,0.35)',   bg: 'rgba(0,180,216,0.12)',  color: '#00b4d8' },
};

function ToastItem({ toast, onDismiss }) {
  const s = STYLES[toast.type] ?? STYLES.info;
  return (
    <div
      onClick={() => onDismiss(toast.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: 4,
        border: `1px solid ${s.border}`,
        background: s.bg,
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        cursor: 'pointer',
        animation: 'toast-in 0.18s ease-out',
        minWidth: 220,
        maxWidth: 360,
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 900, color: s.color, flexShrink: 0 }}>{ICONS[toast.type]}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', flex: 1, lineHeight: 1.3 }}>{toast.message}</span>
    </div>
  );
}

function ToastStack({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: 'fixed', bottom: 80, left: 0, right: 0, zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none' }}>
      {toasts.map(t => (
        <div key={t.id} style={{ pointerEvents: 'auto' }}>
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((message, type = 'info', duration = 3500) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), duration);
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
