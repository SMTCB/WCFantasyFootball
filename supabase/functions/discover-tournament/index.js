// Edge Function: discover-tournament
// Purpose: Probe the Forza API for tournaments by ID range, searching for matches
// Input: { search_term: "World Cup", id_range: { start: 450, end: 550 } }
// Output: { found: true, tournaments: [{ id, name, region, season_status }] }

import { requireServiceRole } from '../_shared/auth.ts';
import { forzaFetch } from '../_shared/providers/forza.ts';
import { logError } from '../_shared/log.ts';

// DATA-17: redact access_token from any log output
function redactToken(str) {
  return String(str).replace(/access_token=[^&\s"']*/gi, 'access_token=REDACTED');
}

// Helper: test if a tournament ID exists and get its info
async function fetchTournament(tournamentId) {
  try {
    const data = await forzaFetch(`/v1/tournaments/${tournamentId}`, 3);
    return { exists: true, data };
  } catch (error) {
    // 404s surface as an Error from forzaFetch — treat as non-existent
    if (error.message?.includes('HTTP 404')) return { exists: false };
    return { exists: false, error: redactToken(error.message) };
  }
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
    await logError('discover-tournament', 'error', error.message);
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
