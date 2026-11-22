// The player market inside the My team tab (S31, MD-12): a tall sheet on phone, a right
// panel on desktop. It hosts MarketScreen, so the filters, the list and
// auto-fill are the market's own. Picks go to the shared transfer basket and nothing is
// sent until the manager confirms on the My team tab.
//
// Not built on BottomSheet: that sits at --z-toast, above ConfirmModal (--z-confirm), and
// the market's own sell warnings must show on top of it. This panel sits at --z-modal.
import { lazy, Suspense, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// Lazy so MarketScreen (which also imports HubShared) never joins the LeagueScreen chunk
// at a second depth — Rolldown TDZ rule in CLAUDE.md.
const MarketScreen = lazy(() => import('../../screens/MarketScreen'));

// `footer` is the pending-transfers basket, handed in by SquadScreen so this file never
// imports a module SquadScreen also imports at another depth.
export default function MarketPanel({ leagueId, initialPos = null, pendingCount = 0, isMobile, onClose, footer = null }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const returnTo = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e) => { if (e.key === 'Escape' && document.querySelectorAll('[role="dialog"]').length <= 1) onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (returnTo instanceof HTMLElement && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
    };
  }, [onClose]);

  const panelStyle = isMobile
    ? { left: 0, right: 0, bottom: 0, height: '92vh', borderRadius: '16px 16px 0 0', borderTop: '1px solid var(--rule)' }
    : { top: 0, right: 0, bottom: 0, width: 'min(560px, 100vw)', borderLeft: '1px solid var(--rule)' };

  return createPortal(
    <>
      <div role="presentation" onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 'var(--z-modal)' }} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Player market"
        tabIndex={-1}
        data-testid="market-panel"
        className={isMobile ? 'animate-slide-up' : ''}
        style={{
          position: 'fixed', zIndex: 'var(--z-modal)', outline: 'none',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'var(--bg)', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          ...panelStyle,
        }}
      >
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', background: 'var(--card)', borderBottom: '1px solid var(--rule)' }}>
          <div>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Transfers</div>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-heading)', color: 'var(--paper)', lineHeight: 1.1 }}>Player market</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="market-panel-done"
            className="hit-44 transition-all active:scale-95"
            style={{ padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)', borderRadius: 2, fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)', cursor: 'pointer' }}
          >
            {pendingCount > 0 ? `Done · ${pendingCount} change${pendingCount === 1 ? '' : 's'}` : 'Done'}
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <Suspense fallback={<div role="status" style={{ padding: 24, color: 'var(--mute)', fontSize: 'var(--fs-label)' }}>Loading market…</div>}>
            <MarketScreen leagueId={leagueId} initialPos={initialPos} />
          </Suspense>
        </div>
        {footer}
      </div>
    </>,
    document.body
  );
}
