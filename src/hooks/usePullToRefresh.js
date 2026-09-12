import { useEffect, useRef, useState } from 'react';

const PULL_THRESHOLD = 70;
const MAX_PULL = 110;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * usePullToRefresh — attaches a touch-driven pull gesture to a scrollable
 * container, firing onRefresh when released past PULL_THRESHOLD px. Only
 * arms when the container is already scrolled to the top, so it never
 * fights normal scrolling. No-ops under prefers-reduced-motion, since the
 * gesture itself — not just its animation — is what's being asked to reduce.
 *
 * `containerRef` must already point at its DOM node by the time this hook's
 * effect runs — if the ref is populated in a sibling effect (e.g. grabbing
 * a shared `#main-content` via document.getElementById), declare that effect
 * before this hook is called so it commits first.
 */
export default function usePullToRefresh(containerRef, onRefresh) {
  const [progress, setProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const dragRef = useRef({ active: false, startY: 0, progress: 0, locked: false });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onRefresh || prefersReducedMotion()) return undefined;

    const reset = () => {
      dragRef.current.active = false;
      dragRef.current.progress = 0;
      setProgress(0);
    };

    const onTouchStart = (e) => {
      if (el.scrollTop > 0 || dragRef.current.locked) return;
      dragRef.current.active = true;
      dragRef.current.startY = e.touches[0].clientY;
    };

    const onTouchMove = (e) => {
      if (!dragRef.current.active) return;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      if (dy <= 0 || el.scrollTop > 0) { reset(); return; }
      const p = Math.min(1, dy / MAX_PULL);
      dragRef.current.progress = p;
      setProgress(p);
    };

    const onTouchEnd = async () => {
      if (!dragRef.current.active) return;
      const p = dragRef.current.progress;
      dragRef.current.active = false;
      if (p >= PULL_THRESHOLD / MAX_PULL) {
        setProgress(1);
        setRefreshing(true);
        dragRef.current.locked = true;
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
          dragRef.current.locked = false;
          reset();
        }
      } else {
        reset();
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', reset, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', reset);
    };
  }, [containerRef, onRefresh]);

  return { pulling: progress > 0, progress, refreshing };
}
