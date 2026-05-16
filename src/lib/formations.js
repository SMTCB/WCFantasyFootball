// Canonical position metadata — single source of truth for all screens.
// Importing from here instead of defining locally prevents each screen from
// drifting out of sync and makes cross-competition support a one-file change.

export const POS_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

export const POS_LABEL = {
  GK:  'Goalkeeper',
  DEF: 'Defenders',
  MID: 'Midfielders',
  FWD: 'Forwards',
};

// CSS-var tones for player cards and squad pitch views
export const POS_TONE = {
  GK:  'var(--pos-gk)',
  DEF: 'var(--pos-def)',
  MID: 'var(--pos-mid)',
  FWD: 'var(--pos-fwd)',
};

// Y-axis percentages for the formation pitch display (LiveScreen)
export const POS_PITCH_Y = { FWD: 14, MID: 38, DEF: 64, GK: 88 };

// Per-position config for market/transfer badge rows (label, badge colour, bg tint)
export const POS_CONFIG = {
  GK:  { label: 'GK',  color: 'var(--gold)',   bg: 'rgba(240,180,0,0.14)'  },
  DEF: { label: 'DEF', color: 'var(--cyan)',   bg: 'rgba(0,196,232,0.14)'  },
  MID: { label: 'MID', color: 'var(--pos-gk)', bg: 'rgba(157,95,245,0.14)' },
  FWD: { label: 'FWD', color: 'var(--danger)', bg: 'rgba(240,58,58,0.14)'  },
};

// Badge colours for squad section headers (gold for GK, etc.)
export const POS_BADGE_COLOR = {
  GK:  'var(--gold)',
  DEF: 'var(--cyan)',
  MID: 'var(--pos-gk)',
  FWD: 'var(--danger)',
};

// Filter tab order for the market (includes 'ALL' sentinel)
export const POS_FILTER_ORDER = ['ALL', ...POS_ORDER];
