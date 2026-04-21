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

import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

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

  // Clear messages on tab switch
  useEffect(() => { setError(''); setSuccess(''); }, [tab]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSignIn = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    const { error } = await signIn({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    navigate(redirectTo, { replace: true });
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    if (password.length < 8)  { setError('Password must be at least 8 characters.'); return; }
    setLoading(true);
    const { error } = await signUp({ email, password, username });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSuccess('Account created! Check your email to verify, then sign in.');
    setTab(TAB_SIGNIN);
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
    color: '#F0F2F5',
    outline: 'none',
    fontFamily: 'DM Sans, sans-serif',
  };

  const labelStyle = {
    display: 'block',
    fontSize: '9px',
    fontWeight: 800,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
    color: '#3D4B5C',
    marginBottom: '6px',
    fontFamily: 'Barlow Condensed, sans-serif',
  };

  const btnPrimary = {
    width: '100%',
    padding: '14px',
    background: '#00C4E8',
    color: '#000',
    border: 'none',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 800,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    cursor: loading ? 'not-allowed' : 'pointer',
    opacity: loading ? 0.6 : 1,
    fontFamily: 'Barlow Condensed, sans-serif',
    transition: 'opacity 0.15s',
  };

  // ── Recover password form (from email link) ──────────────────────────────────
  if (tab === TAB_RECOVER) {
    return (
      <AuthShell>
        <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#F0F2F5', marginBottom: '24px', fontFamily: 'Barlow Condensed, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Set New Password
        </h2>
        <form onSubmit={handleUpdatePassword} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field label="New Password" style={fieldStyle} labelStyle={labelStyle}>
            <input type="password" style={fieldStyle} value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="Min. 8 characters" />
          </Field>
          <Field label="Confirm Password" style={fieldStyle} labelStyle={labelStyle}>
            <input type="password" style={fieldStyle} value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Repeat password" />
          </Field>
          {error   && <Msg type="error">{error}</Msg>}
          {success && <Msg type="success">{success}</Msg>}
          <button type="submit" style={btnPrimary} disabled={loading}>
            {loading ? 'Saving…' : 'Update Password'}
          </button>
        </form>
      </AuthShell>
    );
  }

  // ── Reset password form ───────────────────────────────────────────────────────
  if (tab === TAB_RESET) {
    return (
      <AuthShell>
        <button onClick={() => setTab(TAB_SIGNIN)} style={{ background: 'none', border: 'none', color: '#3D4B5C', fontSize: '11px', fontWeight: 700, cursor: 'pointer', marginBottom: '20px', padding: 0, fontFamily: 'Barlow Condensed, sans-serif', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          ← Back to Sign In
        </button>
        <h2 style={{ fontSize: '20px', fontWeight: 900, color: '#F0F2F5', marginBottom: '8px', fontFamily: 'Barlow Condensed, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Reset Password
        </h2>
        <p style={{ fontSize: '13px', color: '#7D8A96', marginBottom: '24px' }}>
          Enter your email and we'll send a reset link.
        </p>
        <form onSubmit={handleReset} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field label="Email" labelStyle={labelStyle}>
            <input type="email" style={fieldStyle} value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" />
          </Field>
          {error   && <Msg type="error">{error}</Msg>}
          {success && <Msg type="success">{success}</Msg>}
          <button type="submit" style={btnPrimary} disabled={loading}>
            {loading ? 'Sending…' : 'Send Reset Link'}
          </button>
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
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              padding: '10px',
              background: 'none',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid #00C4E8' : '2px solid transparent',
              color: tab === t.id ? '#F0F2F5' : '#3D4B5C',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'Barlow Condensed, sans-serif',
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
          <Field label="Email" labelStyle={labelStyle}>
            <input type="email" style={fieldStyle} value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" autoComplete="email" />
          </Field>
          <Field label="Password" labelStyle={labelStyle}>
            <input type="password" style={fieldStyle} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" />
          </Field>
          {error   && <Msg type="error">{error}</Msg>}
          {success && <Msg type="success">{success}</Msg>}
          <button type="submit" style={btnPrimary} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
          <button
            type="button"
            onClick={() => setTab(TAB_RESET)}
            style={{ background: 'none', border: 'none', color: '#3D4B5C', fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: '4px 0', fontFamily: 'DM Sans, sans-serif' }}
          >
            Forgot password?
          </button>
        </form>
      )}

      {/* Sign Up */}
      {tab === TAB_SIGNUP && (
        <form onSubmit={handleSignUp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Field label="Username" labelStyle={labelStyle}>
            <input type="text" style={fieldStyle} value={username} onChange={e => setUsername(e.target.value)} required placeholder="Your manager name" autoComplete="username" />
          </Field>
          <Field label="Email" labelStyle={labelStyle}>
            <input type="email" style={fieldStyle} value={email} onChange={e => setEmail(e.target.value)} required placeholder="your@email.com" autoComplete="email" />
          </Field>
          <Field label="Password" labelStyle={labelStyle}>
            <input type="password" style={fieldStyle} value={password} onChange={e => setPassword(e.target.value)} required placeholder="Min. 8 characters" autoComplete="new-password" minLength={8} />
          </Field>
          <Field label="Confirm Password" labelStyle={labelStyle}>
            <input type="password" style={fieldStyle} value={confirm} onChange={e => setConfirm(e.target.value)} required placeholder="Repeat password" autoComplete="new-password" />
          </Field>
          {error   && <Msg type="error">{error}</Msg>}
          {success && <Msg type="success">{success}</Msg>}
          <button type="submit" style={btnPrimary} disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function AuthShell({ children }) {
  return (
    <div style={{ minHeight: '100svh', background: '#080A0E', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      {/* Logo */}
      <div style={{ marginBottom: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '32px', fontWeight: 900, fontFamily: 'Barlow Condensed, sans-serif', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#F0F2F5', lineHeight: 1 }}>
          Forza<span style={{ color: '#00C4E8' }}>Kit</span>
        </div>
        <div style={{ fontSize: '9px', fontWeight: 800, letterSpacing: '0.25em', textTransform: 'uppercase', color: '#3D4B5C', marginTop: '6px', fontFamily: 'Barlow Condensed, sans-serif' }}>
          World Cup 2026 Fantasy
        </div>
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: '400px', background: '#0D1117', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '32px' }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, labelStyle, children }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
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
      fontFamily: 'DM Sans, sans-serif',
      background: isError ? 'rgba(240,58,58,0.1)' : 'rgba(24,201,107,0.1)',
      color:      isError ? '#F03A3A'              : '#18C96B',
      border:     `1px solid ${isError ? 'rgba(240,58,58,0.25)' : 'rgba(24,201,107,0.25)'}`,
    }}>
      {children}
    </div>
  );
}
