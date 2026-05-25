/**
 * AuthScreen — sign-in / sign-up / password-reset UI.
 *
 * Only reachable when VITE_AUTH_ENABLED=true.
 * In demo mode, ProtectedRoute never redirects here so this screen is never shown.
 *
 * URL params:
 *   ?tab=signup          → opens Sign Up tab directly
 *   ?type=recovery       → opens Set New Password form (from email reset link)
 *   ?redirect=/squad     → destination after successful auth
 */

import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import BrandMark from '../components/BrandMark';
import Button from '../components/Button';

// ── Tab types ──────────────────────────────────────────────────────────────────
const TAB_SIGNIN  = 'signin';
const TAB_SIGNUP  = 'signup';
const TAB_RESET   = 'reset';
const TAB_RECOVER = 'recover';   // set new password after clicking email link

export default function AuthScreen() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const { signIn, signUp, resetPassword, updatePassword } = useAuth();

  const initialTab = searchParams.get('type') === 'recovery'
    ? TAB_RECOVER
    : searchParams.get('tab') === 'signup'
      ? TAB_SIGNUP
      : TAB_SIGNIN;

  const [tab,      setTab]      = useState(initialTab);
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');

  const redirectTo = searchParams.get('redirect') || '/';

  // Clear errors (not success) on tab switch so sign-up confirmation persists on sign-in tab
  const switchTab = (t) => { setTab(t); setError(''); };

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError(''); setLoading(true);
    const { error } = await signIn({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    navigate(redirectTo, { replace: true });
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    const { data, error } = await signUp({ email, password, username });
    setLoading(false);
    if (error) { setError(error.message); return; }
    // Supabase returns a user with no identities when the email is already registered
    if (data?.user?.identities?.length === 0) {
      setError('This email is already registered — please sign in.');
      switchTab(TAB_SIGNIN);
      return;
    }
    setSuccess('Account created! Check your email to verify, then sign in.');
    switchTab(TAB_SIGNIN);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess('Reset link sent — check your inbox.');
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess('Password updated!');
    setTimeout(() => navigate('/', { replace: true }), 1500);
  };

  // ── Shared field style ───────────────────────────────────────────────────────
  const fieldStyle = {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '4px',
    padding: '12px 16px',
    fontSize: '14px',
    color: 'var(--paper)',
    outline: 'none',
    fontFamily: 'Archivo, sans-serif',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '9px',
    fontWeight: 800,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: 'var(--mute)',
    marginBottom: '6px',
    fontFamily: 'Archivo Black, sans-serif',
  };


  // ── Recover password form (from email link) ──────────────────────────────────
  if (tab === TAB_RECOVER) {
    return (
      <AuthShell>
        <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--paper)', marginBottom: '24px', fontFamily: 'Archivo Black, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Set New Password
        </h2>
        <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field label="New Password" labelStyle={labelStyle} htmlFor="auth-recover-password">
            <input id="auth-recover-password" type="password" style={fieldStyle} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="Min. 8 characters" />
          </Field>
          <Field label="Confirm Password" labelStyle={labelStyle} htmlFor="auth-recover-confirm">
            <input id="auth-recover-confirm" type="password" style={fieldStyle} value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Repeat password" />
          </Field>
          {error   && <Msg type="error">{error}</Msg>}
          {success && <Msg type="success">{success}</Msg>}
          <Button type="submit" size="lg" fullWidth loading={loading}>
            {loading ? 'Saving…' : 'Update Password'}
          </Button>
        </form>
      </AuthShell>
    );
  }

  // ── Reset password form ───────────────────────────────────────────────────────
  if (tab === TAB_RESET) {
    return (
      <AuthShell>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => switchTab(TAB_SIGNIN)}
          leftIcon={<span aria-hidden="true">←</span>}
          style={{ marginBottom: '20px', alignSelf: 'flex-start' }}
        >
          Back to Sign In
        </Button>
        <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--paper)', marginBottom: '8px', fontFamily: 'Archivo Black, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Reset Password
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--mute)', marginBottom: '24px' }}>
          Enter your email and we'll send a reset link.
        </p>
        <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field label="Email" labelStyle={labelStyle} htmlFor="auth-reset-email">
            <input id="auth-reset-email" type="email" style={fieldStyle} value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" autoComplete="email" />
          </Field>
          {error   && <Msg type="error">{error}</Msg>}
          {success && <Msg type="success">{success}</Msg>}
          <Button type="submit" size="lg" fullWidth loading={loading}>
            {loading ? 'Sending…' : 'Send Reset Link'}
          </Button>
        </form>
      </AuthShell>
    );
  }

  // ── Sign In / Sign Up tabs ───────────────────────────────────────────────────
  return (
    <AuthShell>
      {/* Tab strip */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: '28px' }}>
        {[{ id: TAB_SIGNIN, label: 'Sign In' }, { id: TAB_SIGNUP, label: 'Create Account' }].map(t => (
          <button
            key={t.id}
            onClick={() => switchTab(t.id)}
            style={{
              flex: 1,
              padding: '10px',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--cyan)' : '2px solid transparent',
              color: tab === t.id ? 'var(--paper)' : 'var(--mute)',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'Archivo Black, sans-serif',
              transition: 'color 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Sign In */}
      {tab === TAB_SIGNIN && (
        <form onSubmit={handleSignIn} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field label="Email" labelStyle={labelStyle} htmlFor="auth-signin-email">
            <input id="auth-signin-email" type="email" style={fieldStyle} value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" autoComplete="email" />
          </Field>
          <Field label="Password" labelStyle={labelStyle} htmlFor="auth-signin-password">
            <input id="auth-signin-password" type="password" style={fieldStyle} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" />
          </Field>
          {error   && <Msg type="error">{error}</Msg>}
          {success && <Msg type="success">{success}</Msg>}
          <Button type="submit" size="lg" fullWidth loading={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => switchTab(TAB_RESET)}
          >
            Forgot password?
          </Button>
        </form>
      )}

      {/* Sign Up */}
      {tab === TAB_SIGNUP && (
        <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field label="Username" labelStyle={labelStyle} htmlFor="auth-signup-username">
            <input id="auth-signup-username" type="text" style={fieldStyle} value={username} onChange={e => setUsername(e.target.value)} required placeholder="Your manager name" autoComplete="username" />
          </Field>
          <Field label="Email" labelStyle={labelStyle} htmlFor="auth-signup-email">
            <input id="auth-signup-email" type="email" style={fieldStyle} value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" autoComplete="email" />
          </Field>
          <Field label="Password" labelStyle={labelStyle} htmlFor="auth-signup-password">
            <input id="auth-signup-password" type="password" style={fieldStyle} value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min. 8 characters" autoComplete="new-password" minLength={8} />
          </Field>
          <Field label="Confirm Password" labelStyle={labelStyle} htmlFor="auth-signup-confirm">
            <input id="auth-signup-confirm" type="password" style={fieldStyle} value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Repeat password" autoComplete="new-password" />
          </Field>
          {error   && <Msg type="error">{error}</Msg>}
          {success && <Msg type="success">{success}</Msg>}
          <Button type="submit" size="lg" fullWidth loading={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function AuthShell({ children }) {
  return (
    <div style={{ minHeight: '100svh', background: '#080A0E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      {/* Brandmark */}
      <div style={{ marginBottom: '40px', textAlign: 'center', display: 'flex', justifyContent: 'center' }}>
        <BrandMark theme="dark" scale={0.9} compact={false} />
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: '400px', background: 'var(--ink-2)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '32px' }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, labelStyle, htmlFor, children }) {
  return (
    <div>
      <label style={labelStyle} htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  );
}

function Msg({ type, children }) {
  const isError = type === 'error';
  return (
    <div style={{
      padding: '10px 14px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: 600,
      fontFamily: 'Archivo, sans-serif',
      background: isError ? 'rgba(240,58,58,0.1)' : 'rgba(24,201,107,0.1)',
      color:      isError ? 'var(--danger)'              : 'var(--positive)',
      border:     `1px solid ${isError ? 'rgba(240,58,58,0.25)' : 'rgba(24,201,107,0.25)'}`,
    }}>
      {children}
    </div>
  );
}
