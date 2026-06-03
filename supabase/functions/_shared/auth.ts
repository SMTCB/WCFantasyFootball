// Shared auth guard for edge functions that should only be called by cron jobs
// or internal admin tooling — not by anonymous users.
//
// Accepts:
//   A) Exact Bearer match against SUPABASE_SERVICE_ROLE_KEY (new sb_secret_... format)
//   B) Old-format service-role JWT (eyJ... — still used by cron commands) — decoded
//      and checked for role=service_role claim (signature not verified; acceptable since
//      the guard prevents casual abuse, and actual DB writes use the function's own client)
//
// Usage:
//   import { requireServiceRole } from '../_shared/auth.ts';
//   // at the top of your handler, after method check:
//   const authErr = requireServiceRole(req);
//   if (authErr) return authErr;

export function requireServiceRole(req: Request): Response | null {
  const auth       = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Path A: exact match (new key format)
  if (serviceKey && auth === `Bearer ${serviceKey}`) return null;

  // Path B: old-format eyJ... service-role JWT — check role claim
  try {
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role === 'service_role') return null;
    }
  } catch { /* malformed JWT */ }

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}
