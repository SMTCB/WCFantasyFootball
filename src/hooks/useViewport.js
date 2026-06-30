import { useState, useEffect } from 'react';

const MOBILE_MAX  = 640;
const TABLET_MAX  = 1023;

function getViewport() {
  if (typeof window === 'undefined') {
    // SSR / initial-render safe: default to desktop, corrected on mount
    return { isMobile: false, isTablet: false, isDesktop: true, width: 1280 };
  }
  const w = window.innerWidth;
  return {
    isMobile:  w < MOBILE_MAX,
    isTablet:  w >= MOBILE_MAX && w <= TABLET_MAX,
    isDesktop: w > TABLET_MAX,
    width: w,
  };
}

/**
 * Returns the current viewport tier and width.
 * - isMobile:  < 640px  (phones)
 * - isTablet:  640–1023px  (tablets — currently get the phone layout; tablet tier is Phase M4)
 * - isDesktop: ≥ 1024px (matches Tailwind `lg:`)
 *
 * Use for *data-shape* decisions (card vs grid). Use Tailwind `lg:` for
 * simple show/hide where a dual DOM tree is cheap.
 */
export function useViewport() {
  const [viewport, setViewport] = useState(getViewport);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${TABLET_MAX}px)`);
    const handler = () => setViewport(getViewport());
    mql.addEventListener('change', handler);
    // Correct any SSR mismatch on mount
    setViewport(getViewport());
    return () => mql.removeEventListener('change', handler);
  }, []);

  return viewport;
}

/** Convenience: true when width < 640px. */
export function useIsMobile() {
  return useViewport().isMobile;
}
