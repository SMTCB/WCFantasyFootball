import { useEffect, useState } from 'react';

// 2026 F1 season constants — ported from FantasyF1/src/lib/f1-data.ts

export const DRIVERS = [
  'Max Verstappen',
  'Isack Hadjar',
  'Charles Leclerc',
  'Lewis Hamilton',
  'George Russell',
  'Kimi Antonelli',
  'Lando Norris',
  'Oscar Piastri',
  'Fernando Alonso',
  'Lance Stroll',
  'Pierre Gasly',
  'Franco Colapinto',
  'Alex Albon',
  'Carlos Sainz Jr.',
  'Esteban Ocon',
  'Oliver Bearman',
  'Nico Hülkenberg',
  'Gabriel Bortoleto',
  'Liam Lawson',
  'Arvid Lindblad',
  'Valtteri Bottas',
  'Sergio Pérez',
];

export const TEAMS = [
  'Red Bull',
  'Ferrari',
  'Mercedes',
  'McLaren',
  'Aston Martin',
  'Alpine',
  'Williams',
  'Haas',
  'Audi',
  'Racing Bulls',
  'Cadillac',
];

// Points awarded per prediction field (from FantasyF1 scoring constants)
export const SCORING = {
  p1_exact: 10,
  p2_exact: 8,
  p3_exact: 6,
  p1_wrong_spot: 3,   // predicted driver IS on podium but not in this exact spot
  p2_wrong_spot: 3,
  p3_wrong_spot: 3,
  dnf_correct: 5,
  team_correct: 5,
  special_correct: 5,
  all_correct_bonus: 3,  // bonus when all 6 fields are correct in one race
};

// Special category options lookup (for type='options' races)
// These mirror what was seeded in migration 192
export const SPECIAL_OPTIONS = {
  1:  ['1', '2', '3', '4+'],
  10: ['Under 1 second', '1–5 seconds', '5–10 seconds', '10+ seconds'],
  11: ['0', '1', '2', '3+'],
  13: ['0', '1', '2', '3+'],
  15: ['0', '1', '2', '3+'],
  20: ['0', '1', '2', '3+'],
};

// Flag emoji lookup by country/GP
export const GP_FLAGS = {
  'Australian GP':          '🇦🇺',
  'Chinese GP':             '🇨🇳',
  'Japanese GP':            '🇯🇵',
  'Bahrain GP':             '🇧🇭',
  'Saudi Arabian GP':       '🇸🇦',
  'Miami GP':               '🇺🇸',
  'Canadian GP':            '🇨🇦',
  'Monaco GP':              '🇲🇨',
  'Barcelona-Catalunya GP': '🇪🇸',
  'Austrian GP':            '🇦🇹',
  'British GP':             '🇬🇧',
  'Belgian GP':             '🇧🇪',
  'Hungarian GP':           '🇭🇺',
  'Dutch GP':               '🇳🇱',
  'Italian GP':             '🇮🇹',
  'Spanish GP (Madrid)':    '🇪🇸',
  'Azerbaijan GP':          '🇦🇿',
  'Singapore GP':           '🇸🇬',
  'United States GP':       '🇺🇸',
  'Mexico City GP':         '🇲🇽',
  'Sao Paulo GP':           '🇧🇷',
  'Las Vegas GP':           '🇺🇸',
  'Qatar GP':               '🇶🇦',
  'Abu Dhabi GP':           '🇦🇪',
};

export function getFlag(gpName) {
  return GP_FLAGS[gpName] ?? '🏁';
}

// 2026 grid: each driver's team, for the team colour bar on pick rows.
export const DRIVER_TEAM = {
  'Max Verstappen': 'Red Bull',       'Isack Hadjar': 'Red Bull',
  'Charles Leclerc': 'Ferrari',       'Lewis Hamilton': 'Ferrari',
  'George Russell': 'Mercedes',       'Kimi Antonelli': 'Mercedes',
  'Lando Norris': 'McLaren',          'Oscar Piastri': 'McLaren',
  'Fernando Alonso': 'Aston Martin',  'Lance Stroll': 'Aston Martin',
  'Pierre Gasly': 'Alpine',           'Franco Colapinto': 'Alpine',
  'Alex Albon': 'Williams',           'Carlos Sainz Jr.': 'Williams',
  'Esteban Ocon': 'Haas',             'Oliver Bearman': 'Haas',
  'Nico Hülkenberg': 'Audi',          'Gabriel Bortoleto': 'Audi',
  'Liam Lawson': 'Racing Bulls',      'Arvid Lindblad': 'Racing Bulls',
  'Valtteri Bottas': 'Cadillac',      'Sergio Pérez': 'Cadillac',
};

