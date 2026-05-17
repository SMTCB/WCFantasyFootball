import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { supabase } from '../lib/supabase';

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { show: showToast } = useToast();

  const [passwordForm, setPasswordForm] = useState({ current: '', new: '', confirm: '' });
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

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
    } catch (err) {
      showToast('Error updating password', 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      showToast('Logged out successfully', 'success');
      navigate('/auth', { replace: true });
    } catch (err) {
      showToast('Error logging out', 'error');
    }
  };

  const handleReplayTour = () => {
    localStorage.removeItem('onboardingCompleted');
    setShowOnboarding(true);
    showToast('Onboarding reset — refresh to see tour', 'info');
  };

  return (
    <div className="flex-1 min-w-0 overflow-y-auto">
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            fontFamily: 'Archivo Black, sans-serif',
            fontSize: 28,
            color: 'var(--paper)',
            marginBottom: 8,
            letterSpacing: '0.02em',
          }}>
            Settings
          </h1>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--mute)' }}>
            Manage your account, security, and preferences
          </p>
        </div>

        {/* Profile Section */}
        <div style={{
          background: 'var(--ink-3)',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          padding: '20px 16px',
          marginBottom: 24,
        }}>
          <h2 style={{
            fontFamily: 'Archivo Black, sans-serif',
            fontSize: 13,
            color: 'var(--paper)',
            marginBottom: 16,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            Profile
          </h2>
          <div style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                color: 'var(--mute)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                display: 'block',
                marginBottom: 4,
              }}>
                Email Address
              </label>
              <div style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 13,
                color: 'var(--paper)',
                padding: '8px 12px',
                background: 'rgba(242, 238, 229, 0.04)',
                borderRadius: 4,
                border: '1px solid var(--rule)',
              }}>
                {user?.email || 'Not loaded'}
              </div>
            </div>
          </div>
        </div>

        {/* Password Change Section */}
        <div style={{
          background: 'var(--ink-3)',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          padding: '20px 16px',
          marginBottom: 24,
        }}>
          <h2 style={{
            fontFamily: 'Archivo Black, sans-serif',
            fontSize: 13,
            color: 'var(--paper)',
            marginBottom: 16,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            Change Password
          </h2>
          <form onSubmit={handlePasswordChange} style={{ display: 'grid', gap: 12 }}>
            <div>
              <label style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                color: 'var(--mute)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                display: 'block',
                marginBottom: 4,
              }}>
                New Password
              </label>
              <input
                type="password"
                value={passwordForm.new}
                onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                placeholder="At least 8 characters"
                style={{
                  width: '100%',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 12,
                  color: 'var(--paper)',
                  padding: '8px 12px',
                  background: 'rgba(242, 238, 229, 0.04)',
                  border: '1px solid var(--rule)',
                  borderRadius: 4,
                  outline: 'none',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--cyan)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--rule)'}
              />
            </div>
            <div>
              <label style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                color: 'var(--mute)',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                display: 'block',
                marginBottom: 4,
              }}>
                Confirm Password
              </label>
              <input
                type="password"
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                placeholder="Confirm new password"
                style={{
                  width: '100%',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 12,
                  color: 'var(--paper)',
                  padding: '8px 12px',
                  background: 'rgba(242, 238, 229, 0.04)',
                  border: '1px solid var(--rule)',
                  borderRadius: 4,
                  outline: 'none',
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = 'var(--cyan)'}
                onBlur={(e) => e.currentTarget.style.borderColor = 'var(--rule)'}
              />
            </div>
            <button
              type="submit"
              disabled={isChangingPassword}
              style={{
                fontFamily: 'Archivo Black, sans-serif',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '10px 16px',
                background: isChangingPassword ? 'var(--mute)' : 'var(--cyan)',
                color: '#000',
                border: 'none',
                borderRadius: 4,
                cursor: isChangingPassword ? 'wait' : 'pointer',
                opacity: isChangingPassword ? 0.6 : 1,
                marginTop: 8,
              }}
            >
              {isChangingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>

        {/* Tour & Account Section */}
        <div style={{
          background: 'var(--ink-3)',
          border: '1px solid var(--rule)',
          borderRadius: 8,
          padding: '20px 16px',
          marginBottom: 24,
          display: 'grid',
          gap: 12,
        }}>
          <button
            onClick={handleReplayTour}
            style={{
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '10px 16px',
              background: 'rgba(0, 180, 216, 0.12)',
              color: 'var(--cyan)',
              border: '1px solid rgba(0, 180, 216, 0.25)',
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 180, 216, 0.2)';
              e.currentTarget.style.borderColor = 'var(--cyan)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 180, 216, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(0, 180, 216, 0.25)';
            }}
          >
            ↻ Replay Tour
          </button>

          <button
            onClick={handleLogout}
            style={{
              fontFamily: 'Archivo Black, sans-serif',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              padding: '10px 16px',
              background: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--danger)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              borderRadius: 4,
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)';
              e.currentTarget.style.borderColor = 'var(--danger)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)';
              e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)';
            }}
          >
            ← Logout
          </button>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: 'center',
          fontSize: 10,
          color: 'var(--mute)',
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.08em',
          marginTop: 32,
        }}>
          <p>Alpha v0.1 · 2026</p>
        </div>
      </div>
    </div>
  );
}
