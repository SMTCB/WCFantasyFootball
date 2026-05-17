/* eslint-disable no-undef */
/**
 * WCAG AA Color Contrast Audit
 * Checks if all color combinations meet WCAG AA standards:
 * - Normal text: 4.5:1 minimum
 * - Large text (18pt+ or 14pt+ bold): 3:1 minimum
 *
 * Run with: node audit-contrast.js
 */

const colors = {
  // Surfaces
  ink: '#080A0E',
  'ink-2': '#0F1218',
  'ink-3': '#161B25',
  rule: '#1E2530',

  // Foreground
  paper: '#F2EEE5',
  mute: '#8B95A1',

  // Accents
  cyan: '#00B4D8',
  gold: '#E0A800',
  positive: '#22C55E',
  warn: '#F59E0B',
  danger: '#EF4444',
  purple: '#A855F7',

  // Position colors
  'pos-gk': '#A855F7',
  'pos-def': '#00B4D8',
  'pos-mid': '#E0A800',
  'pos-fwd': '#EF4444',
};

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255,
  } : null;
}

function getLuminance(rgb) {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

function getContrast(color1, color2) {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);
  const lum1 = getLuminance(rgb1);
  const lum2 = getLuminance(rgb2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return ((lighter + 0.05) / (darker + 0.05)).toFixed(2);
}

// Key text/background combinations to check
const combinations = [
  // Main text on dark backgrounds
  { fg: 'paper', bg: 'ink', type: 'primary text', minRatio: 4.5 },
  { fg: 'paper', bg: 'ink-2', type: 'primary text', minRatio: 4.5 },
  { fg: 'paper', bg: 'ink-3', type: 'primary text', minRatio: 4.5 },

  // Secondary text on dark backgrounds (CRITICAL)
  { fg: 'mute', bg: 'ink', type: 'secondary text', minRatio: 4.5 },
  { fg: 'mute', bg: 'ink-2', type: 'secondary text (mentioned)', minRatio: 4.5 },
  { fg: 'mute', bg: 'ink-3', type: 'secondary text', minRatio: 4.5 },

  // Accent colors on dark backgrounds
  { fg: 'cyan', bg: 'ink', type: 'cyan accent', minRatio: 3 },
  { fg: 'gold', bg: 'ink', type: 'gold/mid accent', minRatio: 3 },
  { fg: 'positive', bg: 'ink', type: 'positive/success', minRatio: 3 },
  { fg: 'danger', bg: 'ink', type: 'danger/error', minRatio: 3 },
  { fg: 'warn', bg: 'ink', type: 'warn/yellow', minRatio: 3 },
  { fg: 'purple', bg: 'ink', type: 'purple/gk', minRatio: 3 },
];

console.log('=== WCAG AA Color Contrast Audit ===\n');

let failures = 0;
combinations.forEach(({ fg, bg, type, minRatio }) => {
  const ratio = parseFloat(getContrast(colors[fg], colors[bg]));
  const status = ratio >= minRatio ? '✓' : '✗ FAIL';
  if (ratio < minRatio) failures++;
  console.log(`${status} ${type.padEnd(25)} | ${fg.padEnd(10)} on ${bg.padEnd(8)} | ${ratio}:1 (need ${minRatio}:1)`);
});

console.log(`\n${failures === 0 ? '✓ All combinations pass WCAG AA' : `✗ ${failures} combinations fail WCAG AA`}`);
process.exit(failures > 0 ? 1 : 0);
