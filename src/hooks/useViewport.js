import { useState, useEffect } from 'react';

const MOBILE_MAX = 639;
const TABLET_MAX = 1023;

function getViewport() {
  if (typeof window === 'undefined') {
    return { isMobile: false, isTablet: false, isDesktop: true, width: 1280 };
  }
  const w = window.innerWidth;
  return {
    isMobile:  w <= MOBILE_MAX,
    isTablet:  w > MOBILE_MAX && w <= TABLET_MAX,
    isDesktop: w > TABLET_MAX,
    width: w,
  };
}

export function useViewport() {
  const [viewport, setViewport] = useState(getViewport);
  useEffect(() => {
    const handler = () => setViewport(getViewport());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return viewport;
}

export function useIsMobile()  { return useViewport().isMobile; }
export function useIsTablet()  { return useViewport().isTablet; }
export function useIsDesktop() { return useViewport().isDesktop; }
