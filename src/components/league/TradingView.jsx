import { useState } from 'react';
import AuctionCard from '../AuctionCard';
import { MONO, DISPLAY } from './HubConstants';

const POS_COLOR = { GK: 'var(--gold)', DEF: 'var(--cyan)', MID: 'var(--positive)', FWD: 'var(--danger)' };

function SectionHeader({ label, count, tone = 'var(--gold)' }) {
  return (
    <div style={{
      padding: '10px 16px 8px',
      borderBottom: '1px solid var(--rule)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ width: 3, alignSelf: 'stretch', background: tone, flexShrink: 0 }} />
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.22em', color: tone }}>{label}</span>
      {count > 0 && (
        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: '.1em',
          background: `${tone}22`, color: tone,
          padding: '1px 7px', borderRadius: 2,
        }}>{count}</span>
      )}
    </div>
  );
}

function TradeRow({ proposal, mySquadId, onAccept, onReject, onCancel }) {
  const [busy, setBusy] = useState(false);
  const isIncoming = proposal.target_squad_id === mySquadId;
  const isPending  = proposal.status === 'pending';

  const statusLabel = {
    pending:   null,
    accepted:  '✓ ACCEPTED',
    rejected:  '✗ DECLINED',
    cancelled: '— CANCELLED',
  }[proposal.status];

  const statusColor = {
    accepted:  'var(--positive)',
    rejected:  'var(--danger)',
    cancelled: 'var(--mute)',
  }[proposal.status];

  const posColor = POS_COLOR[proposal.proposer_player?.position] ?? 'var(--mute)';

  const handleAction = async (fn, label) => {
    setBusy(true);
    try { await fn(proposal.id); }
    catch (e) { console.error(`[TradingView] ${label}:`, e.message); }
    finally { setBusy(false); }
  };

  return (
    <div style={{
      padding: '12px 16px',
      borderBottom: '1px solid var(--rule)',
      background: isIncoming && isPending ? 'rgba(255,196,0,0.03)' : 'transparent',
    }}>
      {/* Direction badge + players */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: isPending ? 10 : 0 }}>
        <div style={{
          flexShrink: 0, width: 36, height: 36,
          border: `1px solid ${posColor}40`, color: posColor,
          background: `${posColor}0d`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: MONO, fontSize: 9, fontWeight: 900,
        }}>
          {isIncoming ? 'IN' : 'OUT'}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 13, color: 'var(--paper)', lineHeight: 1.2 }}>
            {proposal.proposer_player?.name ?? '—'}
            <span style={{ color: 'var(--mute)', fontFamily: MONO, fontSize: 10, fontWeight: 400 }}> ⇄ </span>
            {proposal.target_player?.name ?? '—'}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 3, letterSpacing: '.1em' }}>
            {isIncoming ? 'OFFER RECEIVED' : 'OFFER SENT'}
            {(proposal.cash_sweetener !== 0 || proposal.points_sweetener > 0) && ' · '}
            {proposal.cash_sweetener > 0 && (
              <span style={{ color: 'var(--positive)' }}>+€{proposal.cash_sweetener}M </span>
            )}
            {proposal.cash_sweetener < 0 && (
              <span style={{ color: 'var(--danger)' }}>-€{Math.abs(proposal.cash_sweetener)}M </span>
            )}
            {proposal.points_sweetener > 0 && (
              <span style={{ color: 'var(--gold)' }}>+{proposal.points_sweetener}pts</span>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {statusLabel ? (
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: statusColor }}>{statusLabel}</span>
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em' }}>
              {new Date(proposal.created_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Action buttons — pending only */}
      {isPending && isIncoming && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={busy}
            onClick={() => handleAction(onAccept, 'accept')}
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', fontWeight: 900,
              padding: '6px 14px', border: 'none', cursor: busy ? 'wait' : 'pointer',
              background: 'var(--positive)', color: '#000', opacity: busy ? 0.5 : 1,
            }}
          >ACCEPT</button>
          <button
            disabled={busy}
            onClick={() => handleAction(onReject, 'reject')}
            style={{
              fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', fontWeight: 900,
              padding: '6px 14px', border: '1px solid var(--rule)', cursor: busy ? 'wait' : 'pointer',
              background: 'transparent', color: 'var(--mute)', opacity: busy ? 0.5 : 1,
            }}
          >DECLINE</button>
        </div>
      )}
      {isPending && !isIncoming && (
        <button
          disabled={busy}
          onClick={() => handleAction(onCancel, 'cancel')}
          style={{
            fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', fontWeight: 900,
            padding: '5px 12px',
            border: '1px solid rgba(239,68,68,0.35)', cursor: busy ? 'wait' : 'pointer',
            background: 'transparent', color: 'var(--danger)', opacity: busy ? 0.5 : 1,
          }}
        >CANCEL OFFER</button>
      )}
    </div>
  );
}

