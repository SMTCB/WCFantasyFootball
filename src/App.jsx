import { BrowserRouter, HashRouter, Routes, Route, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { lazy, Suspense, useEffect, useState } from 'react';
import { isNative } from './lib/capacitor';
import { AuthProvider } from './context/AuthContext';
import { SportProvider } from './context/SportContext';
// useAuth is now a proper function wrapper (not a re-export), so importing it
// alongside AuthProvider no longer creates a TDZ live binding.
import { useAuth } from './hooks/useAuth';
// initNative lives here (not in main.jsx): main importing capacitor.js directly
// AND App→AuthContext→capacitor created a Rolldown TDZ at the entry point.
import { initNative } from './lib/capacitor';
initNative();
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import AppLayout from './components/AppLayout';
import OnboardingWizard from './components/OnboardingWizard';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { useOnboarding } from './hooks/useOnboarding';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { ToastProvider } from './components/Toast';
import { ClubhouseNotifProvider } from './context/ClubhouseNotifProvider';

// ── Route-level code splitting (LOW-1) ───────────────────────────────────────
// Each screen is loaded only when its route is first visited. This shrinks the
// initial JS bundle and eliminates the shared-module surface that causes
// Rolldown TDZ crashes in production (CODE-1).
const MultiSportHomeScreen  = lazy(() => import('./screens/MultiSportHomeScreen'));
const TrophyCabinetScreen   = lazy(() => import('./screens/TrophyCabinetScreen'));
const HomeScreen            = lazy(() => import('./screens/HomeScreen'));
const SquadScreen           = lazy(() => import('./screens/SquadScreen'));
const AuthScreen            = lazy(() => import('./screens/AuthScreen'));
const LeagueScreen          = lazy(() => import('./screens/LeagueScreen'));
const AdminSeedScreen       = lazy(() => import('./screens/AdminSeedScreen'));
const MarketScreen          = lazy(() => import('./screens/MarketScreen'));
const LiveScreen            = lazy(() => import('./screens/LiveScreen'));
const RecapScreen           = lazy(() => import('./screens/RecapScreen'));
const BracketScreen         = lazy(() => import('./screens/BracketScreen'));
const DraftScreen           = lazy(() => import('./screens/DraftScreen'));
const DraftRecoveryScreen   = lazy(() => import('./screens/DraftRecoveryScreen'));
const SettingsScreen        = lazy(() => import('./screens/SettingsScreen'));
const WalletScreen          = lazy(() => import('./screens/WalletScreen'));
const ChallengeScreen       = lazy(() => import('./screens/ChallengeScreen'));
const NotFoundScreen        = lazy(() => import('./screens/NotFoundScreen'));
const ClubhouseScreen       = lazy(() => import('./screens/ClubhouseScreen'));
// F1 module
const PaddockLobbyScreen    = lazy(() => import('./screens/f1/PaddockLobbyScreen'));
const F1HomeScreen          = lazy(() => import('./screens/f1/F1HomeScreen'));
const F1RaceBetScreen       = lazy(() => import('./screens/f1/F1RaceBetScreen'));
const F1SeasonBetsScreen    = lazy(() => import('./screens/f1/F1SeasonBetsScreen'));
const F1StandingsScreen     = lazy(() => import('./screens/f1/F1StandingsScreen'));
const F1ReportScreen        = lazy(() => import('./screens/f1/F1ReportScreen'));
const F1AdminScreen         = lazy(() => import('./screens/f1/F1AdminScreen'));
// Tennis module
const PlayerBoxScreen       = lazy(() => import('./screens/tennis/PlayerBoxScreen'));
const TennisHomeScreen      = lazy(() => import('./screens/tennis/TennisHomeScreen'));
const TennisTournamentScreen = lazy(() => import('./screens/tennis/TennisTournamentScreen'));
const TennisLeaderboardScreen = lazy(() => import('./screens/tennis/TennisLeaderboardScreen'));
const TennisAtpFinalsScreen = lazy(() => import('./screens/tennis/TennisAtpFinalsScreen'));
const TennisAdminScreen     = lazy(() => import('./screens/tennis/TennisAdminScreen'));

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

// JoinRoute: reads ?code= from query, redirects to LeagueScreen with code pre-filled.
// If unauthenticated, bounces to /auth preserving the return destination.
function JoinRoute() {
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code') ?? '';
  // Pass the join code through to LeagueScreen via query param.
  return <Navigate to={`/league?joinCode=${code}`} replace />;
}

// ── AppRoutes lives inside Router so useNavigate (used by OnboardingWizard) works
function AppRoutes() {
  const { user, authEnabled } = useAuth();
  const { showWizard, completeWizard, skipWizard } = useOnboarding();
  const [showHelpModal, setShowHelpModal] = useState(false);
  useKeyboardShortcuts(() => setShowHelpModal(true));

  return (
    <>
      {/* Keyboard shortcuts help modal */}
      <KeyboardShortcutsModal isOpen={showHelpModal} onClose={() => setShowHelpModal(false)} />

      {/* Redirect to set-password form when PASSWORD_RECOVERY event fires */}
      <RecoveryRedirect />

      {/* One-time onboarding wizard — only shown after auth is confirmed (U2) */}
      {showWizard && (!authEnabled || user) && (
        <OnboardingWizard
          onComplete={completeWizard}
          onSkip={skipWizard}
          user={user}
        />
      )}

      <Suspense fallback={null}>
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
                  <Route path="/"                 element={<ErrorBoundary screen="MultiSportHome"><MultiSportHomeScreen /></ErrorBoundary>} />
                  <Route path="/scores"           element={<Navigate to="/live" replace />} />
                  <Route path="/squad"            element={<ErrorBoundary screen="Squad"><SquadScreen /></ErrorBoundary>} />
                  <Route path="/league"           element={<ErrorBoundary screen="League"><LeagueScreen /></ErrorBoundary>} />
                  <Route path="/league/:leagueId" element={<ErrorBoundary screen="League"><LeagueScreen /></ErrorBoundary>} />
                  <Route path="/league/:leagueId/draft" element={<ErrorBoundary screen="Draft"><DraftScreen /></ErrorBoundary>} />
                  <Route path="/league/:leagueId/draft/recover" element={<ErrorBoundary screen="DraftRecovery"><DraftRecoveryScreen /></ErrorBoundary>} />
                  <Route path="/live"             element={<ErrorBoundary screen="Live"><LiveScreen /></ErrorBoundary>} />
                  <Route path="/market"           element={<ErrorBoundary screen="Market"><MarketScreen /></ErrorBoundary>} />
                  <Route path="/recap"            element={<ErrorBoundary screen="Recap"><RecapScreen /></ErrorBoundary>} />
                  <Route path="/predictions"      element={<ErrorBoundary screen="Bracket"><BracketScreen /></ErrorBoundary>} />
                  <Route path="/bracket"          element={<Navigate to="/predictions" replace />} />
                  <Route path="/admin"            element={<ErrorBoundary screen="Admin"><AdminSeedScreen /></ErrorBoundary>} />
                  <Route path="/settings"                   element={<ErrorBoundary screen="Settings"><SettingsScreen /></ErrorBoundary>} />
                  <Route path="/wallet"                     element={<ErrorBoundary screen="Wallet"><WalletScreen /></ErrorBoundary>} />
                  <Route path="/challenges"                element={<ErrorBoundary screen="Challenges"><ChallengeScreen /></ErrorBoundary>} />
                  {/* F1 Module */}
                  <Route path="/f1"                         element={<ErrorBoundary screen="F1Lobby"><PaddockLobbyScreen /></ErrorBoundary>} />
                  <Route path="/f1/:paddockId"              element={<ErrorBoundary screen="F1Home"><F1HomeScreen /></ErrorBoundary>} />
                  <Route path="/f1/:paddockId/picks/:round?" element={<ErrorBoundary screen="F1Picks"><F1RaceBetScreen /></ErrorBoundary>} />
                  <Route path="/f1/:paddockId/season"       element={<ErrorBoundary screen="F1Season"><F1SeasonBetsScreen /></ErrorBoundary>} />
                  <Route path="/f1/:paddockId/standings"    element={<ErrorBoundary screen="F1Standings"><F1StandingsScreen /></ErrorBoundary>} />
                  <Route path="/f1/:paddockId/report"       element={<ErrorBoundary screen="F1Report"><F1ReportScreen /></ErrorBoundary>} />
                  <Route path="/f1/:paddockId/admin"        element={<ErrorBoundary screen="F1Admin"><F1AdminScreen /></ErrorBoundary>} />
                  {/* Tennis Module */}
                  <Route path="/tennis"                       element={<ErrorBoundary screen="TennisHome"><TennisHomeScreen /></ErrorBoundary>} />
                  <Route path="/tennis/box"                   element={<ErrorBoundary screen="PlayerBox"><PlayerBoxScreen /></ErrorBoundary>} />
                  <Route path="/tennis/tournament/:id"        element={<ErrorBoundary screen="TennisTournament"><TennisTournamentScreen /></ErrorBoundary>} />
                  <Route path="/tennis/leaderboard"           element={<ErrorBoundary screen="TennisLeaderboard"><TennisLeaderboardScreen /></ErrorBoundary>} />
                  <Route path="/tennis/finals"                element={<ErrorBoundary screen="TennisAtpFinals"><TennisAtpFinalsScreen /></ErrorBoundary>} />
                  <Route path="/tennis/admin"                 element={<ErrorBoundary screen="TennisAdmin"><TennisAdminScreen /></ErrorBoundary>} />
                  <Route path="/clubhouse"            element={<ErrorBoundary screen="Clubhouse"><ClubhouseScreen /></ErrorBoundary>} />
                  <Route path="/clubhouse/:circleId"  element={<ErrorBoundary screen="Clubhouse"><ClubhouseScreen /></ErrorBoundary>} />
                  <Route path="/trophy"           element={<ErrorBoundary screen="TrophyCabinet"><TrophyCabinetScreen /></ErrorBoundary>} />
                  <Route path="/join"                       element={<JoinRoute />} />
                  <Route path="*"                           element={<ErrorBoundary screen="NotFound"><NotFoundScreen /></ErrorBoundary>} />
                </Routes>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
      </Suspense>
    </>
  );
}

// Use HashRouter for Capacitor native builds (file:// / capacitor:// origins),
// BrowserRouter for web. CLAUDE.md specifies "hash-based for Capacitor compatibility".
const Router = isNative ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <AuthProvider>
      <SportProvider>
        <ClubhouseNotifProvider>
          <Router>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </Router>
        </ClubhouseNotifProvider>
      </SportProvider>
    </AuthProvider>
  );
}
