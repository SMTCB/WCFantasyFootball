/**
 * NavIcons — Tactical Navigation Set (Revised)
 * Exact implementation from brand guidelines FORZA_BRANDMARK_ICON v1.9
 * Schematic set representing formation density and match data.
 */

const CYAN   = 'var(--cyan)';
const PAPER  = 'var(--paper)';
const MUTE   = 'var(--mute)';
const DANGER = 'var(--danger)';

export const NavIconScores = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="7" width="20" height="1.5" rx="0.75" fill={MUTE} opacity="0.2" />
    <rect x="6" y="11" width="12" height="2" rx="1" fill={CYAN} />
    <rect x="2" y="15" width="20" height="1.5" rx="0.75" fill={MUTE} opacity="0.2" />
    <rect x="11" y="10" width="2" height="4" rx="1" fill={PAPER} />
  </svg>
);

export const NavIconSquad = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="6" width="16" height="2" rx="1" fill={CYAN} />
    <rect x="4" y="11" width="6.5" height="2" rx="1" fill={PAPER} />
    <rect x="13.5" y="11" width="6.5" height="2" rx="1" fill={PAPER} />
    <circle cx="12" cy="12" r="1.5" fill={PAPER} />
    <rect x="4" y="16" width="16" height="2" rx="1" fill={MUTE} />
  </svg>
);

export const NavIconMarket = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="8" width="10" height="2" rx="1" fill={CYAN} />
    <rect x="10" y="14" width="10" height="2" rx="1" fill={MUTE} />
    <path d="M16 7L18 9L16 11" stroke={CYAN} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 13L6 15L8 17" stroke={MUTE} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const NavIconLeagues = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="5" width="4" height="2" rx="1" fill={CYAN} />
    <rect x="7" y="11" width="10" height="2" rx="1" fill={PAPER} />
    <rect x="4" y="17" width="16" height="2" rx="1" fill={MUTE} />
  </svg>
);

export const NavIconLive = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="7" width="8" height="2" rx="1" fill={MUTE} opacity="0.2" />
    <rect x="12" y="7" width="10" height="2" rx="1" fill={MUTE} opacity="0.2" />
    <rect x="4" y="11" width="16" height="2" rx="1" fill={DANGER} />
    <rect x="2" y="15" width="12" height="2" rx="1" fill={MUTE} opacity="0.2" />
    <rect x="16" y="15" width="6" height="2" rx="1" fill={MUTE} opacity="0.2" />
  </svg>
);
