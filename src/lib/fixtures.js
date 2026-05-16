// Shared fixture utilities — single source of truth for all screens.
// Importing from here prevents HomeScreen, ScoresScreen, LiveScreen, etc.
// from drifting out of sync on team codes, date formatting, and competition detection.

// ── Competition registry ──────────────────────────────────────────────────────
export const COMPS = {
  EPL: { code: 'EPL', name: 'PREMIER LEAGUE',   tone: '#00B4D8' },
  UCL: { code: 'UCL', name: 'CHAMPIONS LEAGUE', tone: '#E0A800' },
  UEL: { code: 'UEL', name: 'EUROPA LEAGUE',    tone: '#A855F7' },
  FAC: { code: 'FAC', name: 'FA CUP',           tone: '#EF4444' },
};

// ── Date formatting ───────────────────────────────────────────────────────────
export const DAYS         = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
export const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
export const MONTHS_LONG  = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'];

// ── Team code lookup ──────────────────────────────────────────────────────────
// Falls back to the first 3 chars of the club name for any team not listed.
export const TEAM_CODES = {
  'Arsenal': 'ARS', 'Chelsea': 'CHE', 'Liverpool': 'LIV',
  'Man City': 'MCI', 'Manchester City': 'MCI',
  'Man Utd': 'MUN', 'Manchester United': 'MUN',
  'Spurs': 'TOT', 'Tottenham': 'TOT', 'Tottenham Hotspur': 'TOT',
  'Aston Villa': 'AVL', 'Newcastle': 'NEW', 'Newcastle United': 'NEW',
  'Brighton': 'BHA', 'Brighton & Hove Albion': 'BHA',
  'Fulham': 'FUL', 'Brentford': 'BRE', 'Crystal Palace': 'CRY',
  'Everton': 'EVE', 'Nottingham Forest': 'NFO',
  'West Ham': 'WHU', 'West Ham United': 'WHU',
  'Wolves': 'WOL', 'Wolverhampton': 'WOL',
  'Bournemouth': 'BOU', 'AFC Bournemouth': 'BOU',
  'Leeds United': 'LEE', 'Sheffield United': 'SHU',
  'Burnley': 'BUR', 'Luton': 'LUT', 'Sunderland': 'SUN',
  'Leicester City': 'LEI', 'Southampton': 'SOU',
  'Ipswich Town': 'IPS', 'Ipswich': 'IPS',
};

export function teamCode(name = '') {
  return TEAM_CODES[name] || (name || '???').substring(0, 3).toUpperCase();
}

// ── Competition detection ─────────────────────────────────────────────────────
export function detectComp(competition) {
  if (!competition) return 'EPL';
  const lc = competition.toLowerCase();
  if (lc.includes('champions')) return 'UCL';
  if (lc.includes('europa'))    return 'UEL';
  if (lc.includes('fa cup'))    return 'FAC';
  return 'EPL';
}

// ── Fixture normalization ─────────────────────────────────────────────────────
// Converts a raw Supabase fixtures row into the shape all screens expect.
export function normalizeFixture(f) {
  const d        = new Date(f.kickoff_at);
  const hasScore = f.status === 'finished' || f.status === 'live';
  return {
    id:      f.id,
    date:    f.kickoff_at ? d.toISOString().split('T')[0] : '1970-01-01',
    day:     DAYS[d.getDay()],
    dnum:    String(d.getDate()),
    dlong:   `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`,
    kickoff: d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    comp:    detectComp(f.competition),
    gw:      f.round_number ?? 1,
    status:  f.status === 'finished' ? 'FT' : f.status === 'live' ? 'LIVE' : 'KO',
    live:    f.status === 'live' ? (f.minute ? `${f.minute}'` : 'LIVE') : undefined,
    home:    { name: f.home_team, code: teamCode(f.home_team) },
    away:    { name: f.away_team, code: teamCode(f.away_team) },
    score:   hasScore ? [f.home_score ?? 0, f.away_score ?? 0] : null,
  };
}
