// Edge Function: discover-tournament
// Purpose: Probe the Forza API for tournaments by ID range, searching for matches
// Input: { search_term: "World Cup", id_range: { start: 450, end: 550 } }
// Output: { found: true, tournaments: [{ id, name, region, season_status }] }

import { requireServiceRole } from '../_shared/auth.ts';

const FORZA_API_BASE = 'https://api.forzafootball.com';
const FORZA_TOKEN = Deno.env.get('FORZA_ACCESS_TOKEN');

// DATA-17: redact access_token from any log output
function redactToken(str) {
  return String(str).replace(/access_token=[^&\s"']*/gi, 'access_token=REDACTED');
}

// Helper: test if a tournament ID exists and get its info
async function fetchTournament(tournamentId, retries = 3, timeout = 10000) {
  const url = `${FORZA_API_BASE}/v1/tournaments/${tournamentId}?access_token=${FORZA_TOKEN}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      // 200 = exists, 404 = doesn't exist
      if (response.ok) {
        const data = await response.json();
        return { exists: true, data };
      } else if (response.status === 404) {
        return { exists: false };
      } else {
        // Retry on 5xx errors
        if (response.status >= 500) {
          console.log(`[Attempt ${attempt + 1}] HTTP ${response.status} for tournament ${tournamentId}, retrying...`);
          continue;
        }
        return { exists: false, status: response.status };
      }
    } catch (error) {
      if (attempt < retries - 1) {
        // DATA-17: never log raw URLs containing access_token
        console.log(`[Attempt ${attempt + 1}] Error fetching tournament ${tournamentId}: ${redactToken(error.message)}, retrying...`);
        await new Promise(r => setTimeout(r, 2000)); // 2s backoff
        continue;
      }
      return { exists: false, error: redactToken(error.message) };
    }
  }

  return { exists: false, error: 'Max retries exceeded' };
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use POST.' }),
        { status: 405, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const authErr = await requireServiceRole(req);
    if (authErr) return authErr;

    const body = await req.json();
    const searchTerm = body.search_term || 'World Cup';
    const idRange = body.id_range || { start: 420, end: 550 };

    console.log(`[discover-tournament] Searching for "${searchTerm}" in tournament ID range ${idRange.start}-${idRange.end}`);

    const found = [];
    const BATCH = 5; // DATA-16: probe 5 IDs concurrently to speed up range scans

    // Build list of IDs to probe
    const ids = [];
    for (let id = idRange.start; id <= idRange.end; id++) ids.push(id);

    // Process in concurrent batches
    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      const results = await Promise.all(batch.map(id => fetchTournament(id)));

      for (let j = 0; j < batch.length; j++) {
        const id     = batch[j];
        const result = results[j];
        if (!result.exists || !result.data) continue;

        // API wraps tournament in { tournament: {...} }
        const tournament = result.data.tournament;
        const name = tournament.name || '';
        const matches = name.toLowerCase().includes(searchTerm.toLowerCase());

        console.log(`[${id}] Found: "${name}" ${matches ? '✓ MATCH' : '(skip)'}`);

        if (matches) {
          found.push({
            id: tournament.id,
            name: tournament.name,
            region: tournament.region,
            season_status: tournament.season_status,
            current_season: tournament.current_season,
          });
        }
      }
    }

    console.log(`[discover-tournament] Search complete. Found ${found.length} tournaments matching "${searchTerm}"`);

    return new Response(
      JSON.stringify({
        found: found.length > 0,
        search_term: searchTerm,
        id_range: idRange,
        tournaments: found,
        count: found.length,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[discover-tournament] Error:', error.message);
    return new Response(
      JSON.stringify({
        error: error.message,
        status: 'failed',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
