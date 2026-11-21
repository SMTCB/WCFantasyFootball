// "Review changes" bar on the My team tab (S31, MD-12). Shows how many changes are
// pending in the transfer basket and the money left once they go through. It sits around
// the pitch (fixed above the mobile nav), never on it. Expanding it lists each change as
// OUT → IN with a remove button; "Confirm transfers" hands the basket back to the host.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { pairBasket } from '../../lib/transferBasket';

const money = (n) => `€${Number(n).toFixed(1)}M`;

export default function TransferReviewBar({ basket, moneyLeft, busy, isMobile, onConfirm, onRemove, onClear, onOpenMarket }) {
  const [open, setOpen] = useState(false);
  if (!basket.length) return null;

  const pairs = pairBasket(basket);
  const count = pairs.length;
  const over = moneyLeft < 0;

  return createPortal(
    <div
      data-testid="transfer-review-bar"
      style={{
        position: 'fixed', left: 0, right: 0, zIndex: 49,
        bottom: isMobile ? 'calc(64px + env(safe-area-inset-bottom))' : 0,
        background: 'var(--card)', borderTop: '2px solid var(--accent)',
        boxShadow: '0 -6px 24px rgba(0,0,0,0.10)',
        paddingBottom: isMobile ? 0 : 'env(safe-area-inset-bottom)',
      }}
    >
      <div className="max-w-2xl mx-auto" style={{ padding: '10px 16px' }}>
        {open && (
          <div data-testid="transfer-review-list" style={{ maxHeight: '40vh', overflowY: 'auto', marginBottom: 10, borderBottom: '1px solid var(--rule)' }}>
            {pairs.map((pr) => {
              const key = `${pr.out?.id ?? 'x'}-${pr.in?.id ?? 'x'}`;
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: '1px solid var(--rule)' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-label)', lineHeight: 1.35 }}>
                    {pr.out && (
                      <div style={{ color: 'var(--danger)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        OUT {pr.out.name} <span style={{ color: 'var(--mute)' }}>{money(pr.out.price)}</span>
                      </div>
                    )}
                    {pr.in ? (
                      <div style={{ color: 'var(--accent)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        IN {pr.in.name} <span style={{ color: 'var(--mute)' }}>{money(pr.in.price)}</span>
                      </div>
                    ) : (
                      <button type="button" onClick={() => onOpenMarket(pr.out?.position ?? null)}
                        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 'var(--fs-label)' }}>
                        Pick a {pr.out?.position} ›
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove([pr.out?.id, pr.in?.id].filter(Boolean))}
                    disabled={busy}
                    aria-label={`Undo ${pr.out ? `selling ${pr.out.name}` : ''}${pr.out && pr.in ? ' and ' : ''}${pr.in ? `buying ${pr.in.name}` : ''}`}
                    className="hit-44"
                    style={{ width: 28, height: 28, flexShrink: 0, background: 'var(--elev)', border: '1px solid var(--rule)', color: 'var(--mute)', cursor: 'pointer' }}
                  >×</button>
                </div>
              );
            })}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
              <button type="button" onClick={() => onOpenMarket(null)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 'var(--fs-micro)', fontFamily: 'Archivo, sans-serif' }}>
                Browse full market ›
              </button>
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
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--paper)' }}>
              Review changes · <span data-testid="transfer-review-count">{count}</span> {open ? '▾' : '▴'}
            </div>
            <div data-testid="transfer-review-money" style={{ fontSize: 'var(--fs-micro)', color: over ? 'var(--danger)' : 'var(--mute)', marginTop: 2 }}>
              {over ? `${money(-moneyLeft)} over budget` : `${money(moneyLeft)} left`}
              {pairs.some(p => !p.in) ? ' · pick replacements' : ''}
            </div>
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || over}
            data-testid="transfer-review-confirm"
            className="transition-all active:scale-95 disabled:opacity-40"
            style={{ padding: '12px 16px', minHeight: 44, background: 'var(--gold)', color: '#0A0A0A', border: '1px solid var(--gold)', borderRadius: 2, fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)', cursor: 'pointer', flexShrink: 0 }}
          >
            {busy ? 'Confirming…' : 'Confirm transfers'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
