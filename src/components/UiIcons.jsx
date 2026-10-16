/**
 * UiIcons — functional status icons (lock, warning, trophy, hourglass, check).
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
export const IconCheckCircle = ({ size = 24 }) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.5" /></svg>
);
