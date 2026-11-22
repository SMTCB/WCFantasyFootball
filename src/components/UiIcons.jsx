/**
 * UiIcons — functional status icons. Named exports for the first few, plus <Icon name> and <Dot> below.
 * Stroke style matches NavIcons; colour follows currentColor so callers theme via CSS.
 */
const base = (size) => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: 'false',
});

export const IconLock = ({ size = 24 }) => (
  <svg {...base(size)}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const IconWarning = ({ size = 24 }) => (
  <svg {...base(size)}><path d="M12 4 3 20h18L12 4Z" /><path d="M12 10v4" /><path d="M12 17.2v.1" /></svg>
);
export const IconTrophy = ({ size = 24 }) => (
  <svg {...base(size)}><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 13v4M8 20h8M10 17h4" /></svg>
);
export const IconHourglass = ({ size = 24 }) => (
  <svg {...base(size)}><path d="M7 4h10M7 20h10" /><path d="M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8" /></svg>
);
export const IconClose = ({ size = 24 }) => (
  <svg {...base(size)}><path d="m6 6 12 12M18 6 6 18" /></svg>
);
export const IconCheckCircle = ({ size = 24 }) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.5" /></svg>
);

// ── ICN-01: line icons that replace inline emoji ─────────────────────────────
// One component, one path table, so new screens pick an icon by name and data
// maps in plain .js files (status configs, bet catalogues) can store the name.
// Sport glyphs (⚽ 🎾 🏁), chat reactions and share-text emoji stay as emoji.
const c = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

