/** Load failure with a retry. Use instead of a blank screen or a raw error string. */
export default function ErrorState({ title = "Couldn't load this", body = 'Check your connection and try again.', onRetry }) {
  return (
    <div role="alert" style={{ textAlign: 'center', padding: '32px 16px' }}>
      <div style={{ fontWeight: 700, fontSize: 'var(--fs-body-lg)', color: 'var(--crit)' }}>{title}</div>
      <p style={{ margin: '6px auto 0', maxWidth: 360, fontSize: 'var(--fs-body)', color: 'var(--ink-soft)' }}>{body}</p>
      {onRetry && (
        <button className="ffl-btn ffl-btn--primary ffl-btn--md"
          type="button"
          onClick={onRetry} style={{ marginTop: 16 }}>
          Try again
        </button>
      )}
    </div>
  );
}
