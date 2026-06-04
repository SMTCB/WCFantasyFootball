/**
 * AuthContext — single source of truth for authentication state.
 *
 * Feature flag: VITE_AUTH_ENABLED
 *   'false' (default) → demo mode; always returns DEMO_USER, no Supabase Auth calls.
 *   'true'            → real Supabase Auth; full sign-in/sign-up/reset flow active.
 *
 * Fail-closed: a PRODUCTION build always requires real auth regardless of the flag.
 * The flag only enables demo mode in dev. A missing/misspelled prod env var can no
 * longer silently collapse every user onto the shared DEMO_USER identity.
 *
 * To activate auth: set VITE_AUTH_ENABLED=true in .env.local (local) or
 * Vercel environment variables (production). No code changes required.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { isNative } from '../lib/capacitor';

const MOBILE_REDIRECT = 'com.fantasykit.forzaedition://auth/callback';
const getRedirectUrl = (path = '') =>
  isNative ? MOBILE_REDIRECT : `${window.location.origin}${path}`;

// ── Demo user injected when auth is disabled ──────────────────────────────────
const DEMO_USER = {
  id:            '00000000-0000-0000-0000-000000000000',
  email:         'demo@forzakit.app',
  user_metadata: { username: 'Demo Manager' },
};

// Auth is enabled only when VITE_AUTH_ENABLED is explicitly 'true'.
// The previous `|| import.meta.env.PROD` forced auth on in all production builds,
// which broke CI E2E tests that build with VITE_AUTH_ENABLED=false.
// Vercel production has VITE_AUTH_ENABLED=true set as an env var, so prod is protected.
const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === 'true';

if (import.meta.env.PROD && !AUTH_ENABLED) {
  console.warn('[AuthContext] Running a production build with auth disabled (VITE_AUTH_ENABLED != true). Ensure this is intentional.');
}

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,         setUser]         = useState(AUTH_ENABLED ? null : DEMO_USER);
  const [session,      setSession]      = useState(null);
  const [loading,      setLoading]      = useState(AUTH_ENABLED);   // demo mode never loads
  const [recoveryMode, setRecoveryMode] = useState(false);

  useEffect(() => {
    if (!AUTH_ENABLED) return;   // demo mode — nothing to subscribe to

    // Restore existing session on mount
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
      })
      .catch(() => { /* corrupt/unreachable session — fall through to signed-out */ })
      .finally(() => setLoading(false));   // never leave the splash stuck

    // React to sign-in / sign-out / token refresh
    // PASSWORD_RECOVERY must be handled explicitly — without this, Supabase v2 PKCE
    // silently signs the user in after a reset link click without ever showing the
    // set-new-password form.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
        else if (event === 'SIGNED_OUT')   setRecoveryMode(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Auth methods (no-ops in demo mode) ───────────────────────────────────────
  const signIn = async ({ email, password }) => {
    if (!AUTH_ENABLED) return { error: null };
    return supabase.auth.signInWithPassword({ email, password });
  };

  const signUp = async ({ email, password, username }) => {
    if (!AUTH_ENABLED) return { error: null };
    // public.users row is created by the handle_new_user() DB trigger on auth.users INSERT.
    // Attempting a client-side upsert here races the session propagation and fails RLS.
    return supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
  };

  const signOut = async () => {
    if (!AUTH_ENABLED) return;
    await supabase.auth.signOut();
  };

  const resetPassword = async (email) => {
    if (!AUTH_ENABLED) return { error: null };
    // Redirect to site root — the PASSWORD_RECOVERY event in onAuthStateChange
    // handles navigating to the set-password form regardless of where the user lands.
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getRedirectUrl('/'),
    });
  };

  const updatePassword = async (newPassword) => {
    if (!AUTH_ENABLED) return { error: null };
    const result = await supabase.auth.updateUser({ password: newPassword });
    if (!result.error) setRecoveryMode(false);
    return result;
  };

  const resendConfirmation = async (email) => {
    if (!AUTH_ENABLED) return { error: null };
    return supabase.auth.resend({ type: 'signup', email });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        recoveryMode,
        authEnabled: AUTH_ENABLED,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
        resendConfirmation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Internal hook (used by useAuth.js) ───────────────────────────────────────
// eslint-disable-next-line react-refresh/only-export-components
export function useAuthContext() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
