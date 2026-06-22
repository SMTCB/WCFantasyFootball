// OpenF1 API client — ported from FantasyF1/src/lib/openf1.ts
// Framework-agnostic. Base URL: https://api.openf1.org/v1

const BASE = 'https://api.openf1.org/v1';
const TIMEOUT_MS = 10000;

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`OpenF1 ${res.status}: ${url}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 500 * (i + 1)));
    }
  }
}

/**
 * Fetch the qualifying session for a given round in a given year.
 * Returns { session_key, date_start } or null.
 */
export async function fetchQualifyingSession(year, roundNumber) {
  try {
    const data = await fetchWithRetry(
      `${BASE}/sessions?year=${year}&session_name=Qualifying&round_number=${roundNumber}`
    );
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the race session for a given round in a given year.
 * Returns { session_key, date_start } or null.
 */
export async function fetchRaceSession(year, roundNumber) {
  try {
    const data = await fetchWithRetry(
      `${BASE}/sessions?year=${year}&session_name=Race&round_number=${roundNumber}`
    );
    return data?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch race result positions for a session_key.
 * Returns array of { driver_number, full_name, position } sorted by position.
 */
export async function fetchSessionResult(sessionKey) {
  try {
    const [positions, drivers] = await Promise.all([
      fetchWithRetry(`${BASE}/position?session_key=${sessionKey}&position<=3`),
      fetchWithRetry(`${BASE}/drivers?session_key=${sessionKey}`),
    ]);

    const driverMap = {};
    for (const d of drivers) {
      driverMap[d.driver_number] = d.full_name ?? `${d.first_name} ${d.last_name}`;
    }

    const finalPositions = {};
    for (const p of positions) {
      if (!finalPositions[p.driver_number] || p.date > finalPositions[p.driver_number].date) {
        finalPositions[p.driver_number] = p;
      }
    }

    return Object.values(finalPositions)
      .sort((a, b) => a.position - b.position)
      .slice(0, 3)
      .map(p => ({ driver_number: p.driver_number, name: driverMap[p.driver_number] ?? String(p.driver_number), position: p.position }));
  } catch {
    return [];
  }
}

/**
 * Fetch DNF drivers for a session (drivers who started but did not finish).
 */
export async function fetchDNFDrivers(sessionKey) {
  try {
    const data = await fetchWithRetry(`${BASE}/drivers?session_key=${sessionKey}`);
    return data?.filter(d => d.team_colour != null).map(d => d.full_name ?? `${d.first_name} ${d.last_name}`) ?? [];
  } catch {
    return [];
  }
}

/**
 * Fetch current championship standings.
 * Returns array of { driver_name, points, position } for drivers.
 */
export async function fetchDriverStandings(year) {
  try {
    const data = await fetchWithRetry(`${BASE}/championship?year=${year}&championship_type=driver`);
    return (data ?? []).map(d => ({
      position: d.position,
      driver_name: d.driver_name ?? d.full_name,
      points: d.points,
    })).sort((a, b) => a.position - b.position);
  } catch {
    return [];
  }
}
