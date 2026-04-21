/**
 * useOnboarding
 *
 * Manages the one-time onboarding wizard and per-screen tour state.
 * All flags live in localStorage so they survive a page refresh and
 * never repeat — even across sessions on the same device.
 *
 * Keys:
 *   forzakit_onboarding_done   — wizard has been completed or skipped
 *   forzakit_tour_squad_done   — squad spotlight tour completed
 *   forzakit_tour_market_done  — market spotlight tour completed
 *
 * Analytics events are stubbed with console.info in demo mode.
 * Swap the `track()` body for your analytics provider when ready.
 */

import { useState, useCallback } from 'react';

const K = {
  wizard:  'forzakit_onboarding_done',
  squad:   'forzakit_tour_squad_done',
  market:  'forzakit_tour_market_done',
};

function get(key)       { return localStorage.getItem(key) === 'true'; }
function set(key, val)  { localStorage.setItem(key, val ? 'true' : 'false'); }

// ── Analytics stub ────────────────────────────────────────────────────────────
function track(event, props = {}) {
  // TODO: swap for Mixpanel / PostHog / Amplitude when analytics is wired
  console.info('[onboarding]', event, props);
}

// ─────────────────────────────────────────────────────────────────────────────
export function useOnboarding() {
  const [wizardDone,  setWizardDone]  = useState(() => get(K.wizard));
  const [squadDone,   setSquadDone]   = useState(() => get(K.squad));
  const [marketDone,  setMarketDone]  = useState(() => get(K.market));

  const completeWizard = useCallback((step) => {
    set(K.wizard, true);
    setWizardDone(true);
    track('onboarding_wizard_complete', { step });
  }, []);

  const skipWizard = useCallback((step) => {
    set(K.wizard, true);
    setWizardDone(true);
    track('onboarding_wizard_skip', { step });
  }, []);

  const completeSquadTour = useCallback(() => {
    set(K.squad, true);
    setSquadDone(true);
    track('onboarding_tour_complete', { screen: 'squad' });
  }, []);

  const completeMarketTour = useCallback(() => {
    set(K.market, true);
    setMarketDone(true);
    track('onboarding_tour_complete', { screen: 'market' });
  }, []);

  // Dev helper — call window.__resetOnboarding() in console to replay wizard
  if (typeof window !== 'undefined') {
    window.__resetOnboarding = () => {
      Object.values(K).forEach(k => localStorage.removeItem(k));
      window.location.reload();
    };
  }

  return {
    showWizard:        !wizardDone,
    showSquadTour:     wizardDone && !squadDone,
    showMarketTour:    wizardDone && !marketDone,
    completeWizard,
    skipWizard,
    completeSquadTour,
    completeMarketTour,
  };
}