export const TEAM_COLOR = {
  'Red Bull': '#1E3A8A',     'Ferrari': '#DC2626',  'Mercedes': '#0D9488',
  'McLaren': '#FF8000',      'Aston Martin': '#166534', 'Alpine': '#2563EB',
  'Williams': '#1D4ED8',     'Haas': '#6B7280',     'Audi': '#9CA3AF',
  'Racing Bulls': '#4F46E5', 'Cadillac': '#18202E',
};

// Three-letter code for each GP, shown on the round tiles.
export const GP_CODE = {
  'Australian GP': 'AUS', 'Chinese GP': 'CHN', 'Japanese GP': 'JPN', 'Bahrain GP': 'BHR',
  'Saudi Arabian GP': 'SAU', 'Miami GP': 'MIA', 'Canadian GP': 'CAN', 'Monaco GP': 'MON',
  'Barcelona-Catalunya GP': 'BAR', 'Austrian GP': 'AUT', 'British GP': 'GBR', 'Belgian GP': 'BEL',
  'Hungarian GP': 'HUN', 'Dutch GP': 'NED', 'Italian GP': 'ITA', 'Spanish GP (Madrid)': 'MAD',
  'Azerbaijan GP': 'AZE', 'Singapore GP': 'SIN', 'United States GP': 'USA', 'Mexico City GP': 'MEX',
  'Sao Paulo GP': 'SAO', 'Las Vegas GP': 'LVG', 'Qatar GP': 'QAT', 'Abu Dhabi GP': 'ABU',
};

export function gpCode(gpName) {
  return GP_CODE[gpName] ?? (gpName ?? '').replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase();
}

// Last name for compact result tiles ("Carlos Sainz Jr." → "Sainz").
export function lastName(driver) {
  if (!driver) return '';
  const parts = driver.replace(/ Jr\.?$/, '').split(' ');
  return parts[parts.length - 1];
}

// Three-letter driver code for compact tiles ("Nico Hülkenberg" → "HUL").
export function driverCode(driver) {
  return lastName(driver).normalize('NFD').replace(/[̀-ͯ]/g, '').slice(0, 3).toUpperCase();
}

// Picks close 5 minutes before lights out, unless an admin reopened them.
export function picksLockAt(race) {
  return race?.race_at ? new Date(new Date(race.race_at).getTime() - 5 * 60000) : null;
}

export function picksLocked(race, now = new Date()) {
  if (!race || race.is_manual_unlock) return false;
  const lock = picksLockAt(race);
  return lock ? now >= lock : false;
}

// ── Formatting and timing helpers for the F1 league screens ──────────────
// Kept here, not in components/f1/F1Kit.jsx, so the kit file exports only
// components (fast refresh) and every screen shares one leaf module.

// Re-renders the caller every `ms` so countdowns stay current.
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const pad = n => String(n).padStart(2, '0');

// "1D 02H 14M", or "02H 14M" inside a day.
export function formatCountdown(ms) {
  if (ms == null || ms <= 0) return null;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}D ${pad(h)}H ${pad(m)}M` : `${pad(h)}H ${pad(m)}M`;
}

// Short form for buttons: "1D 02H" or "02H 14M".
export function formatCountdownShort(ms) {
  if (ms == null || ms <= 0) return null;
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return d > 0 ? `${d}D ${pad(h)}H` : `${pad(h)}H ${pad(m)}M`;
}

// "Sun 15:55" in the viewer's own time zone.
export function formatWhen(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatDay(date) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase();
}

// How many of the five start lights are lit: one more for each step closer to the lock.
export function lightsLit(msToLock) {
  if (msToLock == null || msToLock <= 0) return 0;
  const H = 3600000;
  if (msToLock <= H) return 5;
  if (msToLock <= 6 * H) return 4;
  if (msToLock <= 24 * H) return 3;
  if (msToLock <= 72 * H) return 2;
  if (msToLock <= 168 * H) return 1;
  return 0;
}

export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return s.toUpperCase();
}

