/**
 * useAuth — consume the AuthContext from any component or screen.
 *
 * Usage:
 *   const { user } = useAuth();
 *   const userId = user.id;   // always valid (demo UUID or real Supabase user ID)
 *
 * In demo mode (VITE_AUTH_ENABLED=false) user is always the DEMO_USER object.
 * In auth mode (VITE_AUTH_ENABLED=true) user is null until session is restored.
 */

export { useAuthContext as useAuth } from '../context/AuthContext';
