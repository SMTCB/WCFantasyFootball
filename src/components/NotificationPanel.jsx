import { useState, useRef, useEffect } from 'react';

export default function NotificationPanel({ notifications, unreadCount, onMarkAsRead, onClearAll, onNavigate }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  function getRelativeTime(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const seconds = Math.floor((now - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded transition-colors hover:bg-white/5"
        title="Notifications"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span
            className="absolute top-0 right-0 w-4 h-4 text-[9px] font-black text-white rounded-full flex items-center justify-center"
            style={{ background: 'var(--danger)' }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 w-80 rounded-md shadow-2xl z-50 overflow-hidden"
          style={{ background: 'var(--card)', border: '1px solid var(--rule)', isolation: 'isolate' }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--rule)' }}
          >
            <span
              className="text-[11px] font-black uppercase tracking-widest"
              style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
            >
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={() => { onClearAll?.(); setIsOpen(false); }}
                className="text-[10px] font-semibold transition-colors"
                style={{ color: 'var(--mute)' }}
              >
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px]" style={{ color: 'var(--mute)' }}>
                No notifications yet
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className="relative flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-black/5"
                  style={{
                    borderBottom: '1px solid var(--rule)',
                    background: !n.is_read ? 'var(--accent-bg)' : undefined,
                  }}
                  onClick={() => {
                    if (!n.is_read) onMarkAsRead?.(n.id);
                    const link = n.link ?? n.action_url ?? n.metadata?.link;
                    if (link) { setIsOpen(false); onNavigate?.(link); }
                  }}
                >
                  {/* Unread dot — stays inside row with relative parent */}
                  <div className="shrink-0 mt-1.5">
                    {!n.is_read
                      ? <div className="w-2 h-2 rounded-full" style={{ background: 'var(--cyan)' }} />
                      : <div className="w-2 h-2" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <div
                      className="text-[12px] font-bold leading-tight"
                      style={{ color: 'var(--paper)' }}
                    >
                      {n.title}
                    </div>
                    {n.description && (
                      <div className="text-[11px] mt-0.5 leading-snug" style={{ color: 'var(--mute)' }}>
                        {n.description}
                      </div>
                    )}
                    <div className="text-[10px] mt-1.5" style={{ color: 'rgba(139,149,161,0.5)' }}>
                      {getRelativeTime(n.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={() => { onClearAll?.(); setIsOpen(false); }}
                className="w-full py-2.5 text-[10px] font-black uppercase tracking-widest transition-colors hover:bg-white/5"
                style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
              >
                Clear All
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
