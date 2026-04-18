import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./lib/supabase";
import AppLayout from "./components/AppLayout";
import HomeScreen from "./screens/HomeScreen";
import SquadScreen from "./screens/SquadScreen";
import AuthScreen from "./screens/AuthScreen";
import LeagueScreen from "./screens/LeagueScreen";
import AdminSeedScreen from "./screens/AdminSeedScreen";
import MarketScreen from "./screens/MarketScreen";
import LiveScreen from "./screens/LiveScreen";
import RecapScreen from "./screens/RecapScreen";
import BracketScreen from "./screens/BracketScreen";

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="fz-display text-[32px] text-white mb-2">
            Fantasy<span className="text-cyan">Kit</span>
          </div>
          <div className="fz-label text-text-tertiary animate-scan">INITIALIZING</div>
        </div>
      </div>
    );
  }

  // -- DEMO/VALIDATION MODE: Bypassing strict email authentication
  // if (!session) {
  //   return (
  //     <BrowserRouter>
  //       <Routes>
  //         <Route path="*" element={<AuthScreen />} />
  //       </Routes>
  //     </BrowserRouter>
  //   );
  // }

  return (
    <BrowserRouter>
      <AppLayout>
        <Routes>
          <Route path="/"        element={<HomeScreen />} />
          <Route path="/squad"   element={<SquadScreen />} />
          <Route path="/league"  element={<LeagueScreen />} />
          <Route path="/league/:leagueId" element={<LeagueScreen />} />
          <Route path="/live"    element={<LiveScreen />} />
          <Route path="/admin"   element={<AdminSeedScreen />} />
          <Route path="/market"  element={<MarketScreen />} />
          <Route path="/recap"   element={<RecapScreen />} />
          <Route path="/bracket" element={<BracketScreen />} />
          <Route path="*"        element={<Navigate to="/" replace />} />
        </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}

export default App;
