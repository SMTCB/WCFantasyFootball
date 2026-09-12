import { useRef, useState, useCallback, useEffect } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const THUMB = 44;
const CONFIRM_THRESHOLD = 0.82;

/**
 * SlideToConfirm — drag-to-confirm control for irreversible actions (selling
 * a player, cancelling a listing, leaving a league). Adds deliberate friction
 * that a tap doesn't: you can't fat-finger it. Falls back to a plain tap
 * target when prefers-reduced-motion is set, since the gesture itself is the
 * thing being reduced, not just its animation.
 */
export default function SlideToConfirm({
  label = 'Slide to confirm',
  confirmingLabel = 'Release to confirm',
  onConfirm,
  disabled = false,
  danger = false,
  style,
}) {
  const trackRef = useRef(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [settling, setSettling] = useState(false);
  const [maxX, setMaxX] = useState(0);
  const reduced = prefersReducedMotion();

  const tone = danger ? 'var(--danger)' : 'var(--cyan)';

  const clamp = (x) => Math.max(0, Math.min(maxX, x));

  const handlePointerDown = useCallback((e) => {
    if (disabled || reduced) return;
    const track = trackRef.current;
    if (!track) return;
    setMaxX(track.clientWidth - THUMB);
    setDragging(true);
    setSettling(false);
    e.target.setPointerCapture?.(e.pointerId);
  }, [disabled, reduced]);

  const handlePointerMove = useCallback((e) => {
    if (!dragging) return;
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    setDragX(clamp(e.clientX - rect.left - THUMB / 2));
  }, [dragging, maxX]);

  const finishDrag = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    const pct = maxX > 0 ? dragX / maxX : 0;
    if (pct >= CONFIRM_THRESHOLD) {
      setDragX(maxX);
      onConfirm?.();
    } else {
      setSettling(true);
      setDragX(0);
    }
  }, [dragging, dragX, maxX, onConfirm]);

  useEffect(() => {
    if (!settling) return undefined;
    const t = setTimeout(() => setSettling(false), 250);
    return () => clearTimeout(t);
  }, [settling]);

  if (reduced) {
    return (
      <button
        onClick={() => !disabled && onConfirm?.()}
        disabled={disabled}
        className="w-full"
        style={{
          minHeight: 48,
          borderRadius: 999,
          border: `1px solid ${tone}`,
          background: 'transparent',
          color: tone,
          fontFamily: 'Archivo Black, sans-serif',
          fontSize: 'var(--fs-micro)',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
          ...style,
        }}
      >
        {label}
      </button>
    );
  }

  const pct = maxX > 0 ? dragX / maxX : 0;

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct * 100)}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onConfirm?.(); }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      style={{
        position: 'relative',
        width: '100%',
        height: THUMB,
        borderRadius: 999,
        background: `color-mix(in srgb, ${tone} 10%, var(--elev))`,
        border: `1px solid color-mix(in srgb, ${tone} 30%, transparent)`,
        overflow: 'hidden',
        touchAction: 'none',
        cursor: disabled ? 'not-allowed' : 'grab',
        opacity: disabled ? 0.4 : 1,
        ...style,
      }}
    >
      {/* Fill trailing the thumb */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          width: dragX + THUMB / 2,
          background: `color-mix(in srgb, ${tone} 16%, transparent)`,
          transition: dragging ? 'none' : 'width 0.25s ease',
        }}
      />
      {/* Label */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'Archivo Black, sans-serif',
          fontSize: 'var(--fs-micro)',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: tone,
          opacity: Math.max(0, 1 - pct * 1.4),
          pointerEvents: 'none',
        }}
      >
        {pct > 0.15 ? confirmingLabel : label}
      </div>
      {/* Thumb */}
      <div
        style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: THUMB - 4,
          height: THUMB - 4,
          borderRadius: '50%',
          background: tone,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink)',
          transform: `translateX(${dragX}px)`,
          transition: dragging ? 'none' : 'transform 0.25s ease',
          boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </div>
    </div>
  );
}
