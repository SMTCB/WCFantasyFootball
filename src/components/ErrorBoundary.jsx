/**
 * ErrorBoundary — catches unhandled React render errors at the screen level.
 *
 * Each route is wrapped individually so a crash on one screen doesn't take
 * down the whole app. The user sees a branded fallback with a Reload CTA
 * instead of a blank white screen.
 *
 * Crash reporting:
 *   In development: logs to console.error.
 *   In production: calls reportError() which logs to Supabase error_logs
 *   and is ready for a Sentry DSN to be dropped in (see reportError below).
 *
 * Usage:
 *   <ErrorBoundary screen="SquadScreen">
 *     <SquadScreen />
 *   </ErrorBoundary>
 */

import { Component } from 'react';
import { supabase } from '../lib/supabase';

// ── Lightweight crash reporter ────────────────────────────────────────────────
// Replace the body of this function with Sentry.captureException(error) once
// a Sentry DSN is configured. The signature stays the same.
async function reportError(error, errorInfo, screen) {
  // Always log locally
  console.error(`[ErrorBoundary] Crash on screen: ${screen}`, error, errorInfo);

  // In production, write a row to error_logs for visibility
  if (import.meta.env.PROD) {
    try {
      await supabase.from('error_logs').insert({
        screen,
        message:    error?.message ?? String(error),
        stack:      error?.stack   ?? null,
        component:  errorInfo?.componentStack ?? null,
        user_agent: navigator.userAgent,
        occurred_at: new Date().toISOString(),
      });
    } catch {
      // Swallow — if the reporter itself fails we don't want an infinite loop
    }
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
          background: '#080A0E',
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
            fontFamily: 'Barlow Condensed, sans-serif',
            fontSize: '22px',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            color: '#F0F2F5',
            marginBottom: '8px',
          }}
        >
          Something went wrong
        </div>

        {/* Subtext */}
        <div
          style={{
            fontSize: '13px',
            color: '#7D8A96',
            fontFamily: 'DM Sans, sans-serif',
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
              background: 'rgba(240,58,58,0.07)',
              border: '1px solid rgba(240,58,58,0.2)',
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
                color: '#F03A3A',
                fontFamily: 'Barlow Condensed, sans-serif',
                marginBottom: '6px',
              }}
            >
              Dev — Error Detail
            </div>
            <pre
              style={{
                fontSize: '11px',
                color: '#F03A3A',
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
              background: '#00C4E8',
              color: '#000',
              border: 'none',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'Barlow Condensed, sans-serif',
            }}
          >
            Reload
          </button>
          <button
            onClick={this.handleGoHome}
            style={{
              padding: '12px 28px',
              background: 'transparent',
              color: '#7D8A96',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '4px',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              fontFamily: 'Barlow Condensed, sans-serif',
            }}
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }
}
