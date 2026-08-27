import { useState } from 'react';

const MONO = "'JetBrains Mono', monospace";
const HEAD = "'Archivo Black', sans-serif";
const BODY = "'Archivo', sans-serif";

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const NOTIF_TYPE_META = {
  frontpage_edition:  { badge: 'TIMES',     color: 'var(--accent)' },
  breaking_news:      { badge: 'NEWS',      color: 'var(--danger)' },
  direct_message:     { badge: 'DM',        color: 'var(--cyan)'   },
  arbitration_needed: { badge: 'ARBITRATE', color: 'var(--purple)' },
};

// Default row renderer — matches the `clubhouse_notifications` shape
// ({ id, type, read_at, source_type, source_id, payload: { headline|preview } }).
// Callers with a different data shape (e.g. league-level notifications) should
// pass their own `renderRow` instead.
function defaultRenderRow(n, { onMarkRead, onNavigate, onNavigated }) {
  const meta   = NOTIF_TYPE_META[n.type] ?? { badge: n.type.toUpperCase(), color: 'var(--mute)' };
  const isNew  = !n.read_at;
  const canNav = (n.source_type === 'league' || n.source_type === 'p2p_challenge') && n.source_id;
  return (
    <div
      key={n.id}
      role={canNav ? 'button' : undefined}
      tabIndex={canNav ? 0 : undefined}
      onClick={() => {
        if (isNew) onMarkRead?.(n.id);
        if (canNav) { onNavigate?.(n); onNavigated?.(); }
      }}
      style={{
        display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px',
        borderBottom: '1px solid var(--rule)',
        background: isNew ? 'var(--accent-bg)' : 'transparent',
        cursor: canNav ? 'pointer' : 'default',
      }}
    >
      <div style={{ paddingTop: 5, flexShrink: 0, width: 6 }}>
        {isNew && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', color: meta.color }}>{meta.badge}</span>
          <span style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.07em' }}>{timeAgo(n.created_at)}</span>
        </div>
        <div style={{ fontFamily: BODY, fontSize: 'var(--fs-label)', color: 'var(--paper)', lineHeight: 1.4 }}>
          {n.payload?.headline ?? n.payload?.preview ?? n.type}
        </div>
      </div>
    </div>
  );
}

export default function NotificationBell({
  notifications = [], unreadCount = 0, onMarkAll, isDesktop,
  onMarkRead, onNavigate, renderRow,
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const row = renderRow ?? ((n, ctx) => defaultRenderRow(n, { onMarkRead, onNavigate, ...ctx }));

  const list = notifications.length === 0 ? (
    <div style={{ textAlign: 'center', padding: '32px 0', fontFamily: MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
      No notifications yet.
    </div>
  ) : notifications.map(n => row(n, { onNavigated: close }));

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        style={{
          position: 'relative', width: 32, height: 32, borderRadius: 6,
          background: 'var(--shell-fill-strong)', border: '1px solid var(--shell-rule-strong)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* Two-tone tray/inbox glyph — CSS-built, not an emoji */}
        <div style={{ width: 14, height: 11, border: '1.5px solid var(--shell-rule-emphasis)', borderTop: 'none', borderRadius: '0 0 2px 2px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -1, left: -1.5, right: -1.5, height: 1.5, background: 'var(--shell-fill-active)' }} />
        </div>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 15, height: 15, borderRadius: 100,
            background: 'var(--danger)', color: '#fff', fontFamily: MONO, fontSize: 'var(--fs-micro)', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && !isDesktop && (
        // Mobile: dedicated full screen with a back button — no room for a dropdown at this width
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--card)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
            <button
              onClick={close}
              style={{ background: 'transparent', border: 'none', color: 'var(--paper)', fontSize: 'var(--fs-heading)', cursor: 'pointer', padding: '2px 4px 2px 0', lineHeight: 1 }}
              aria-label="Back"
            >
              ←
            </button>
            <span style={{ fontFamily: HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', flex: 1 }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAll}
                style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                MARK ALL READ
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {list}
          </div>
        </div>
      )}

      {open && isDesktop && (
        <>
          <div onClick={close} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 40, right: 0, width: 360, maxWidth: '90vw', zIndex: 41,
            background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,0.18)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--rule)' }}>
              <span style={{ fontFamily: HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAll}
                  style={{ fontFamily: MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  MARK ALL READ
                </button>
              )}
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              {list}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
