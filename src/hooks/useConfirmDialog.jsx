import { useState, useCallback } from 'react';
import ConfirmModal from '../components/ConfirmModal';

// Replaces window.confirm for irreversible actions. Render `dialog` once in the
// component tree; call `ask({ title, body, confirmLabel, onConfirm })` to open it.
export default function useConfirmDialog() {
  const [cfg, setCfg] = useState(null);
  const ask = useCallback((opts) => setCfg(opts), []);
  const dialog = cfg ? <ConfirmModal danger {...cfg} onCancel={() => setCfg(null)} /> : null;
  return [ask, dialog];
}
