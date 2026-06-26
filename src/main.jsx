import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import "./index.css";
import App from "./App.jsx";
// initNative is called inside App.jsx — importing capacitor.js here AND
// having AuthContext.jsx import it too creates a Rolldown TDZ at the entry point.
import { supabase } from "./lib/supabase.js";

// ── Sentry (OPS-2) ────────────────────────────────────────────────────────────
// Supplements the existing report_client_error RPC reporter below.
// Only initialises when VITE_SENTRY_DSN is set (not in dev unless explicitly configured).
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    // Capture 10 % of transactions for performance monitoring
    tracesSampleRate: 0.1,
    // Attach component stack to React errors
    integrations: [Sentry.browserTracingIntegration()],
  });
}

// ── Global error reporter (O3) ───────────────────────────────────────────────
// Fire-and-forget: never block the UI on logging. Uses report_client_error RPC
// (migration 71) so anon calls bypass RLS and write to client_errors table.
function reportClientError(message, stack, context = {}) {
  try {
    const q = supabase.rpc('report_client_error', {
      p_message:    String(message ?? 'unknown'),
      p_stack:      stack ?? null,
      p_url:        window.location.href,
      p_user_agent: navigator.userAgent,
      p_context:    context,
    });
    if (q && typeof q.catch === 'function') q.catch(() => {});
  } catch { /* reporter must never throw */ }
}

window.addEventListener('error', (e) => {
  reportClientError(e.message, e.error?.stack, { type: 'window.error', filename: e.filename, lineno: e.lineno });
});

window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const msg    = typeof reason === 'string' ? reason : reason?.message ?? 'unhandled rejection';
  reportClientError(msg, reason?.stack, { type: 'unhandledrejection' });
});

// Expose reporter so ErrorBoundary can reuse it without importing supabase directly
window.__reportClientError = reportClientError;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
