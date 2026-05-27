import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function makeNoopClient() {
  // Minimal stub — every method returns a chainable thenable that resolves to
  // { data: null, error: null } so screens degrade to fallback data instead of
  // crashing when env vars are absent (e.g. E2E tests without .env.local).
  const resolved = { data: null, error: null };
  const thenable = {
    then:       (res)  => Promise.resolve(resolved).then(res),
    catch:      ()     => Promise.resolve(resolved),
  };
  const q = () => ({
    select: q, insert: q, update: q, upsert: q, delete: q,
    eq: q, neq: q, in: q, contains: q, order: q,
    limit: q, single: q, maybeSingle: q,
    ...thenable,
  });
  return {
    from:         () => q(),
    rpc:          () => ({ ...q(), single: q }),
    auth: {
      getSession:           () => Promise.resolve({ data: { session: null }, error: null }),
      getUser:              () => Promise.resolve({ data: { user: null },    error: null }),
      onAuthStateChange:    () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithPassword:   () => Promise.resolve({ data: null, error: null }),
      signUp:               () => Promise.resolve({ data: null, error: null }),
      signOut:              () => Promise.resolve(),
      resetPasswordForEmail:() => Promise.resolve({ error: null }),
      updateUser:           () => Promise.resolve({ error: null }),
    },
    channel: () => ({
      on:        function() { return this; },
      subscribe: () => {},
      send:      () => Promise.resolve(),
    }),
    removeChannel: () => {},
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
  };
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — ' +
    'running in offline-fallback mode. Create a .env.local file (see .env.example).'
  );
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : makeNoopClient();

/**
 * Base URL for direct edge-function fetch calls.
 * Use with: `fetch(`${FUNCTIONS_BASE}/function-name`, { ... })`
 */
export const FUNCTIONS_BASE = supabaseUrl
  ? `${supabaseUrl}/functions/v1`
  : null;
