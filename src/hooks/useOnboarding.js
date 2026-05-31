/**
 * useOnboarding
 *
 * Manages the one-time onboarding wizard and per-screen tour state.
 * All flags live in localStorage so they survive a page refresh and
 * never repeat — even across sessions on the same device.
 *
 * Keys:
 *   forzakit_onboarding_done       — wizard has been completed or skipped
 *   forzakit_tour_squad_done       — squad spotlight tour completed
 *   forzakit_tour_market_done      — market spotlight tour completed
 *   forzakit_tour_league_done      — league tab tour completed
 *   forzakit_tour_commissioner_done — commissioner panel tour completed
 *   forzakit_tour_bets_done        — bets section tour completed
 *
 * Analytics events are stubbed with console.info in demo mode.
 * Swap the `track()` body for your analytics provider when ready.
 */

import { useState, useCallback, useEffect } from 'react';

const K = {
  wizard:       'forzakit_onboarding_done',
  squad:        'forzakit_tour_squad_done',
  market:       'forzakit_tour_market_done',
  league:       'forzakit_tour_league_done',
  commissioner: 'forzakit_tour_commissioner_done',
  bets:         'forzakit_tour_bets_done',
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
  const [wizardDone,       setWizardDone]       = useState(() => get(K.wizard));
  const [squadDone,        setSquadDone]        = useState(() => get(K.squad));
  const [marketDone,       setMarketDone]       = useState(() => get(K.market));
  const [leagueDone,       setLeagueDone]       = useState(() => get(K.league));
  const [commissionerDone, setCommissionerDone] = useState(() => get(K.commissioner));
  const [betsDone,         setBetsDone]         = useState(() => get(K.bets));

  const completeWizard = useCallback((step) => {
    set(K.wizard, true);
    setWizardDone(true);
    track('onboarding_wizard_complete', { step });
  }, []);

  const skipWizard = useCallback((step) => {
    // Skipping the wizard means the user doesn't want any tutorials — dismiss all
    // per-screen tours at once so they don't reappear on every tab they visit.
    Object.values(K).forEach(k => set(k, true));
    setWizardDone(true);
    setSquadDone(true);
    setMarketDone(true);
    setLeagueDone(true);
    setCommissionerDone(true);
    setBetsDone(true);
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

  const completeLeagueTour = useCallback(() => {
    set(K.league, true);
    setLeagueDone(true);
    track('onboarding_tour_complete', { screen: 'league' });
  }, []);

  const completeCommissionerTour = useCallback(() => {
    set(K.commissioner, true);
    setCommissionerDone(true);
    track('onboarding_tour_complete', { screen: 'commissioner' });
  }, []);

  const completeBetsTour = useCallback(() => {
    set(K.bets, true);
    setBetsDone(true);
    track('onboarding_tour_complete', { screen: 'bets' });
  }, []);

  // ── Replay functions — reset flag so tour shows again ─────────────────────
  const replaySquadTour = useCallback(() => {
    set(K.squad, false);
    setSquadDone(false);
    track('onboarding_tour_replay', { screen: 'squad' });
  }, []);

  const replayMarketTour = useCallback(() => {
    set(K.market, false);
    setMarketDone(false);
    track('onboarding_tour_replay', { screen: 'market' });
  }, []);

  const replayLeagueTour = useCallback(() => {
    set(K.league, false);
    setLeagueDone(false);
    track('onboarding_tour_replay', { screen: 'league' });
  }, []);

  const replayCommissionerTour = useCallback(() => {
    set(K.commissioner, false);
    setCommissionerDone(false);
    track('onboarding_tour_replay', { screen: 'commissioner' });
  }, []);

  const replayBetsTour = useCallback(() => {
    set(K.bets, false);
    setBetsDone(false);
    track('onboarding_tour_replay', { screen: 'bets' });
  }, []);

  const replayWizard = useCallback(() => {
    set(K.wizard, false);
    setWizardDone(false);
    track('onboarding_wizard_replay', {});
  }, []);

  // Dev helper — call window.__resetOnboarding() in console to replay wizard
  useEffect(() => {
    if (!window.__resetOnboarding) {
      window.__resetOnboarding = () => {
        Object.values(K).forEach(k => localStorage.removeItem(k));
        window.location.reload();
      };
    }
    return () => { delete window.__resetOnboarding; };
  }, []);

  return {
    showWizard:          false, // disabled — restore to: !wizardDone
    showSquadTour:       wizardDone && !squadDone,
    showMarketTour:      wizardDone && !marketDone,
    showLeagueTour:      wizardDone && !leagueDone,
    showCommissionerTour: wizardDone && !commissionerDone,
    showBetsTour:        wizardDone && !betsDone,
    completeWizard,
    skipWizard,
    completeSquadTour,
    completeMarketTour,
    completeLeagueTour,
    completeCommissionerTour,
    completeBetsTour,
    replaySquadTour,
    replayMarketTour,
    replayLeagueTour,
    replayCommissionerTour,
    replayBetsTour,
    replayWizard,
  };
}
