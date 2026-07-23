// Vercel Edge Middleware — production access gate for the v2 cutover window.
//
// Activation (2 env vars, Production only, set in Vercel dashboard or `vercel env add`):
//   MAINTENANCE_MODE          = "true"            (turns the gate on/off — no redeploy needed to flip back off... a redeploy IS required, Vercel doesn't hot-reload env vars)
//   MAINTENANCE_BYPASS_TOKEN  = <long random string, e.g. `openssl rand -hex 24`>
//
// Neither var is VITE_-prefixed, so neither ships into the client JS bundle —
// the secret only ever lives on the edge.
//
// To get in while it's on: visit https://<domain>/unlock?token=<MAINTENANCE_BYPASS_TOKEN>
// once per browser. That sets a cookie and redirects to /; every request after that
// (any path, any device with that cookie) passes straight through to the real app.
//
// This blocks page loads only — it does not and cannot block direct calls to the
// Supabase REST/Realtime API from a browser that already has the anon key.

const COOKIE_NAME = 'ffl_bypass';

const MAINTENANCE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>Forza Fantasy League — Work in progress</title>
<style>
  :root {
    --ink: #080A0E;
    --ink-2: #0F1218;
    --paper: #F2EEE5;
    --mute: #8B95A1;
    --cyan: #00B4D8;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    height: 100%;
    background: var(--ink);
    color: var(--paper);
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    max-width: 480px;
    text-align: center;
  }
  .mark {
    display: inline-flex;
    align-items: baseline;
    margin-bottom: 40px;
  }
  .mark .word {
    font-weight: 900;
    font-style: italic;
    text-transform: uppercase;
    letter-spacing: -0.02em;
    font-size: 28px;
    color: var(--paper);
  }
  .mark .cut {
    width: 3px;
    height: 28px;
    background: var(--cyan);
    transform: rotate(14deg);
    margin: 0 9px;
    flex-shrink: 0;
    align-self: center;
  }
  .mark .stack {
    display: flex;
    flex-direction: column;
    line-height: 0.92;
  }
  .mark .stack span {
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.01em;
    font-size: 12px;
    color: var(--mute);
  }
  h1 {
    font-weight: 800;
    font-size: 22px;
    letter-spacing: -0.01em;
    margin: 0 0 12px;
  }
  p {
    font-size: 15px;
    line-height: 1.6;
    color: var(--mute);
    margin: 0;
  }
  .rule {
    width: 40px;
    height: 3px;
    background: var(--cyan);
    border-radius: 2px;
    margin: 24px auto;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="mark">
      <span class="word">Forza</span>
      <div class="cut"></div>
      <div class="stack"><span>Fantasy</span><span>League</span></div>
    </div>
    <h1>Work in progress</h1>
    <p>We're upgrading the platform behind the scenes. Check back in a few days &mdash; your leagues, squads and history will all be right where you left them.</p>
    <div class="rule"></div>
    <p>Questions? Reach out to your league admin.</p>
  </div>
</body>
</html>`;

function maintenanceResponse() {
  return new Response(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '259200',
      'x-frame-options': 'DENY',
      'x-content-type-options': 'nosniff',
    },
  });
}

export default function middleware(request) {
  if (process.env.MAINTENANCE_MODE !== 'true') {
    return; // gate is off — pass through untouched
  }

  const url = new URL(request.url);
  const bypassToken = process.env.MAINTENANCE_BYPASS_TOKEN;

  if (url.pathname === '/unlock') {
    const supplied = url.searchParams.get('token');
    const res = Response.redirect(new URL('/', url), 307);
    if (bypassToken && supplied === bypassToken) {
      res.headers.append(
        'set-cookie',
        `${COOKIE_NAME}=${supplied}; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax`
      );
    }
    return res;
  }

  const cookieHeader = request.headers.get('cookie') || '';
  const cookies = Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const idx = c.indexOf('=');
      return idx === -1 ? [c.trim(), ''] : [c.slice(0, idx).trim(), c.slice(idx + 1).trim()];
    })
  );

  if (bypassToken && cookies[COOKIE_NAME] === bypassToken) {
    return; // valid bypass cookie — pass through
  }

  return maintenanceResponse();
}

export const config = {
  matcher: '/((?!_vercel/).*)',
};
