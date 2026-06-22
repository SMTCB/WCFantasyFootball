// Shared auth guard for edge functions that should only be called by cron jobs
// or internal admin tooling — not by anonymous users.
//
// Accepts:
//   A) Exact Bearer match against SUPABASE_SERVICE_ROLE_KEY (new sb_secret_... format)
//   B) Old-format service-role JWT (eyJ... — still used by cron commands) — signature
//      verified with HMAC-SHA256 using SUPABASE_JWT_SECRET, then role=service_role checked
//
// Usage:
//   import { requireServiceRole } from '../_shared/auth.ts';
//   // at the top of your handler, after method check:
//   const authErr = await requireServiceRole(req);
//   if (authErr) return authErr;

export async function requireServiceRole(req: Request): Promise<Response | null> {
  const auth       = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Path A: exact match (new sb_secret_... format or old eyJ... stored as env var)
  if (serviceKey && auth === `Bearer ${serviceKey}`) return null;

  // Path B: old-format eyJ... JWT sent by cron commands — verify HMAC-SHA256 signature
  // before trusting any claim in the payload.
  const jwtSecret = Deno.env.get('SUPABASE_JWT_SECRET') ?? '';
  if (jwtSecret) {
    try {
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      const parts = token.split('.');
      if (parts.length === 3) {
        const signingInput = `${parts[0]}.${parts[1]}`;
        const b64sig = parts[2].replace(/-/g, '+').replace(/_/g, '/');
        const sigBytes = Uint8Array.from(atob(b64sig), (c) => c.charCodeAt(0));
        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(jwtSecret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['verify'],
        );
        const valid = await crypto.subtle.verify(
          'HMAC',
          cryptoKey,
          sigBytes,
          new TextEncoder().encode(signingInput),
        );
        if (valid) {
          const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
          if (payload.role === 'service_role') return null;
        }
      }
    } catch { /* malformed JWT or crypto error — fall through to 401 */ }
  }

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
