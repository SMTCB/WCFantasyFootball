import { useState, useEffect } from 'react';

// Displays transfer window status as a compact sticky banner.
// Pass the result of useTransferWindow() as props.

function useCountdown(target) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    if (!target) return;
    const tick = () => {
      const diff = new Date(target) - Date.now();
      if (diff <= 0) { setLabel('now'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (d > 0)      setLabel(`${d}d ${h}h ${m}m`);
      else if (h > 0) setLabel(`${h}h ${m}m`);
      else            setLabel(`${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return label;
}

export default function TransferWindowBanner({ status, closesAt, opensAt, transfersRemaining, isUnlimited }) {
  const closesIn = useCountdown(status === 'open'     ? closesAt : null);
  const opensIn  = useCountdown(status === 'upcoming' ? opensAt  : null);

  if (status === 'loading' || status === 'no_window') return null;

  if (status === 'open') {
    return (
      <div className="fk-sysbar success">
        <span className="fk-sysbar-dot" />
        <span className="fk-sysbar-tag">Window Open</span>
        <span className="fk-sysbar-msg">
          {isUnlimited
            ? 'Unlimited transfers'
            : transfersRemaining !== null
              ? `${transfersRemaining} transfer${transfersRemaining !== 1 ? 's' : ''} left`
              : null}
          {closesIn && <span>· Closes in {closesIn}</span>}
        </span>
      </div>
    );
  }

  if (status === 'upcoming') {
    return (
      <div className="fk-sysbar warning">
        <span className="fk-sysbar-dot" />
        <span className="fk-sysbar-tag">Window Closed</span>
        <span className="fk-sysbar-msg">
          Transfers locked
          {opensIn && <span>· Opens in {opensIn}</span>}
        </span>
      </div>
    );
  }

  return null;
}
