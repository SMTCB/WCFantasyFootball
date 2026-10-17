/** Friendly empty list: what's missing, why, and what to do next. */
export default function EmptyState({ title, body = null, action = null, icon = null }) {
  return (
    <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--ink-soft)' }}>
      {icon && <div style={{ marginBottom: 8, color: 'var(--mute)', display: 'flex', justifyContent: 'center' }}>{icon}</div>}
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-body-lg)', color: 'var(--paper)' }}>{title}</div>
      {body && <p style={{ margin: '6px auto 0', maxWidth: 360, fontSize: 'var(--fs-body)', lineHeight: 'var(--lh-body)' }}>{body}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}
