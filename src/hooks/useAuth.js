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

// NOT a re-export — re-exports create a live module binding that Rolldown
// puts in TDZ if AuthContext is emitted after this module in the bundle.
// A function wrapper defers the reference to call time (React render),
// by which point all modules are fully initialized.
import { useAuthContext } from '../context/AuthContext';
export function useAuth() { return useAuthContext(); }
