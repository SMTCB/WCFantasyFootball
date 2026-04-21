/**
 * AuthContext — single source of truth for authentication state.
 *
 * Feature flag: VITE_AUTH_ENABLED
 *   'false' (default) → demo mode; always returns DEMO_USER, no Supabase Auth calls.
 *   'true'            → real Supabase Auth; full sign-in/sign-up/reset flow active.
 *
 * To activate auth: set VITE_AUTH_ENABLED=true in .env.local (local) or
 * Vercel environment variables (production). No code changes required.
 */

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// ── Demo user injected when auth is disabled ──────────────────────────────────
const DEMO_USER = {
  id:            '00000000-0000-0000-0000-000000000000',
  email:         'demo@forzakit.app',
  user_metadata: { username: 'Demo Manager' },
};

const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED === 'true';

// ── Context ───────────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(AUTH_ENABLED ? null : DEMO_USER);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(AUTH_ENABLED);   // demo mode never loads

  useEffect(() => {
    if (!AUTH_ENABLED) return;   // demo mode — nothing to subscribe to

    // Restore existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // React to sign-in / sign-out / token refresh
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
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
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    });
    // Create a row in public.users on successful sign-up
    if (data?.user && !error) {
      await supabase.from('users').upsert({
        id:       data.user.id,
        username: username || email.split('@')[0],
      });
    }
    return { data, error };
  };

  const signOut = async () => {
    if (!AUTH_ENABLED) return;
    await supabase.auth.signOut();
  };

  const resetPassword = async (email) => {
    if (!AUTH_ENABLED) return { error: null };
    return supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth?type=recovery`,
    });
  };

  const updatePassword = async (newPassword) => {
    if (!AUTH_ENABLED) return { error: null };
    return supabase.auth.updateUser({ password: newPassword });
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        authEnabled: AUTH_ENABLED,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
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
