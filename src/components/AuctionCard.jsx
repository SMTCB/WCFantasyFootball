import { useState } from 'react';

const POS_COLOR = { GK: 'var(--gold)', DEF: 'var(--cyan)', MID: 'var(--positive)', FWD: 'var(--danger)' };

function timeLeft(endsAt) {
  const ms = new Date(endsAt) - Date.now();
  if (ms <= 0) return 'Ended';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 23) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0)  return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AuctionCard({ auction, mySquadId, myBudget, onBid, onCancel, onSellNow }) {
  const [amount, setAmount] = useState('');
  const [busy,   setBusy]   = useState(false);
  const [err,    setErr]    = useState(null);

  const player      = auction.players;
  const posColor    = POS_COLOR[player?.position] ?? 'var(--mute)';
  const isMine      = auction.seller_id === mySquadId;
  const currentBid  = auction.current_bid ?? null;
  const minNext     = currentBid != null ? currentBid + 0.1 : auction.starting_bid;
  const timeStr     = timeLeft(auction.deadline_at);
  const isEnded     = timeStr === 'Ended';

  const handleBid = async () => {
    const val = parseFloat(amount);
    if (isNaN(val) || val < minNext) {
      setErr(`Minimum bid: £${minNext.toFixed(1)}M`);
      return;
    }
    if (myBudget != null && val > myBudget) {
      setErr(`Bid exceeds your budget (£${myBudget.toFixed(1)}M)`);
      return;
    }
    setBusy(true);
    setErr(null);
    const res = await onBid(auction.id, val);
    setBusy(false);
    if (res.ok) {
      setAmount('');
    } else {
      setErr(res.error);
    }
  };

  return (
    <div
      className="border-b"
      style={{ borderColor: 'var(--rule)', background: isMine ? 'rgba(255,255,255,0.02)' : 'transparent' }}
    >
      <div className="px-4 py-3 flex items-start gap-3">
        {/* Position badge */}
        <div
          className="shrink-0 flex items-center justify-center text-[9px] font-black"
          style={{ width: 36, height: 36, border: `1px solid ${posColor}40`, color: posColor, background: `${posColor}0d` }}
        >
          {player?.position ?? '?'}
        </div>

        {/* Player info */}
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-bold text-white truncate">{player?.name ?? '—'}</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--mute)' }}>
            {player?.club} · £{player?.price}M
          </div>
        </div>

        {/* Timer + bid info */}
        <div className="text-right shrink-0">
          <div
            className="text-[10px] font-black uppercase"
            style={{ color: isEnded ? 'var(--mute)' : timeStr.includes('m') && !timeStr.includes('h') ? 'var(--danger)' : 'var(--positive)' }}
          >
            {timeStr}
          </div>
          <div className="text-[12px] font-black text-white mt-0.5">
            {currentBid != null ? `£${currentBid.toFixed(1)}M` : `from £${auction.starting_bid.toFixed(1)}M`}
          </div>
          {currentBid != null && (
            <div className="text-[9px]" style={{ color: 'var(--mute)' }}>current bid</div>
          )}
        </div>
      </div>

      {/* Actions */}
      {!isEnded && (
        <div className="px-4 pb-3 flex items-center gap-2">
          {isMine ? (
            <div className="flex items-center gap-2">
              {/* Sell Now — only shown when at least one bid exists */}
              {auction.highest_bidder_id && onSellNow && (
                <button
                  onClick={async () => { setBusy(true); const r = await onSellNow(auction.id); setBusy(false); if (!r.ok) setErr(r.error); }}
                  disabled={busy}
                  className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 disabled:opacity-40"
                  style={{ border: '1px solid rgba(34,197,86,0.35)', color: 'var(--positive)', background: 'rgba(34,197,86,0.08)' }}
                >
                  {busy ? '…' : `Sell Now · £${(auction.current_bid ?? 0).toFixed(1)}M`}
                </button>
              )}
              <button
                onClick={async () => { setBusy(true); const r = await onCancel(auction.id); setBusy(false); if (!r.ok) setErr(r.error); }}
                disabled={busy}
                className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 disabled:opacity-40"
                style={{ border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', background: 'rgba(239,68,68,0.06)' }}
              >
                {busy ? '…' : 'Cancel'}
              </button>
            </div>
          ) : (
            <>
              <input
                type="number"
                step="0.1"
                min={minNext}
                value={amount}
                onChange={e => { setAmount(e.target.value); setErr(null); }}
                placeholder={`£${minNext.toFixed(1)}M+`}
                className="flex-1 bg-transparent outline-none text-white text-[12px] font-bold px-2 py-1.5"
                style={{ border: '1px solid var(--rule)', minWidth: 0 }}
              />
              <button
                onClick={handleBid}
                disabled={busy || !amount}
                className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 disabled:opacity-40"
                style={{ background: 'rgba(0,180,216,0.12)', border: '1px solid rgba(0,180,216,0.3)', color: 'var(--cyan)' }}
              >
                {busy ? '…' : 'Bid'}
              </button>
            </>
          )}
          {err && <span className="text-[10px] font-bold" style={{ color: 'var(--danger)' }}>{err}</span>}
        </div>
      )}
    </div>
  );
}
