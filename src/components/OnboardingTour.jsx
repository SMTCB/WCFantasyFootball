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
import Button from './Button';

const PADDING   = 10;    // px around highlighted element
const TOOLTIP_W = 300;
const TOOLTIP_H = 230;   // realistic estimate (avoids "goes to top" overcorrection)

function getRect(target) {
  const els = document.querySelectorAll(`[data-tour="${target}"]`);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      return {
        top:    r.top    - PADDING,
        left:   r.left   - PADDING,
        width:  r.width  + PADDING * 2,
        height: r.height + PADDING * 2,
        el,
      };
    }
  }
  return null;
}

/**
 * Resolves as soon as `[data-tour="${target}"]` exists in the DOM.
 * Uses MutationObserver — no arbitrary delay, fires on the exact render tick.
 * Falls back after `timeout` ms if the element never appears.
 */
function findVisible(target) {
  const els = document.querySelectorAll(`[data-tour="${target}"]`);
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function waitForElement(target, timeout = 2000) {
  return new Promise(resolve => {
    const existing = findVisible(target);
    if (existing) { resolve(existing); return; }

    const observer = new MutationObserver(() => {
      const el = findVisible(target);
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
      const r = getRect(current.target);
      // Reject zero-height rects (element exists but has no rendered content)
      if (r && r.height <= PADDING * 2 + 2) { setRect(null); return; }
      setRect(r);
    }
    // Wait for element to appear, then allow smooth-scroll to settle before measuring
    waitForElement(current.target, 3000).then((el) => {
      if (cancelled) return;
      if (el) {
        // Delay gives scrollIntoView (smooth) time to finish before we measure
        setTimeout(() => { if (!cancelled) measure(); }, 350);
      } else {
        setRect(null);
      }
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
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const MARGIN = 12;

    // Vertical: prefer below target, fallback to above, last resort center viewport.
    const spaceBelow = vh - (rect.top + rect.height);
    const spaceAbove = rect.top;
    let top;
    if (spaceBelow >= TOOLTIP_H + MARGIN) {
      // Fits below
      top = rect.top + rect.height + 12;
    } else if (spaceAbove >= TOOLTIP_H + MARGIN) {
      // Fits above
      top = rect.top - TOOLTIP_H - 12;
    } else {
      // Neither — float in the lower-center of the viewport
      top = vh - TOOLTIP_H - MARGIN * 4;
    }
    top = Math.max(MARGIN, Math.min(top, vh - TOOLTIP_H - MARGIN));
    tooltipStyle.top = `${top}px`;

    // Horizontal: center on target, clamped within viewport
    const idealLeft = rect.left + rect.width / 2 - TOOLTIP_W / 2;
    const clampedLeft = Math.max(MARGIN, Math.min(idealLeft, vw - TOOLTIP_W - MARGIN));
    tooltipStyle.left = `${clampedLeft}px`;
  } else {
    // Fallback: center screen
    tooltipStyle.top  = '50%';
    tooltipStyle.left = '50%';
    tooltipStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    <div style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: visible ? 'auto' : 'none' }}>
      {/* Tooltip card */}
      <div style={{
        ...tooltipStyle,
        background:   'var(--ink-2)',
        border:       '1px solid rgba(255,255,255,0.1)',
        borderRadius: '12px',
        padding:      '20px',
        boxShadow:    'none',
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
          <Button variant="ghost" size="md" onClick={handleSkip}>
            Skip tour
          </Button>
          <Button variant="gold" size="md" onClick={handleNext}>
            {isLast ? 'Got it ✓' : 'Next →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
