/** Light page header: title + optional meta chips and right-aligned stats. Navy is reserved for the
 *  Frontrow front page and trophy profile, so this is always a plain card surface. */
export default function PageHeader({ title, lead = null, meta = null, stats = null, children, style }) {
  return (
    <header
      style={{
        background: 'var(--card)', borderBottom: '1px solid var(--rule)',
        padding: '14px 16px 0', display: 'grid', gap: 12, ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {lead}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1
            style={{
              margin: 0, fontFamily: "'Archivo Black', sans-serif", fontWeight: 400,
              fontSize: 'var(--fs-heading)', lineHeight: 'var(--lh-heading)', color: 'var(--paper)',
              overflowWrap: 'anywhere',
            }}
          >
            {title}
          </h1>
          {meta && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{meta}</div>}
        </div>
        {stats && <div className="num" style={{ display: 'flex', gap: 18, textAlign: 'right' }}>{stats}</div>}
      </div>
      {children}
    </header>
  );
}