export default function TradingView({
  // auctions
  auctions, closedAuctions, auctionsLoading,
  mySquadId, myUserId, myBudget,
  placeBid, cancelListing, sellNow,
  // trades
  incoming, outgoing, history,
  acceptProposal, rejectProposal, cancelProposal,
  // misc
  name, onToast,
}) {
  const [showAuctionHistory, setShowAuctionHistory] = useState(false);
  const [showTradeHistory,   setShowTradeHistory]   = useState(false);

  const totalActive = auctions.length + incoming.length + outgoing.length;
  const myLiveBids  = auctions.filter(a => a.highest_bidder_id === myUserId).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ink)', overflow: 'hidden' }}>

      {/* ── Hero strip ───────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
        <div style={{ padding: 'clamp(12px,2vw,20px) clamp(14px,3vw,28px)', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: MONO, fontSize: 'clamp(9px,1.8vw,10px)', color: 'var(--gold)', letterSpacing: '.22em' }}>
            TRADING FLOOR · {name.toUpperCase()}
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(18px,4vw,24px)', marginTop: 6 }}>
            Auctions, bids and trade proposals in one place.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[
            { k: 'AUCTIONS',  v: auctions.length,                              tone: 'var(--gold)'   },
            { k: 'MY BIDS',   v: myLiveBids,                                   tone: 'var(--danger)' },
            { k: 'PROPOSALS', v: incoming.length + outgoing.length,            tone: 'var(--cyan)'   },
          ].map((c, i) => (
            <div key={c.k} style={{ padding: 'clamp(8px,2vw,14px) clamp(10px,2.5vw,20px)', borderRight: i < 2 ? '1px solid var(--rule)' : 'none' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>{c.k}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(20px,4vw,28px)', color: c.tone, marginTop: 4, letterSpacing: '-0.02em' }}>{c.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>

        {/* ══ AUCTIONS ══ */}
        <SectionHeader label="AUCTIONS" count={auctions.length} tone="var(--gold)" />

        {auctionsLoading && (
          <div style={{ padding: '24px 16px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>
            SYNCING…
          </div>
        )}

        {!auctionsLoading && auctions.length === 0 && (
          <div style={{ padding: '24px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.18em' }}>NO ACTIVE AUCTIONS</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6 }}>
              List a player for auction from your Squad screen to start bidding.
            </div>
          </div>
        )}

        {auctions.map(auction => (
          <AuctionCard
            key={auction.id}
            auction={auction}
            mySquadId={mySquadId}
            myBudget={myBudget}
            onBid={async (id, amount) => { const res = await placeBid(id, amount); if (res.ok) onToast('Bid placed!', 'success'); return res; }}
            onCancel={async (id) => { const res = await cancelListing(id); if (res.ok) onToast('Listing cancelled.', 'info'); return res; }}
            onSellNow={async (id) => { const res = await sellNow(id); if (res.ok) onToast('Player sold!', 'success'); return res; }}
          />
        ))}

        {/* Closed/cancelled auction history */}
        {closedAuctions.length > 0 && (
          <div>
            <button
              onClick={() => setShowAuctionHistory(v => !v)}
              style={{
                width: '100%', padding: '10px 16px', background: 'transparent',
                border: 'none', borderTop: '1px solid var(--rule)',
                fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
                color: 'var(--mute)', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span>{showAuctionHistory ? '▾' : '▸'}</span>
              RECENT AUCTIONS ({closedAuctions.length})
            </button>
            {showAuctionHistory && closedAuctions.map(a => (
              <div key={a.id} style={{
                padding: '10px 16px', borderBottom: '1px solid var(--rule)',
                display: 'flex', alignItems: 'center', gap: 10, opacity: 0.6,
              }}>
                <div style={{
                  width: 32, height: 32, flexShrink: 0, display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontFamily: MONO, fontSize: 9, fontWeight: 900,
                  color: POS_COLOR[a.players?.position] ?? 'var(--mute)',
                  border: `1px solid ${POS_COLOR[a.players?.position] ?? 'var(--rule)'}40`,
                }}>
                  {a.players?.position ?? '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 12, color: 'var(--paper)' }}>
                    {a.players?.name ?? '—'}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em', marginTop: 2 }}>
                    {a.players?.club}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: a.status === 'closed' ? 'var(--positive)' : 'var(--mute)' }}>
                    {a.status === 'closed' ? '✓ SOLD' : '— CANCELLED'}
                  </div>
                  {a.current_bid != null && (
                    <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--paper)', marginTop: 2 }}>
                      €{Number(a.current_bid).toFixed(1)}M
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ INCOMING TRADE OFFERS ══ */}
        <SectionHeader label="INCOMING OFFERS" count={incoming.length} tone="var(--cyan)" />

        {incoming.length === 0 && (
          <div style={{ padding: '16px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.14em' }}>
            NO PENDING OFFERS
          </div>
        )}
        {incoming.map(p => (
          <TradeRow
            key={p.id}
            proposal={p}
            mySquadId={mySquadId}
            onAccept={async (id) => { await acceptProposal(id); onToast('Trade accepted! Squads updated.', 'success'); }}
            onReject={async (id) => { await rejectProposal(id); onToast('Trade declined.', 'info'); }}
            onCancel={cancelProposal}
          />
        ))}

        {/* ══ SENT TRADE OFFERS ══ */}
        <SectionHeader label="SENT OFFERS" count={outgoing.length} tone="var(--mute)" />

        {outgoing.length === 0 && (
          <div style={{ padding: '16px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.14em' }}>
            NO OUTGOING OFFERS
          </div>
        )}
        {outgoing.map(p => (
          <TradeRow
            key={p.id}
            proposal={p}
            mySquadId={mySquadId}
            onAccept={acceptProposal}
            onReject={rejectProposal}
            onCancel={async (id) => { await cancelProposal(id); onToast('Offer cancelled.', 'info'); }}
          />
        ))}

        {/* ══ TRADE HISTORY ══ */}
        {history.length > 0 && (
          <div>
            <button
              onClick={() => setShowTradeHistory(v => !v)}
              style={{
                width: '100%', padding: '10px 16px', background: 'transparent',
                border: 'none', borderTop: '1px solid var(--rule)',
                fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
                color: 'var(--mute)', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <span>{showTradeHistory ? '▾' : '▸'}</span>
              RECENT TRADES ({history.length})
            </button>
            {showTradeHistory && history.map(p => (
              <TradeRow
                key={p.id}
                proposal={p}
                mySquadId={mySquadId}
                onAccept={acceptProposal}
                onReject={rejectProposal}
                onCancel={cancelProposal}
              />
            ))}
          </div>
        )}

        {/* Empty state — nothing at all */}
        {totalActive === 0 && !auctionsLoading && (
          <div style={{ padding: '40px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 28 }}>🤝</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.2em' }}>NO ACTIVITY YET</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6, maxWidth: 300, textAlign: 'center' }}>
              List a player for auction from your Squad screen, or propose a trade from the league leaderboard.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
