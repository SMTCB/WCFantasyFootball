/** Load failure with a retry. Use instead of a blank screen or a raw error string. */
export default function ErrorState({ title = "Couldn't load this", body = 'Check your connection and try again.', onRetry }) {
  return (
    <div role="alert" style={{ textAlign: 'center', padding: '32px 16px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-body-lg)', color: 'var(--crit)' }}>{title}</div>
      <p style={{ margin: '6px auto 0', maxWidth: 360, fontSize: 'var(--fs-body)', color: 'var(--ink-soft)' }}>{body}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          style={{
            marginTop: 16, minHeight: 'var(--tap)', padding: '0 20px', borderRadius: 'var(--radius)',
            background: 'var(--accent)', color: 'var(--on-accent-solid)', fontWeight: 600, border: 0, cursor: 'pointer',
          }}
        >
          Try again
        </button>
      )}
    </div>
  );
}
