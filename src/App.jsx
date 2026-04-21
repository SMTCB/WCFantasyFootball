import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import HomeScreen from './screens/HomeScreen';
import SquadScreen from './screens/SquadScreen';
import AuthScreen from './screens/AuthScreen';
import LeagueScreen from './screens/LeagueScreen';
import AdminSeedScreen from './screens/AdminSeedScreen';
import MarketScreen from './screens/MarketScreen';
import LiveScreen from './screens/LiveScreen';
import RecapScreen from './screens/RecapScreen';
import BracketScreen from './screens/BracketScreen';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
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
                    <Route path="/"               element={<HomeScreen />} />
                    <Route path="/squad"          element={<SquadScreen />} />
                    <Route path="/league"         element={<LeagueScreen />} />
                    <Route path="/league/:leagueId" element={<LeagueScreen />} />
                    <Route path="/live"           element={<LiveScreen />} />
                    <Route path="/market"         element={<MarketScreen />} />
                    <Route path="/recap"          element={<RecapScreen />} />
                    <Route path="/bracket"        element={<BracketScreen />} />
                    <Route path="/admin"          element={<AdminSeedScreen />} />
                    <Route path="*"               element={<Navigate to="/" replace />} />
                  </Routes>
                </AppLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
