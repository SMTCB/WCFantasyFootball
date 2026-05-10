/**
 * BrandMark — Editorial Brandmark
 * Exact implementation from brand guidelines FORZA_BRANDMARK_ICON v1.9
 *
 * Props:
 *   theme    'dark' | 'light'  — color scheme (default: 'dark')
 *   scale    number            — transform scale multiplier (default: 1)
 *   compact  boolean           — single-line shorthand (default: false)
 */

export default function BrandMark({ theme = 'dark', scale = 1, compact = false }) {
  const isDark = theme === 'dark';
  const primaryColor   = isDark ? '#FFFFFF'  : '#080A0E';
  const secondaryColor = isDark ? '#F2EEE5'  : '#8B95A1';
  const slashColor     = '#00B4D8';

  if (compact) {
    return (
      <div style={{
        display:         'flex',
        alignItems:      'center',
        gap:             '8px',
        transform:       `scale(${scale})`,
        transformOrigin: 'left center',
      }}>
        <span style={{
          fontFamily:    'Archivo Black, sans-serif',
          fontSize:      '14px',
          fontWeight:    900,
          fontStyle:     'italic',
          textTransform: 'uppercase',
          letterSpacing: '-0.02em',
          color:         primaryColor,
          lineHeight:    1,
        }}>
          FORZA
        </span>
        <div style={{
          width:     '2px',
          height:    '16px',
          background: slashColor,
          transform: 'rotate(15deg)',
          flexShrink: 0,
        }} />
        <span style={{
          fontFamily:    'Archivo Black, sans-serif',
          fontSize:      '11px',
          fontWeight:    900,
          textTransform: 'uppercase',
          letterSpacing: '-0.01em',
          color:         secondaryColor,
          lineHeight:    1,
        }}>
          LEAGUE
        </span>
      </div>
    );
  }

  return (
    <div style={{
      display:         'flex',
      alignItems:      'baseline',
      transform:       `scale(${scale})`,
      transformOrigin: 'left center',
    }}>
      {/* FORZA */}
      <span style={{
        fontFamily:    'Archivo Black, sans-serif',
        fontSize:      '36px',
        fontWeight:    900,
        fontStyle:     'italic',
        textTransform: 'uppercase',
        letterSpacing: '-0.02em',
        color:         primaryColor,
        lineHeight:    1,
      }}>
        FORZA
      </span>

      {/* The Aligned Slash — 3px, 15° */}
      <div style={{
        width:      '3px',
        height:     '36px',
        background: slashColor,
        margin:     '0 10px',
        transform:  'rotate(15deg)',
        alignSelf:  'center',
        flexShrink: 0,
      }} />

      {/* FANTASY / LEAGUE stacked */}
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 0.9 }}>
        <span style={{
          fontFamily:    'Archivo Black, sans-serif',
          fontSize:      '17px',
          fontWeight:    900,
          textTransform: 'uppercase',
          letterSpacing: '-0.01em',
          color:         secondaryColor,
        }}>
          FANTASY
        </span>
        <span style={{
          fontFamily:    'Archivo Black, sans-serif',
          fontSize:      '17px',
          fontWeight:    900,
          textTransform: 'uppercase',
          letterSpacing: '-0.01em',
          color:         secondaryColor,
        }}>
          LEAGUE
        </span>
      </div>
    </div>
  );
}
