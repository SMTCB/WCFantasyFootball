/**
 * PageHeader — semantic <h1> with eyebrow subtitle.
 *
 * Every page should have exactly one <h1> for:
 * - Screen reader context (semantic HTML)
 * - SEO value (page title)
 * - Keyboard navigation (skip-to-content targets it)
 *
 * Usage:
 *   <PageHeader eyebrow="MATCH DAY · GW 10" title="Live Centre" />
 *   <PageHeader title="My Squad" />
 */

export default function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <div style={{ paddingBottom: 20 }}>
      {eyebrow && (
        <div className="mono" style={{ fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em', marginBottom: 8 }}>
          {eyebrow}
        </div>
      )}
      <h1
        id="main-content"
        style={{
          fontFamily: 'Archivo Black, sans-serif',
          fontSize: 'clamp(24px, 5vw, 34px)',
          fontWeight: 900,
          letterSpacing: '-0.02em',
          color: 'var(--paper)',
          margin: 0,
          textTransform: 'capitalize',
        }}
        tabIndex={-1}
      >
        {title}
      </h1>
      {subtitle && (
        <div style={{ fontSize: 14, color: 'var(--mute)', marginTop: 8 }}>
          {subtitle}
        </div>
      )}
      {children}
    </div>
  );
}
