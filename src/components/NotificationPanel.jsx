import { useState, useRef, useEffect } from 'react';

export default function NotificationPanel({ notifications, unreadCount, onMarkAsRead, onClearAll }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef(null);

  // Close panel when clicking outside
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

  // Format relative time (e.g., "5 minutes ago")
  function getRelativeTime(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 hover:bg-[var(--ink-lighter)] rounded transition-colors"
        title="Notifications"
      >
        <span className="text-xl">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 text-[10px] font-black bg-red-500 text-white rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-[var(--ink)] border border-[var(--ink-lighter)] rounded shadow-lg z-50">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-[var(--ink-lighter)]">
            <span className="font-black text-sm uppercase">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={() => {
                  onClearAll();
                  setIsOpen(false);
                }}
                className="text-[11px] text-[var(--mute)] hover:text-white transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-[var(--mute)] text-[12px]">
                No notifications yet
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-3 border-b border-[var(--ink-lighter)] transition-colors cursor-pointer hover:bg-[var(--ink-lighter)] ${
                    !notification.is_read ? 'bg-[var(--ink-lighter)]' : ''
                  }`}
                  onClick={() => {
                    if (!notification.is_read) {
                      onMarkAsRead(notification.id);
                    }
                  }}
                >
                  {/* Unread Indicator */}
                  {!notification.is_read && (
                    <div className="absolute left-3 w-2 h-2 rounded-full bg-[var(--positive)]" />
                  )}

                  <div className={!notification.is_read ? 'pl-4' : ''}>
                    {/* Title */}
                    <div className="font-black text-[12px] text-white">
                      {notification.title}
                    </div>

                    {/* Description */}
                    {notification.description && (
                      <div className="text-[11px] text-[var(--mute)] mt-1">
                        {notification.description}
                      </div>
                    )}

                    {/* Timestamp */}
                    <div className="text-[10px] text-[var(--mute-lighter)] mt-2">
                      {getRelativeTime(notification.created_at)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-2 border-t border-[var(--ink-lighter)] text-center">
              <button
                onClick={() => {
                  onClearAll();
                  setIsOpen(false);
                }}
                className="w-full text-[11px] font-black uppercase text-[var(--mute)] hover:text-white p-2 transition-colors"
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
