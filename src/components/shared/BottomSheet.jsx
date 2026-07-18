import { createPortal } from 'react-dom';
import { useEffect } from 'react';

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
}) {
  useEffect(() => {
    if (!closeOnEscape || !onClose) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [closeOnEscape, onClose]);

  return createPortal(
    <>
      <div className="fk-mob-sheet-overlay" onClick={closeOnBackdrop ? onClose : undefined} />
      <div className="fk-mob-sheet-wrap" data-sheet-tablet>
        <div
          className={`flex flex-col ${contentClassName}`}
          style={{
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
