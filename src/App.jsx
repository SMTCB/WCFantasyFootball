import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import AppLayout from './components/AppLayout';
import OnboardingWizard from './components/OnboardingWizard';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import HomeScreen from './screens/HomeScreen';
import SquadScreen from './screens/SquadScreen';
import AuthScreen from './screens/AuthScreen';
import LeagueScreen from './screens/LeagueScreen';
import AdminSeedScreen from './screens/AdminSeedScreen';
import MarketScreen from './screens/MarketScreen';
import LiveScreen from './screens/LiveScreen';
import RecapScreen from './screens/RecapScreen';
import BracketScreen from './screens/BracketScreen';
import DraftScreen from './screens/DraftScreen';
import DraftRecoveryScreen from './screens/DraftRecoveryScreen';
import { useOnboarding } from './hooks/useOnboarding';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ToastProvider } from './components/Toast';

// Redirect to set-password form when Supabase fires a PASSWORD_RECOVERY event.
// This fires regardless of which URL the recovery link lands on.
function RecoveryRedirect() {
  const { recoveryMode } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (recoveryMode) navigate('/auth?type=recovery', { replace: true });
  }, [recoveryMode, navigate]);
  return null;
}

// ── AppRoutes lives inside BrowserRouter so useNavigate (used by OnboardingWizard) works
function AppRoutes() {
  const { showWizard, completeWizard, skipWizard } = useOnboarding();
  const [showHelpModal, setShowHelpModal] = useState(false);
  useKeyboardShortcuts(() => setShowHelpModal(true));

  return (
    <>
      {/* Keyboard shortcuts help modal */}
      <KeyboardShortcutsModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />

      {/* Redirect to set-password form when PASSWORD_RECOVERY event fires */}
      <RecoveryRedirect />

      {/* One-time onboarding wizard — shown until completed or skipped */}
      {showWizard && (
        <OnboardingWizard
          onComplete={completeWizard}
          onSkip={skipWizard}
        />
      )}

      <Routes>
        {/* Public route — only reachable when auth is enabled */}
        <Route path="/auth" element={<AuthScreen />} />

        {/* All other routes are protected.
            In demo mode (VITE_AUTH_ENABLED=false), ProtectedRoute always
            passes through — no redirect, no login screen shown. */}
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                <Routes>
                  <Route path="/"                 element={<ErrorBoundary screen="Home"><HomeScreen /></ErrorBoundary>} />
                  <Route path="/squad"            element={<ErrorBoundary screen="Squad"><SquadScreen /></ErrorBoundary>} />
                  <Route path="/league"           element={<ErrorBoundary screen="League"><LeagueScreen /></ErrorBoundary>} />
                  <Route path="/league/:leagueId" element={<ErrorBoundary screen="League"><LeagueScreen /></ErrorBoundary>} />
                  <Route path="/league/:leagueId/draft" element={<ErrorBoundary screen="Draft"><DraftScreen /></ErrorBoundary>} />
                  <Route path="/league/:leagueId/draft/recover" element={<ErrorBoundary screen="DraftRecovery"><DraftRecoveryScreen /></ErrorBoundary>} />
                  <Route path="/live"             element={<ErrorBoundary screen="Live"><LiveScreen /></ErrorBoundary>} />
                  <Route path="/market"           element={<ErrorBoundary screen="Market"><MarketScreen /></ErrorBoundary>} />
                  <Route path="/recap"            element={<ErrorBoundary screen="Recap"><RecapScreen /></ErrorBoundary>} />
                  <Route path="/bracket"          element={<ErrorBoundary screen="Bracket"><BracketScreen /></ErrorBoundary>} />
                  <Route path="/admin"            element={<ErrorBoundary screen="Admin"><AdminSeedScreen /></ErrorBoundary>} />
                  <Route path="*"                 element={<Navigate to="/" replace />} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
