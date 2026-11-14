/**
 * BrandMark — Clubhouse logo lockup ("The Seat": a C-shaped table from above, one gold seat)
 * Assets: public/brand/clubhouse-*.svg. Keep the proportions in sync with them.
 *
 * Props:
 *   theme    'dark' | 'light'  — color scheme (default: 'dark'). 'dark' = warm-white wordmark for use
 *                                 on the --shell dark surface; 'light' = --paper wordmark for --bg/--card surfaces.
 *   scale    number            — transform scale multiplier (default: 1)
 *   compact  boolean           — smaller icon + single-line wordmark, no tagline (default: false)
 */

function SeatMark({ size = 36, ink = '#18202E', seat = '#B8720E' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M43.57 18.21A18 18 0 1 0 43.57 45.79" fill="none" stroke={ink} strokeWidth="10" strokeLinecap="round" />
      <circle cx="51" cy="32" r="5.5" fill={seat} />
    </svg>
  );
}

export default function BrandMark({ theme = 'dark', scale = 1, compact = false }) {
  const isDark = theme === 'dark';
  // On the --shell dark surface the wordmark flips to warm white (#F7F3ED), never pure white.
  const wordmarkColor = isDark ? '#F7F3ED' : 'var(--paper)';

  if (compact) {
    return (
      <div style={{
        display:         'flex',
        alignItems:      'center',
        gap:             '10px',
        transform:       `scale(${scale})`,
        transformOrigin: 'left center',
      }}>
        <SeatMark size={22} ink={isDark ? '#F7F3ED' : '#18202E'} seat={isDark ? '#E5B45C' : '#B8720E'} />
        <span style={{
          fontFamily: 'Archivo Black, sans-serif',
          fontSize: 'var(--fs-body)',
          fontWeight: 900,
          color:      wordmarkColor,
          lineHeight: 1,
        }}>
          Clubhouse
        </span>
      </div>
    );
  }

  return (
    <div style={{
      display:         'flex',
      alignItems:      'center',
      gap:             '14px',
      transform:       `scale(${scale})`,
      transformOrigin: 'left center',
    }}>
      <SeatMark size={44} ink={isDark ? '#F7F3ED' : '#18202E'} seat={isDark ? '#E5B45C' : '#B8720E'} />
      <span style={{
        fontFamily: 'Archivo Black, sans-serif',
        fontSize: 'var(--fs-title)',
        fontWeight: 900,
        color:      wordmarkColor,
        lineHeight: 1,
      }}>
        Clubhouse
      </span>
    </div>
  );
}
