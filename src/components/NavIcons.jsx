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

export const NavIconRecap = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="16" width="4" height="4" rx="1" fill={MUTE} />
    <rect x="10" y="12" width="4" height="8" rx="1" fill={PAPER} />
    <rect x="16" y="8" width="4" height="12" rx="1" fill={CYAN} />
    <rect x="4" y="5" width="16" height="1" rx="0.5" fill={MUTE} opacity="0.3" />
  </svg>
);

export const NavIconPredictions = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="4" width="4" height="2" rx="1" fill={CYAN} />
    <rect x="5" y="9" width="4" height="2" rx="1" fill={PAPER} />
    <rect x="15" y="9" width="4" height="2" rx="1" fill={PAPER} />
    <line x1="12" y1="6" x2="7" y2="9" stroke={MUTE} strokeWidth="1" opacity="0.4" />
    <line x1="12" y1="6" x2="17" y2="9" stroke={MUTE} strokeWidth="1" opacity="0.4" />
    <rect x="3" y="14" width="4" height="2" rx="1" fill={MUTE} />
    <rect x="10" y="14" width="4" height="2" rx="1" fill={MUTE} />
    <rect x="17" y="14" width="4" height="2" rx="1" fill={MUTE} />
    <line x1="7" y1="11" x2="5" y2="14" stroke={MUTE} strokeWidth="1" opacity="0.3" />
    <line x1="7" y1="11" x2="12" y2="14" stroke={MUTE} strokeWidth="1" opacity="0.3" />
    <line x1="17" y1="11" x2="12" y2="14" stroke={MUTE} strokeWidth="1" opacity="0.3" />
    <line x1="17" y1="11" x2="19" y2="14" stroke={MUTE} strokeWidth="1" opacity="0.3" />
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

// ── F1 Navigation Icons ───────────────────────────────────────────────────────

export const NavIconF1Calendar = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="5" width="16" height="2" rx="1" fill={CYAN} />
    <rect x="4" y="9" width="16" height="1" rx="0.5" fill={MUTE} opacity="0.25" />
    <rect x="4" y="12" width="5" height="2" rx="1" fill={PAPER} />
    <rect x="10" y="12" width="5" height="2" rx="1" fill={MUTE} opacity="0.4" />
    <rect x="4" y="16" width="5" height="2" rx="1" fill={MUTE} opacity="0.4" />
    <rect x="10" y="16" width="5" height="2" rx="1" fill={PAPER} />
    <rect x="16" y="12" width="4" height="2" rx="1" fill={MUTE} opacity="0.4" />
    <rect x="16" y="16" width="4" height="2" rx="1" fill={MUTE} opacity="0.4" />
  </svg>
);

export const NavIconF1Picks = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="6" width="16" height="2" rx="1" fill={MUTE} opacity="0.25" />
    <rect x="4" y="10" width="10" height="2" rx="1" fill={CYAN} />
    <rect x="4" y="14" width="16" height="2" rx="1" fill={MUTE} opacity="0.25" />
    <path d="M16 9L18.5 11.5L16 14" stroke={CYAN} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const NavIconF1Standings = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="17" width="4" height="3" rx="1" fill={MUTE} />
    <rect x="10" y="13" width="4" height="7" rx="1" fill={PAPER} />
    <rect x="16" y="9" width="4" height="11" rx="1" fill={CYAN} />
    <path d="M17 8L20 5L17 5" stroke={CYAN} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const NavIconF1Report = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="4" width="14" height="1.5" rx="0.75" fill={MUTE} opacity="0.3" />
    <rect x="5" y="8" width="10" height="2" rx="1" fill={PAPER} />
    <rect x="5" y="12" width="14" height="2" rx="1" fill={CYAN} />
    <rect x="5" y="16" width="8" height="2" rx="1" fill={MUTE} opacity="0.4" />
  </svg>
);

export const NavIconF1Season = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 4L13.8 9.4H19.5L14.85 12.6L16.65 18L12 14.8L7.35 18L9.15 12.6L4.5 9.4H10.2L12 4Z" fill={CYAN} opacity="0.85" />
  </svg>
);

export const NavIconClubhouse = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="7"   r="2.5" fill={CYAN} />
    <circle cx="6.5"  cy="14" r="2"   fill={PAPER} />
    <circle cx="17.5" cy="14" r="2"   fill={PAPER} />
    <rect x="4" y="20" width="16" height="1.5" rx="0.75" fill={MUTE} opacity="0.4" />
    <rect x="11" y="9.5" width="2" height="3" rx="1" fill={MUTE} opacity="0.3" />
  </svg>
);

// ── Clubhouse-level Navigation Icons (mobile bottom bar) ───────────────────────

export const NavIconHome = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 11L12 4L20 11" stroke={CYAN} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="6" y="11" width="12" height="9" rx="1" fill={PAPER} />
    <rect x="10" y="15" width="4" height="5" rx="0.5" fill={MUTE} opacity="0.4" />
  </svg>
);

export const NavIconTrophy = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M7 4H17V10C17 13 14.5 15 12 15C9.5 15 7 13 7 10V4Z" fill={CYAN} />
    <path d="M7 5H4V7C4 9 5.5 10.5 7 10.5" stroke={MUTE} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    <path d="M17 5H20V7C20 9 18.5 10.5 17 10.5" stroke={MUTE} strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
    <rect x="11" y="15" width="2" height="3" fill={PAPER} />
    <rect x="8" y="18" width="8" height="2" rx="1" fill={MUTE} opacity="0.4" />
  </svg>
);

export const NavIconChallenges = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8" fill={CYAN} opacity="0.85" />
    <circle cx="12" cy="12" r="8" stroke={PAPER} strokeWidth="1" opacity="0.3" />
    <path d="M9 12L11 14L15.5 9.5" stroke={PAPER} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const NavIconMyBets = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="4" y="4" width="10" height="10" rx="2" fill={MUTE} opacity="0.25" />
    <circle cx="7" cy="7" r="1.1" fill={PAPER} />
    <circle cx="11" cy="11" r="1.1" fill={PAPER} />
    <rect x="10" y="10" width="10" height="10" rx="2" fill={CYAN} />
    <circle cx="13.5" cy="13.5" r="1.1" fill={PAPER} />
    <circle cx="16.5" cy="16.5" r="1.1" fill={PAPER} />
    <circle cx="13.5" cy="16.5" r="1.1" fill={PAPER} />
    <circle cx="16.5" cy="13.5" r="1.1" fill={PAPER} />
  </svg>
);
