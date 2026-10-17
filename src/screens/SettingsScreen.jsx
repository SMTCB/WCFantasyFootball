import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useOnboarding } from '../hooks/useOnboarding';
import TextInput from '../components/TextInput';
import { supabase } from '../lib/supabase';
import { getStoredTheme, setTheme } from '../lib/theme';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { show: showToast } = useToast();
  const { replayWizard } = useOnboarding();
  const [theme, setThemeState] = useState(getStoredTheme() === 'dark' ? 'dark' : 'light');

  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Username editing
  const [currentUsername, setCurrentUsername] = useState('');
  const [usernameInput,   setUsernameInput]   = useState('');
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [usernameLoaded,   setUsernameLoaded]  = useState(false);

  // Load current username from the public users table on mount
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('users')
      .select('username')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        const name = data?.username ?? '';
        setCurrentUsername(name);
        setUsernameInput(name);
        setUsernameLoaded(true);
      });
  }, [user?.id]);

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!passwordForm.new || !passwordForm.confirm) {
      showToast('Please fill in all password fields', 'warning');
      return;
    }
    if (passwordForm.new !== passwordForm.confirm) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (passwordForm.new.length < 8) {
      showToast('Password must be at least 8 characters', 'warning');
      return;
    }

    setIsChangingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.new,
      });
      if (error) {
        showToast(error.message || 'Failed to update password', 'error');
      } else {
        showToast('Password updated successfully', 'success');
        setPasswordForm({ current: '', new: '', confirm: '' });
      }
    } catch {
      showToast('Error updating password', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleSaveUsername = async () => {
    const trimmed = usernameInput.trim();
    if (!trimmed) { showToast('Username cannot be empty', 'warning'); return; }
    if (trimmed.length < 3)  { showToast('Username must be at least 3 characters', 'warning'); return; }
    if (trimmed.length > 30) { showToast('Username must be 30 characters or fewer', 'warning'); return; }
    if (trimmed === currentUsername) { showToast('No changes to save', 'info'); return; }

    setIsSavingUsername(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({ username: trimmed })
        .eq('id', user.id);
      if (error) {
        showToast(error.message || 'Failed to update username', 'error');
        return;
      }
      setCurrentUsername(trimmed);
      showToast('Username updated!', 'success');
    } catch {
      showToast('Error updating username', 'error');
    } finally {
      setIsSavingUsername(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      showToast('Logged out successfully', 'success');
      navigate('/auth', { replace: true });
    } catch {
      showToast('Error logging out', 'error');
    }
  };

  const handleReplayTour = () => {
    replayWizard();
    showToast('Onboarding reset — the tour will appear on your next visit', 'info');
  };

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontFamily: 'Archivo Black, sans-serif',
            fontSize: 'var(--fs-title)',
            color: 'var(--paper)',
            marginBottom: 8,
          }}>
            Settings
          </h1>
          <p style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
            Manage your account, security, and preferences
          </p>
        </div>

        {/* Profile Section */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          padding: '20px 16px',
          marginBottom: 24,
        }}>
          <h2 style={{
            fontFamily: 'Archivo Black, sans-serif',
            fontSize: 'var(--fs-body)',
            color: 'var(--paper)',
            marginBottom: 16,
          }}>
            Profile
          </h2>
          <div style={{ display: 'grid', gap: 16 }}>

            {/* Username — editable */}
            <div>
              <label style={{
                fontSize: 'var(--fs-label)',
                color: 'var(--mute)',
                display: 'block',
                marginBottom: 4,
              }}>
                Username
              </label>
              <p style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 8, lineHeight: 1.5 }}>
                Shown to other managers in leaderboards, chat, and bets. 3–30 characters. No uniqueness required.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={e => setUsernameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveUsername()}
                  maxLength={30}
                  placeholder={usernameLoaded ? 'Enter a username…' : 'Loading…'}
                  disabled={!usernameLoaded || isSavingUsername}
                  style={{
                    flex: 1,
                    fontSize: 'var(--fs-label)',
                    color: 'var(--paper)',
                    minHeight: 'var(--tap)', padding: '8px 12px',
                    background: 'var(--elev)',
                    border: `1px solid ${usernameInput.trim() !== currentUsername && usernameInput.trim() ? 'var(--accent)' : 'var(--rule)'}`,
                    borderRadius: 'var(--radius)',
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleSaveUsername}
                  disabled={!usernameLoaded || isSavingUsername || usernameInput.trim() === currentUsername || !usernameInput.trim()}
                  style={{
                    fontFamily: 'Archivo Black, sans-serif',
                    fontSize: 'var(--fs-label)',
                    fontWeight: 700, minHeight: 'var(--tap)',
                    padding: '8px 16px',
                    background: (!usernameLoaded || isSavingUsername || usernameInput.trim() === currentUsername || !usernameInput.trim())
                      ? 'var(--elev)'
                      : 'var(--accent)',
                    color: (!usernameLoaded || isSavingUsername || usernameInput.trim() === currentUsername || !usernameInput.trim())
                      ? 'var(--mute)'
                      : 'var(--on-accent)',
                    border: '1px solid var(--rule)',
                    borderRadius: 'var(--radius)',
                    cursor: (!usernameLoaded || isSavingUsername || usernameInput.trim() === currentUsername || !usernameInput.trim())
                      ? 'not-allowed'
                      : 'pointer',
                    flexShrink: 0,
                    transition: 'all 150ms',
                  }}
                >
                  {isSavingUsername ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>

            {/* Email — read-only */}
            <div>
              <label style={{
                fontSize: 'var(--fs-label)',
                color: 'var(--mute)',
                display: 'block',
                marginBottom: 4,
              }}>
                Email address
              </label>
              <div style={{
                fontSize: 'var(--fs-label)',
                color: 'var(--mute)',
                padding: '8px 12px',
                background: 'var(--elev)',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--rule)',
              }}>
                {user?.email || 'Not loaded'}
              </div>
            </div>

          </div>
        </div>

        {/* Password Change Section */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          padding: '20px 16px',
          marginBottom: 24,
        }}>
          <h2 style={{
            fontFamily: 'Archivo Black, sans-serif',
            fontSize: 'var(--fs-body)',
            color: 'var(--paper)',
            marginBottom: 16,
          }}>
            Change password
          </h2>
          <form onSubmit={handlePasswordChange} style={{ display: 'grid', gap: 12 }}>
            <TextInput
              label="New password"
              type="password"
              value={passwordForm.new}
              onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
              placeholder="At least 8 characters"
              helperText="Minimum 8 characters"
            />
            <TextInput
              label="Confirm password"
              type="password"
              value={passwordForm.confirm}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
              placeholder="Repeat your password"
            />
            <button
              type="submit"
              disabled={isChangingPassword}
              style={{
                fontFamily: 'Archivo Black, sans-serif',
                fontSize: 'var(--fs-label)',
                fontWeight: 700, minHeight: 'var(--tap)',
                padding: '10px 16px',
                background: isChangingPassword ? 'var(--elev)' : 'var(--accent)',
                color: isChangingPassword ? 'var(--mute)' : 'var(--on-accent)',
                border: 'none',
                borderRadius: 'var(--radius)',
                cursor: isChangingPassword ? 'wait' : 'pointer',
                opacity: isChangingPassword ? 0.6 : 1,
                marginTop: 8,
              }}
            >
              {isChangingPassword ? 'Updating...' : 'Update password'}
            </button>
          </form>
        </div>

        {/* Appearance */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          padding: '20px 16px',
          marginBottom: 24,
        }}>
          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--text)', marginBottom: 12 }}>
            Appearance
          </div>
          <div role="radiogroup" aria-label="Theme" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['light', 'Light'], ['dark', 'Dark']].map(([key, label]) => (
              <button
                key={key}
                role="radio"
                aria-checked={theme === key}
                onClick={() => setThemeState(setTheme(key))}
                style={{
                  minHeight: 'var(--tap)',
                  fontFamily: 'Archivo Black, sans-serif',
                  fontSize: 'var(--fs-label)',
                  background: theme === key ? 'var(--accent-soft)' : 'var(--elev)',
                  color: theme === key ? 'var(--accent)' : 'var(--mute)',
                  border: `1px solid ${theme === key ? 'var(--accent)' : 'var(--rule)'}`,
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tour & Account Section */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          padding: '20px 16px',
          marginBottom: 24,
          display: 'grid',
          gap: 12,
        }}>
          <button
            onClick={handleReplayTour}
            style={{
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: 'var(--fs-label)',
              fontWeight: 700, minHeight: 'var(--tap)',
              padding: '10px 16px',
              background: 'var(--accent-soft)',
              color: 'var(--accent)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--accent-soft)';
              e.currentTarget.style.borderColor = 'var(--accent)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--accent-soft)';
              e.currentTarget.style.borderColor = 'var(--rule)';
            }}
          >
            ↻ Replay tour
          </button>

          <button
            onClick={handleLogout}
            style={{
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: 'var(--fs-label)',
              fontWeight: 700, minHeight: 'var(--tap)',
              padding: '10px 16px',
              background: 'var(--neg-bg)',
              color: 'var(--neg)',
              border: '1px solid var(--rule)',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--crit-soft)';
              e.currentTarget.style.borderColor = 'var(--neg)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--neg-bg)';
              e.currentTarget.style.borderColor = 'var(--rule)';
            }}
          >
            ← Logout
          </button>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          fontSize: 'var(--fs-micro)',
          color: 'var(--mute)',
          marginTop: 32,
        }}>
          <p>Alpha v0.1 · 2026</p>
        </div>
      </div>
    </div>
  );
}
