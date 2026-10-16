import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Count of open sheets so a nested sheet doesn't un-inert the app while another is still open.
let openSheets = 0;

/**
 * Shared bottom-sheet chrome: portal to document.body, backdrop, rounded-top
 * container, slide-up animation, safe-area padding, tablet width cap,
 * Escape-to-close. Callers own everything inside via children (header, tabs,
 * lists, etc.) — this component only owns the parts that were previously
 * hand-rolled (and drifted) across PlayerPickerSheet / H2HSheet / ScoringInfoModal.
 *
 * Reuses the existing .fk-mob-sheet-overlay / .fk-mob-sheet-wrap classes
 * (already used by ActionSheet) so animation, z-index and tablet centering
 * stay in one place — see index.css "Mobile Action Sheet" + "Tablet tier".
 */
export default function BottomSheet({
  onClose,
  children,
  maxHeight = '85vh',
  maxWidth,
  background = 'var(--card)',
  showHandle = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  contentClassName = '',
  contentStyle = {},
  ariaLabel,
}) {
  const panelRef = useRef(null);

  // A11Y-04: dialog behaviour — move focus in, trap Tab, inert the app behind, restore focus on close.
  useEffect(() => {
    const returnTo = document.activeElement;
    const root = document.getElementById('root');
    openSheets += 1;
    if (root) root.inert = true;
    const panel = panelRef.current;
    const first = panel?.querySelector(FOCUSABLE);
    (first ?? panel)?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)];
      if (!items.length) { e.preventDefault(); return; }
      const a = items[0], z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      openSheets -= 1;
      if (root && openSheets === 0) root.inert = false;
      if (returnTo instanceof HTMLElement && document.contains(returnTo)) returnTo.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    if (!closeOnEscape || !onClose) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeOnEscape, onClose]);

  return createPortal(
    <>
      <div role="presentation" className="fk-mob-sheet-overlay" onClick={closeOnBackdrop ? onClose : undefined} />
      <div className="fk-mob-sheet-wrap" data-sheet-tablet>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          tabIndex={-1}
          className={`flex flex-col ${contentClassName}`}
          style={{ outline: 'none',
            background,
            borderTop: '1px solid var(--rule)',
            borderRadius: '16px 16px 0 0',
            maxHeight,
            maxWidth,
            overflowY: 'auto',
            paddingBottom: 'max(0px, env(safe-area-inset-bottom))',
            ...(maxWidth ? { margin: '0 auto' } : {}),
            ...contentStyle,
          }}
        >
          {showHandle && (
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--rule)' }} />
            </div>
          )}
          {children}
        </div>
      </div>
    </>,
    document.body
  );
}
