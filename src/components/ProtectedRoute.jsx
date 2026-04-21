/**
 * ProtectedRoute — redirects unauthenticated users to /auth.
 *
 * In demo mode (VITE_AUTH_ENABLED=false) this component always passes through —
 * the demo user is always "logged in" so no redirect ever happens.
 *
 * In auth mode (VITE_AUTH_ENABLED=true):
 *   - Shows a loading splash while the session is being restored from localStorage.
 *   - Redirects to /auth?redirect=<current-path> if no session exists.
 *   - Renders children if a valid session is present.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Restoring session from localStorage — show splash to avoid flicker
  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div
            className="text-[32px] font-black uppercase tracking-tight mb-2"
            style={{ fontFamily: 'Barlow Condensed, sans-serif', color: '#F0F2F5' }}
          >
            Forza<span style={{ color: '#00C4E8' }}>Kit</span>
          </div>
          <div
            className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse"
            style={{ color: '#3D4B5C', fontFamily: 'Barlow Condensed, sans-serif' }}
          >
            Loading…
          </div>
        </div>
      </div>
    );
  }

  // No session → send to auth screen, preserve intended destination
  if (!user) {
    return (
      <Navigate
        to={`/auth?redirect=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  }

  return children;
}
