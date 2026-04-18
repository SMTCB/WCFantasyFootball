import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';

export default function AuthScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setMessage("Check your email for the login link!");
    } catch (error) {
      setMessage(error.message || "Failed to log in");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col justify-center px-6">
      <div className="w-full max-w-sm mx-auto">
        {/* Abstract Logo */}
        <div className="w-16 h-16 bg-surface-elevated rounded-2xl mx-auto mb-8 border border-border flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-live animate-live-pulse" />
        </div>
        
        <h1 className="text-2xl font-black text-center mb-8 uppercase tracking-tight">FantasyKit</h1>
        
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <div className="bg-surface border border-border p-1">
            <input
              type="email"
              placeholder="YOUR EMAIL RECORD"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent px-3 py-3 text-[15px] font-medium outline-none placeholder:text-text-tertiary"
              required
            />
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-white text-black font-bold text-[15px] py-4 uppercase tracking-wider disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {loading ? 'Sending...' : 'Sign In With Email'}
          </button>
        </form>

        {message && (
          <div className="mt-6 p-4 bg-surface-elevated border border-border text-center text-sm font-medium text-text-secondary">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
