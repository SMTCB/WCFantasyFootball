// Edge Function: lookup-tennis-tournament (TEMPORARY / DIAGNOSTIC — delete after use)
// Calls RapidAPI's tennis-api-atp-wta-itf provider server-side and returns the
// raw JSON, for inspecting response shapes without a browser session on the
// RapidAPI dashboard.
//
// POST body: { path: string }   — arbitrary path under /tennis/v2/
// Uses the existing RAPIDAPI_TENNIS_KEY secret — never exposes its value.

import { requireServiceRole } from '../_shared/auth.ts';

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return respond(405, { error: 'POST required' });
  const authErr = await requireServiceRole(req);
  if (authErr) return authErr;

  let path: string;
  try {
    const body = await req.json();
    path = body.path;
  } catch {
    return respond(400, { error: 'Invalid JSON body' });
  }
  if (!path) return respond(400, { error: 'path required' });

  const apiKey = Deno.env.get('RAPIDAPI_TENNIS_KEY') ?? '';
  if (!apiKey) return respond(500, { error: 'RAPIDAPI_TENNIS_KEY not configured' });

  const url = `https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/${path.replace(/^\/+/, '')}`;

  try {
    const res = await fetch(url, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'tennis-api-atp-wta-itf.p.rapidapi.com',
      },
    });
    const text = await res.text();
    let json: unknown;
    try { json = JSON.parse(text); } catch { json = text; }
    return respond(res.status, { ok: res.ok, status: res.status, url, raw: json });
  } catch (err) {
    return respond(500, { error: (err as Error).message });
  }
});
