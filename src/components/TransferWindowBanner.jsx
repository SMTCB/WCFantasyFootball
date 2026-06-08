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
      <div className="bg-[#00261A] border-b border-[#00C853]/20 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00C853] animate-pulse shrink-0" />
          <span className="text-[#00C853] text-[10px] font-black uppercase tracking-widest">
            Window Open
          </span>
          {!isUnlimited && transfersRemaining !== null && (
            <span className="text-[#9E9E9E] text-[10px]">
              · {transfersRemaining} transfer{transfersRemaining !== 1 ? 's' : ''} left
            </span>
          )}
          {isUnlimited && (
            <span className="text-[#9E9E9E] text-[10px]">· Unlimited</span>
          )}
        </div>
        {closesIn && (
          <span className="text-[#9E9E9E] text-[10px]">Closes in {closesIn}</span>
        )}
      </div>
    );
  }

  if (status === 'upcoming') {
    return (
      <div className="bg-[#1A1200] border-b border-[#FFC107]/20 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#FFC107] shrink-0" />
          <span className="text-[#FFC107] text-[10px] font-black uppercase tracking-widest">
            Window Closed
          </span>
        </div>
        {opensIn && (
          <span className="text-[#9E9E9E] text-[10px]">Opens in {opensIn}</span>
        )}
      </div>
    );
  }

  return null;
}
