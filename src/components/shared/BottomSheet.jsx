import { createPortal } from 'react-dom';

/**
 * Shared bottom-sheet primitive — portaled to document.body so it escapes the
 * iOS WebkitOverflowScrolling stacking-context trap in AppLayout#main-content.
 *
 * Uses the existing .fk-mob-sheet-overlay / .fk-mob-sheet-wrap CSS.
 * The caller is responsible for the inner content (pass as children).
 *
 * Props:
 *   open              - mount/unmount the sheet (caller controls)
 *   onClose           - called when backdrop is tapped
 *   dismissOnBackdrop - tap backdrop → onClose; default true
 *   children          - the sheet content (header, body, actions, etc.)
 */
export default function BottomSheet({ open, onClose, dismissOnBackdrop = true, children }) {
  if (!open) return null;

  return createPortal(
    <>
      <div
        className="fk-mob-sheet-overlay"
        onClick={dismissOnBackdrop && onClose ? onClose : undefined}
      />
      <div className="fk-mob-sheet-wrap">
        {children}
      </div>
    </>,
    document.body
  );
}
