/**
 * ErrorBoundary — catches unhandled React render errors at the screen level.
 *
 * Each route is wrapped individually so a crash on one screen doesn't take
 * down the whole app. The user sees a branded fallback with a Reload CTA
 * instead of a blank white screen.
 *
 * Usage:
 *   <ErrorBoundary screen="SquadScreen">
 *     <SquadScreen />
 *   </ErrorBoundary>
 */

import { Component } from 'react';

// ── Lightweight crash reporter ────────────────────────────────────────────────
// Delegates to window.__reportClientError (wired in main.jsx) which calls the
// report_client_error RPC (migration 71). Falls back to console.error only.
function reportError(error, errorInfo, screen) {
  console.error(`[ErrorBoundary] Crash on screen: ${screen}`, error, errorInfo);
  if (typeof window.__reportClientError === 'function') {
    window.__reportClientError(
      error?.message ?? String(error),
      error?.stack   ?? null,
      { type: 'react', screen, componentStack: errorInfo?.componentStack ?? null }
    );
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    reportError(error, errorInfo, this.props.screen ?? 'Unknown');
  }

  handleReload = () => {
    // Reset boundary state then reload the page
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const screen = this.props.screen ?? 'this screen';
    const isDev  = import.meta.env.DEV;

    return (
      <div
        style={{
          minHeight: '100svh',
          background: 'var(--ink)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div style={{ fontSize: '40px', marginBottom: '20px', opacity: 0.6 }}>⚡</div>

        {/* Heading */}
        <div
          style={{
            fontFamily: 'Archivo Black, sans-serif',
            fontSize: '22px',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: 'var(--paper)',
            marginBottom: '8px',
          }}
        >
          Something went wrong
        </div>

        {/* Subtext */}
        <div
          style={{
            fontSize: '13px',
            color: 'var(--mute)',
            fontFamily: 'Archivo, sans-serif',
            maxWidth: '300px',
            lineHeight: 1.5,
            marginBottom: '28px',
          }}
        >
          {screen} crashed unexpectedly. Your squad data is safe — this is a display error only.
        </div>

        {/* Dev-only error detail */}
        {isDev && this.state.error && (
          <div
            style={{
              width: '100%',
              maxWidth: '500px',
              background: 'rgba(239,68,68,0.07)',
              border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: '6px',
              padding: '12px 16px',
              marginBottom: '24px',
              textAlign: 'left',
            }}
          >
            <div
              style={{
                fontSize: '9px',
                fontWeight: 800,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: 'var(--danger)',
                fontFamily: 'Archivo Black, sans-serif',
                marginBottom: '6px',
              }}
            >
              Dev — Error Detail
            </div>
            <pre
              style={{
                fontSize: '11px',
                color: 'var(--danger)',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
              }}
            >
              {this.state.error.message}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={this.handleReload}
            style={{
              padding: '12px 28px',
              background: 'var(--cyan)',
              color: 'var(--ink)',
              border: 'none',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'Archivo Black, sans-serif',
            }}
          >
            Reload
          </button>
          <button
            onClick={this.handleGoHome}
            style={{
              padding: '12px 28px',
              background: 'transparent',
              color: 'var(--mute)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'Archivo Black, sans-serif',
            }}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }
}