const PATHS = {
  alarm:     [c(12, 13, 7), 'M12 9.5V13l2.2 1.6', 'M4.5 4.5 2.8 6.2M19.5 4.5l1.7 1.7'],
  bolt:      ['M13 3 5 14h6l-1 7 8-11h-6l1-7Z'],
  building:  ['M4 20V10l8-5 8 5v10', 'M3 20h18', 'M9 20v-5h6v5'],
  burst:     ['M12 3l1.6 5 4.6-2.6-2.2 4.8 5 1.6-5 1.6 2.2 4.8-4.6-2.6L12 21l-1.6-5-4.6 2.6 2.2-4.8-5-1.6 5-1.6L5.8 5.4l4.6 2.6L12 3Z'],
  calendar:  ['M6 5h12a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'M4 10h16', 'M8 3v4M16 3v4'],
  cart:      ['M3 4h2.5l2.2 10h10.1l2.2-7H6.4', c(9, 19, 1.5), c(17, 19, 1.5)],
  car:       ['M3 15.5h18', 'M5 15.5 7 10h10l2 5.5', 'M9 10l1-3h4l1 3', c(7, 18, 1.8), c(17, 18, 1.8)],
  chart:     ['M3 20h18', 'M6 20v-7M12 20V5M18 20v-10'],
  chat:      ['M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-5 4V6a1 1 0 0 1 1-1Z'],
  check:     [c(12, 12, 9), 'm8 12.5 2.8 2.8L16 9.5'],
  clipboard: ['M7 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1', 'M9 3h6v4H9z', 'M9 12h6M9 16h4'],
  clock:     [c(12, 13, 8), 'M12 9v4l2.5 1.5', 'M10 3h4'],
  copy:      ['M10 9h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z', 'M15 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h4'],
  flame:     ['M12 21c-3.9 0-6.5-2.6-6.5-6 0-3.4 2.4-5.4 3.4-8.3 1.4 1.3 2.1 2.9 2.1 4.4 1-.9 1.8-2.9 1.4-5.9 3.4 2.4 6.1 5.9 6.1 9.8 0 3.4-2.6 6-6.5 6Z'],
  gavel:     ['M13.5 3.5l7 7', 'M10.5 6.5l7 7', 'M12 5l-4 4 7 7 4-4', 'M10.5 11.5 4 18a1.4 1.4 0 0 0 2 2l6.5-6.5'],
  gear:      [c(12, 12, 3), c(12, 12, 6.5), 'M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1'],
  hourglass: ['M7 4h10M7 20h10', 'M8 4c0 5 8 5 8 8s-8 3-8 8M16 4c0 5-8 5-8 8'],
  image:     ['M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z', c(9, 9, 1.6), 'm4 17 5-5 4 4 2.5-2.5L20 18'],
  leaf:      ['M5 19C5 11 10 6 19 5c0 9-5 14-13 14H5Z', 'M5 19l8-8'],
  link:      ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1', 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  list:      ['M9 6h11M9 12h11M9 18h11', 'M4.5 6v.1M4.5 12v.1M4.5 18v.1'],
  lock:      ['M7 11h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z', 'M8 11V8a4 4 0 0 1 8 0v3'],
  mail:      ['M5 5h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'm3 7 9 6 9-6'],
  medal:     ['M7 3l3.2 6.6M17 3l-3.2 6.6M7 3h3.5M17 3h-3.5', c(12, 15, 5.5), c(12, 15, 2.2)],
  megaphone: ['M4 10v4h3l8 4V6l-8 4H4Z', 'M18 9.5a3.5 3.5 0 0 1 0 5', 'M7 14l1.5 5h2.5l-1-4.5'],
  newspaper: ['M5 4h11v14a2 2 0 0 0 2 2H7a2 2 0 0 1-2-2V4Z', 'M16 8h3v10a2 2 0 0 1-2 2', 'M8 8h5M8 12h5M8 16h3'],
  pencil:    ['M4 20h4L19 9l-4-4L4 16v4Z', 'M13.5 6.5l4 4'],
  rocket:    ['M14 15l-5-5c1.5-4.5 5-7 11-7 0 6-2.5 9.5-6 12Z', 'M9 10H5l2.5-3.5H12', 'M14 15v4l3.5-2.5V12', c(15, 8.5, 1.4), 'M6.5 15.5 4 20l4.5-2.5'],
  ruler:     ['M3.5 15.5 15.5 3.5l5 5-12 12-5-5Z', 'M7.5 11.5l2 2M10.5 8.5l2 2M13.5 5.5l2 2'],
  scales:    ['M12 4v16', 'M8 20h8', 'M5 7h14', 'M5 7l-3 6.5a3 3 0 0 0 6 0L5 7Z', 'M19 7l-3 6.5a3 3 0 0 0 6 0L19 7Z'],
  shield:    ['M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z'],
  spoon:     ['M12 3c2.1 0 3.2 2.1 3.2 4.4S13.8 12 12 12s-3.2-2.3-3.2-4.6S9.9 3 12 3Z', 'M12 12v9'],
  star:      ['M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z'],
  swap:      ['M4 8h14l-3.5-3.5', 'M20 16H6l3.5 3.5'],
  swords:    ['M4 4l10.5 10.5', 'M4 4h3.5M4 4v3.5', 'M13 16l3-3', 'M16.5 16.5 20 20', 'M20 4 9.5 14.5', 'M20 4h-3.5M20 4v3.5', 'M11 16l-3-3', 'M7.5 16.5 4 20'],
  target:    [c(12, 12, 8.5), c(12, 12, 4.5), 'M12 12v.1'],
  trophy:    ['M8 4h8v5a4 4 0 0 1-8 0V4Z', 'M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4', 'M12 13v4M8 20h8M10 17h4'],
  unlock:    ['M7 11h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2Z', 'M8 11V8a4 4 0 0 1 7.6-1.7'],
  warning:   ['M12 4 3 20h18L12 4Z', 'M12 10v4', 'M12 17.2v.1'],
  whistle:   ['M3 10h9.5a4.5 4.5 0 1 1-4.5 4.5V14H3v-4Z', 'M12.5 10 19 6.5', c(12.5, 14.5, 1)],
  // Filled shapes (cards on the recap, the clay swatch): fill, no stroke
  card:      ['M8.5 3.5h7a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19V5a1.5 1.5 0 0 1 1.5-1.5Z'],
  disc:      [c(12, 12, 7)],
};
const FILLED = new Set(['card', 'disc']);
// Names that are one shape in a fixed colour: card-red, medal-gold and so on.
const TONED = {
  'card-red':     ['card', 'var(--danger)'],
  'card-yellow':  ['card', 'var(--warn)'],
  'medal-gold':   ['medal', 'var(--gold)'],
  'medal-silver': ['medal', '#8A8F98'],
  'medal-bronze': ['medal', '#A0612B'],
  'surface-clay': ['disc', '#B5562B'],
  'surface-grass': ['leaf', '#3F8F3A'],
};

/**
 * <Icon name="chat" /> — sized to the surrounding text by default (1em) and
 * nudged onto the text baseline, so it drops in where an emoji used to be.
 * Decorative unless `label` is given (then it is announced as an image).
 */
export function Icon({ name, size = '1em', label, color, style }) {
  if (TONED[name]) { color = color ?? TONED[name][1]; name = TONED[name][0]; }
  const d = PATHS[name];
  if (!d) return null;
  const filled = FILLED.has(name);
  return (
    <svg {...base(size)}
      {...(filled ? { fill: 'currentColor', stroke: 'none' } : {})}
      {...(label ? { 'aria-hidden': undefined, role: 'img', 'aria-label': label } : {})}
      style={{ verticalAlign: '-0.125em', flexShrink: 0, ...(color ? { color } : {}), ...style }}>
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

/** A small round status dot (fit / doubtful / injured, draft pressure, live). */
export function Dot({ color, size = 10, label }) {
  return (
    <span {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color, verticalAlign: 'middle', flexShrink: 0 }} />
  );
}

/**
 * <Glyph g={value} /> — for data maps that mix icon names with typographic marks
 * (◈, ≷, ⚽): renders the icon when `g` is a known name, otherwise the text itself.
 */
export function Glyph({ g, size, color, label }) {
  if (PATHS[g] || TONED[g]) return <Icon name={g} size={size} color={color} label={label} />;
  return <>{g}</>;
}
