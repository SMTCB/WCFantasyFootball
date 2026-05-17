/**
 * SkipToContent — keyboard-accessible skip link for screen readers & keyboard users.
 *
 * Placed at the top of the page, hidden visually but keyboard-accessible via Tab.
 * Pressing Enter jumps focus to the main content area, improving navigation for
 * users who rely on keyboard or screen reader.
 *
 * Usage:
 *   <SkipToContent targetId="main-content" />
 */

export default function SkipToContent({ targetId = 'main-content' }) {
  const handleClick = (e) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <a
      href={`#${targetId}`}
      onClick={handleClick}
      style={{
        position: 'absolute',
        top: -40,
        left: 0,
        padding: '8px 12px',
        background: 'var(--cyan)',
        color: 'var(--ink)',
        textDecoration: 'none',
        borderRadius: 4,
        fontSize: 12,
        fontWeight: 600,
        zIndex: 9999,
        fontFamily: 'Archivo, sans-serif',
      }}
      className="focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      onFocus={(e) => {
        e.target.style.top = '10px';
      }}
      onBlur={(e) => {
        e.target.style.top = '-40px';
      }}
    >
      Skip to main content
    </a>
  );
}
