// Diagnostic: test-forza-api
// Simple function to verify Forza API connectivity and token validity

const FORZA_API_BASE = 'https://api.forzafootball.com';
const FORZA_TOKEN = Deno.env.get('FORZA_ACCESS_TOKEN');

Deno.serve(async (req) => {
  try {
    console.log('=== FORZA API DIAGNOSTIC ===');
    console.log(`Token present: ${FORZA_TOKEN ? 'YES' : 'NO'}`);
    console.log(`Token (first 20 chars): ${FORZA_TOKEN ? FORZA_TOKEN.substring(0, 20) + '...' : 'NONE'}`);

    // DATA-17: redact token from any logged or returned URLs
    const redactUrl = (u) => String(u).replace(/access_token=[^&\s"']*/gi, 'access_token=REDACTED');

    // Test 1: Known tournament (EPL = 426)
    const testUrl = `${FORZA_API_BASE}/v1/tournaments/426?access_token=${FORZA_TOKEN}`;
    console.log(`\nTest URL: ${redactUrl(testUrl)}`);

    const response = await fetch(testUrl, { signal: AbortSignal.timeout(10_000) });

    console.log(`Status: ${response.status}`);
    console.log(`OK: ${response.ok}`);
    console.log(`Headers:`, Object.fromEntries(response.headers.entries()));

    const body = await response.text();
    console.log(`Body (first 500 chars): ${body.substring(0, 500)}`);

    return new Response(
      JSON.stringify({
        status: response.status,
        ok: response.ok,
        token_set: !!FORZA_TOKEN,
        body: body.substring(0, 1000),
        url: redactUrl(testUrl),  // DATA-17: never return raw token in response
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error.message);
    return new Response(
      JSON.stringify({
        error: error.message,
        stack: error.stack,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
});
