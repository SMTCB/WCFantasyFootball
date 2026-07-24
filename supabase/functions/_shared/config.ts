// Central configuration for all Edge Functions.
// All values are sourced from environment variables — never hardcoded.
//
// Supabase Edge Function runtime automatically injects:
//   SUPABASE_URL              — e.g. https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — service role JWT
//   SUPABASE_ANON_KEY         — anon JWT
//
// SUPABASE_PROJECT_REF is optional — if not explicitly set, it is derived
// from SUPABASE_URL. Set it explicitly only when SUPABASE_URL is unavailable
// (e.g. a standalone script context).

export const SUPABASE_URL: string = Deno.env.get('SUPABASE_URL') ?? '';
export const SUPABASE_SERVICE_ROLE_KEY: string = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
export const SUPABASE_ANON_KEY: string = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

// Derive the project ref from SUPABASE_URL, or fall back to an explicit env var.
export const PROJECT_REF: string = (() => {
  const explicit = Deno.env.get('SUPABASE_PROJECT_REF');
  if (explicit) return explicit;
  const match = SUPABASE_URL.match(/https?:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] ?? '';
})();

export const FUNCTIONS_BASE_URL: string = PROJECT_REF
  ? `https://${PROJECT_REF}.supabase.co/functions/v1`
  : '';
