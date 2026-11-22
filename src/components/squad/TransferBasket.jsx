// The pending-transfers basket: every change as OUT → IN with an undo button, the money
// left once they go through, and "Confirm transfers". It lives in two places that never
// show together: at the foot of the market sheet (list open, so the manager sees what is
// going in and out while shopping) and as a compact card on My team (list closed).
// It replaced the fixed "Review changes" bar of S31. Nothing is sent until Confirm.
import { useState } from 'react';
import { pairBasket } from '../../lib/transferBasket';

const money = (n) => `€${Number(n).toFixed(1)}M`;

export default function TransferBasket({ basket, moneyLeft, busy, defaultOpen = false, variant = 'card', onConfirm, onRemove, onClear, onOpenMarket }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!basket.length) return null;

  const pairs = pairBasket(basket);
  const over = moneyLeft < 0;
  const needsPick = pairs.some(p => !p.in);
  const footer = variant === 'footer';

  return (
    <div
      data-testid="transfer-review-bar"
      style={{
        flexShrink: 0, background: 'var(--card)',
        ...(footer
          ? { borderTop: '2px solid var(--accent)', boxShadow: '0 -6px 20px rgba(0,0,0,0.08)' }
          : { margin: '8px 12px', border: '1px solid var(--rule)', borderLeft: '3px solid var(--accent)', borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }),
      }}
    >
      <div style={{ padding: '8px 12px' }}>
        {open && (
          <div data-testid="transfer-review-list" style={{ maxHeight: footer ? '34vh' : '40vh', overflowY: 'auto', marginBottom: 6 }}>
            {pairs.map((pr) => {
              const key = `${pr.out?.id ?? 'x'}-${pr.in?.id ?? 'x'}`;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--rule)' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-label)', lineHeight: 1.4 }}>
                    {pr.out && (
                      <div style={{ color: 'var(--danger)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ fontFamily: 'Archivo Black, sans-serif' }}>OUT</span> {pr.out.name} <span style={{ color: 'var(--mute)' }}>{money(pr.out.price)}</span>
                      </div>
                    )}
                    {pr.in ? (
                      <div style={{ color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span style={{ fontFamily: 'Archivo Black, sans-serif' }}>IN</span> {pr.in.name} <span style={{ color: 'var(--mute)' }}>{money(pr.in.price)}</span>
                      </div>
                    ) : onOpenMarket ? (
                      <button type="button" onClick={() => onOpenMarket(pr.out?.position ?? null)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 'var(--fs-label)' }}>
                        Pick a {pr.out?.position} ›
                      </button>
                    ) : (
                      <div style={{ color: 'var(--mute)' }}>Pick a {pr.out?.position} from the list</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove([pr.out?.id, pr.in?.id].filter(Boolean))}
                    disabled={busy}
                    aria-label={`Undo ${pr.out ? `selling ${pr.out.name}` : ''}${pr.out && pr.in ? ' and ' : ''}${pr.in ? `buying ${pr.in.name}` : ''}`}
                    className="hit-44"
                    style={{ width: 28, height: 28, flexShrink: 0, background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 4, color: 'var(--mute)', cursor: 'pointer' }}
                  >×</button>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0' }}>
              {onOpenMarket ? (
                <button type="button" onClick={() => onOpenMarket(null)}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 'var(--fs-micro)', fontFamily: 'Archivo, sans-serif' }}>
                  Browse full market ›
                </button>
              ) : <span />}
              <button type="button" onClick={onClear} disabled={busy}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--mute)', fontSize: 'var(--fs-micro)', fontFamily: 'Archivo, sans-serif' }}>
                Clear all
              </button>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            aria-expanded={open}
            data-testid="transfer-review-toggle"
            style={{ flex: 1, minWidth: 0, minHeight: 44, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--paper)', whiteSpace: 'nowrap' }}>
              Pending transfers · <span data-testid="transfer-review-count">{pairs.length}</span> {open ? '▾' : '▴'}
            </div>
            <div data-testid="transfer-review-money" style={{ fontSize: 'var(--fs-micro)', color: over ? 'var(--danger)' : 'var(--mute)', marginTop: 2 }}>
              {over ? `${money(-moneyLeft)} over budget` : `${money(moneyLeft)} left`}
              {needsPick ? ' · pick replacements' : ''}
            </div>
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || over}
            data-testid="transfer-review-confirm"
            className="transition-all active:scale-95 disabled:opacity-40"
            style={{ padding: '12px 16px', minHeight: 44, background: 'var(--gold)', color: '#0A0A0A', border: '1px solid var(--gold)', borderRadius: 6, fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)', cursor: 'pointer', flexShrink: 0 }}
          >
            {busy ? 'Confirming…' : 'Confirm transfers'}
          </button>
        </div>
      </div>
    </div>
  );
}
