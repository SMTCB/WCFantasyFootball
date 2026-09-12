import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * NumberFlow — animates a numeric value counting up (or down) from its
 * previous value whenever `value` changes, instead of snapping straight to
 * the new figure. Used anywhere a fantasy-points total updates live (squad
 * total, live gameweek points, league standings) so a score bump reads as
 * motion, not a page refresh. Flashes cyan on increase via the existing
 * `.animate-points-flash` keyframe (src/index.css) for the final settle.
 */
export default function NumberFlow({
  value,
  duration = 600,
  format = (n) => Math.round(n).toString(),
  flashOnIncrease = true,
  style,
  className,
  ...rest
}) {
  const [display, setDisplay] = useState(value);
  const [flash, setFlash] = useState(false);
  const fromRef = useRef(value);
  const rafRef = useRef(null);
  const flashTimerRef = useRef(null);

  useEffect(() => {
    const from = fromRef.current;
    if (from === value) return undefined;

    if (prefersReducedMotion()) {
      fromRef.current = value;
      setDisplay(value);
      return undefined;
    }

    const delta = value - from;
    const start = performance.now();

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + delta * eased);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
        setDisplay(value);
        rafRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    if (flashOnIncrease && delta > 0) {
      setFlash(false);
      requestAnimationFrame(() => setFlash(true));
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlash(false), 400);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(flashTimerRef.current);
    };
  }, [value, duration, flashOnIncrease]);

  return (
    <span
      className={['tabular-nums', flash ? 'animate-points-flash' : '', className].filter(Boolean).join(' ')}
      style={style}
      {...rest}
    >
      {format(display)}
    </span>
  );
}
