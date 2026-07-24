/**
 * BrandMark — Frontrow logo lockup ("The Tiers")
 * Source: docs/platform_revision/design_v2/logo/README.md — do not invent new proportions/colors here.
 *
 * Props:
 *   theme    'dark' | 'light'  — color scheme (default: 'dark'). 'dark' = warm-white wordmark for use
 *                                 on the --shell dark surface; 'light' = --paper wordmark for --bg/--card surfaces.
 *   scale    number            — transform scale multiplier (default: 1)
 *   compact  boolean           — smaller icon + single-line wordmark, no tagline (default: false)
 */

function TiersMark({ size = 36 }) {
  const width = (size * 80) / 45;
  return (
    <svg width={width} height={size} viewBox="0 0 80 45" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect x="0" y="0" width="26" height="11" rx="4" fill="#B8720E" />
      <rect x="0" y="17" width="48" height="11" rx="4" fill="#1A6FA8" />
      <rect x="0" y="34" width="70" height="11" rx="4" fill="#1A6FA8" />
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
        <TiersMark size={16} />
        <span style={{
          fontFamily: 'Archivo Black, sans-serif',
          fontSize:   '15px',
          fontWeight: 900,
          color:      wordmarkColor,
          lineHeight: 1,
        }}>
          Frontrow
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
      <TiersMark size={36} />
      <span style={{
        fontFamily: 'Archivo Black, sans-serif',
        fontSize:   '32px',
        fontWeight: 900,
        color:      wordmarkColor,
        lineHeight: 1,
      }}>
        Frontrow
      </span>
    </div>
  );
}
