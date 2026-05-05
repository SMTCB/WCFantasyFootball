/**
 * OnboardingTour — lightweight spotlight tooltip system.
 *
 * Renders a sequence of steps, each targeting a DOM element via
 * a `data-tour="<id>"` attribute. A semi-transparent overlay covers
 * the page; the target element is "cut out" via a box-shadow trick.
 * A positioned tooltip card shows the step content.
 *
 * Usage:
 *   <OnboardingTour
 *     steps={[
 *       { target: 'pitch-view', title: 'Your Pitch', body: '...' },
 *       { target: 'chips-row',  title: 'Chips',      body: '...' },
 *     ]}
 *     onComplete={() => {}}
 *     onSkip={() => {}}
 *   />
 *
 * The host element needs: data-tour="pitch-view" (no #, no dot).
 */

import { useState, useEffect, useLayoutEffect } from 'react';

const PADDING = 10;   // px around highlighted element
const TOOLTIP_W = 280;

function getRect(target) {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top:    r.top    - PADDING,
    left:   r.left   - PADDING,
    width:  r.width  + PADDING * 2,
    height: r.height + PADDING * 2,
    el,
  };
}

/**
 * Resolves as soon as `[data-tour="${target}"]` exists in the DOM.
 * Uses MutationObserver — no arbitrary delay, fires on the exact render tick.
 * Falls back after `timeout` ms if the element never appears.
 */
function waitForElement(target, timeout = 2000) {
  return new Promise(resolve => {
    const sel = `[data-tour="${target}"]`;
    const existing = document.querySelector(sel);
    if (existing) { resolve(existing); return; }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(sel);
      if (el) { observer.disconnect(); resolve(el); }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
  });
}

export default function OnboardingTour({ steps, onComplete, onSkip }) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect,    setRect]    = useState(null);
  const [visible, setVisible] = useState(false);

  const current = steps[stepIdx];
  const isLast  = stepIdx === steps.length - 1;

  // Track target element position (handles scroll / resize)
  useLayoutEffect(() => {
    let cancelled = false;
    function measure() {
      setRect(getRect(current.target));
    }
    // Wait for element to appear (MutationObserver — no arbitrary delays)
    waitForElement(current.target).then(() => {
      if (!cancelled) measure();
    });
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelled = true;
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [stepIdx, current.target]);

  // Fade in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  // Scroll target into view
  useEffect(() => {
    const el = document.querySelector(`[data-tour="${current.target}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [stepIdx, current.target]);

  // Keyboard
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'Enter') handleNext();
      if (e.key === 'Escape') handleSkip();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIdx]);

  function handleNext() {
    if (isLast) {
      setVisible(false);
      setTimeout(onComplete, 300);
    } else {
      setStepIdx(i => i + 1);
    }
  }

  function handleSkip() {
    setVisible(false);
    setTimeout(onSkip, 300);
  }

  // ── Tooltip position ────────────────────────────────────────────────────────
  let tooltipStyle = {
    position:   'fixed',
    width:      `${TOOLTIP_W}px`,
    zIndex:     10001,
    transition: 'top 0.25s ease, left 0.25s ease',
  };

  if (rect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spaceBelow = vh - (rect.top + rect.height);

    // Prefer below; fallback to above
    if (spaceBelow > 180) {
      tooltipStyle.top  = `${rect.top + rect.height + 12}px`;
    } else {
      tooltipStyle.top = `${Math.max(12, rect.top - 12)}px`;
    }

    // If target is in the right half of screen, anchor tooltip to its right edge (opens leftward)
    const targetCenterX = rect.left + rect.width / 2;
    if (targetCenterX > vw / 2) {
      // Right-side target: align tooltip right edge to target right edge, clamp to viewport
      const rightEdge = rect.left + rect.width + PADDING;
      const tooltipLeft = Math.min(rightEdge - TOOLTIP_W, vw - TOOLTIP_W - 16);
      tooltipStyle.left = `${Math.max(16, tooltipLeft)}px`;
    } else {
      // Left-side target: align tooltip left edge to target left, clamp to viewport
      const maxLeft = vw - TOOLTIP_W - 16;
      tooltipStyle.left = `${Math.max(16, Math.min(rect.left, maxLeft))}px`;
    }
  } else {
    // Fallback: center screen
    tooltipStyle.top  = '50%';
    tooltipStyle.left = '50%';
    tooltipStyle.transform = 'translate(-50%, -50%)';
  }

  // ── Overlay cutout via box-shadow ───────────────────────────────────────────
  const overlayStyle = rect
    ? {
        position:  'fixed',
        top:       `${rect.top}px`,
        left:      `${rect.left}px`,
        width:     `${rect.width}px`,
        height:    `${rect.height}px`,
        borderRadius: '6px',
        boxShadow: '0 0 0 9999px rgba(7, 10, 15, 0.82)',
        zIndex:    10000,
        pointerEvents: 'none',
        transition: 'top 0.25s ease, left 0.25s ease, width 0.25s ease, height 0.25s ease',
      }
    : {
        position: 'fixed',
        inset:    0,
        background: 'rgba(7, 10, 15, 0.82)',
        zIndex:   10000,
        pointerEvents: 'none',
      };

  return (
    <div style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: visible ? 'auto' : 'none' }}>
      {/* Overlay / cutout */}
      <div style={overlayStyle} />

      {/* Tooltip card */}
      <div style={{
        ...tooltipStyle,
        background:   'var(--ink-2)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        padding:      '20px',
        boxShadow:    '0 16px 48px rgba(0,0,0,0.6)',
      }}>
        {/* Step counter */}
        <div style={{
          fontSize:      '10px',
          fontFamily:    'Archivo Black, sans-serif',
          letterSpacing: '0.12em',
          color:         'var(--gold)',
          textTransform: 'uppercase',
          marginBottom:  '6px',
        }}>
          {stepIdx + 1} / {steps.length}
        </div>

        {/* Title */}
        <div style={{
          fontSize:     '18px',
          fontFamily:   'Archivo Black, sans-serif',
          fontWeight:   800,
          color:        'var(--paper)',
          textTransform: 'uppercase',
          lineHeight:   1.1,
          marginBottom: '8px',
        }}>
          {current.title}
        </div>

        {/* Body */}
        <p style={{
          fontSize:     '13px',
          lineHeight:   1.6,
          color:        'rgba(240,242,245,0.6)',
          marginBottom: '16px',
        }}>
          {current.body}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={handleSkip}
            style={{
              fontSize:   '11px',
              color:      'rgba(255,255,255,0.3)',
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              fontFamily: 'Archivo Black, sans-serif',
              letterSpacing: '0.05em',
            }}
          >
            Skip tour
          </button>
          <button
            onClick={handleNext}
            style={{
              padding:       '8px 18px',
              background:    'var(--gold)',
              color:         'var(--ink-2)',
              fontSize:      '11px',
              fontFamily:    'Archivo Black, sans-serif',
              fontWeight:    800,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              border:        'none',
              borderRadius:  '6px',
              cursor:        'pointer',
            }}
          >
            {isLast ? 'Got it ✓' : 'Next →'}
          </button>
        </div>
      </div>
    </div>
  );
}
