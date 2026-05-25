import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.jsx";
// initNative is called inside App.jsx — importing capacitor.js here AND
// having AuthContext.jsx import it too creates a Rolldown TDZ at the entry point.
import { supabase } from "./lib/supabase.js";

// ── Global error reporter (O3) ───────────────────────────────────────────────
// Fire-and-forget: never block the UI on logging. Uses report_client_error RPC
// (migration 71) so anon calls bypass RLS and write to client_errors table.
function reportClientError(message, stack, context = {}) {
  supabase.rpc('report_client_error', {
    p_message:    String(message ?? 'unknown'),
    p_stack:      stack ?? null,
    p_url:        window.location.href,
    p_user_agent: navigator.userAgent,
    p_context:    context,
  }).catch(() => {});
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
