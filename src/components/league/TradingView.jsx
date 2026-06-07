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

// ── Pending confirmation card (won auction awaiting buyer action) ─────────────
function PendingConfirmCard({ listing, myUserId, windowStatus, onConfirm, onToast }) {
  const [busy, setBusy] = useState(false);
  const isWinner    = listing.highest_bidder_id === myUserId;
  const isSeller    = listing.seller_id === myUserId; // unlikely since sellers can't bid, but guard
  const player      = listing.players;
  const posColor    = POS_COLOR[player?.position] ?? 'var(--mute)';
  const windowOpen  = windowStatus === 'open';

  const handleConfirm = async () => {
    setBusy(true);
    const res = await onConfirm(listing.id);
    setBusy(false);
    if (res.ok) {
      onToast(`${player?.name ?? 'Player'} signed for €${Number(listing.current_bid).toFixed(1)}M!`, 'success');
    } else if (res.code === 'SQUAD_FULL') {
      onToast('Your squad is full — sell a player first, then come back to confirm.', 'warning');
    } else if (res.code === 'WINDOW_CLOSED') {
      onToast('Transfer window is closed. Come back when it opens.', 'info');
    } else {
      onToast(res.error ?? 'Confirmation failed.', 'error');
    }
  };

  return (
    <div style={{
      margin: '12px 16px',
      border: isWinner ? '1px solid rgba(255,196,0,0.4)' : '1px solid var(--rule)',
      background: isWinner ? 'rgba(255,196,0,0.04)' : 'var(--ink-2)',
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid var(--rule)',
        display: 'flex', alignItems: 'center', gap: 8,
        background: isWinner ? 'rgba(255,196,0,0.06)' : 'transparent',
      }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: isWinner ? 'var(--gold)' : 'var(--mute)' }}>
          {isWinner ? '🏆 YOU WON' : isSeller ? '⏳ AWAITING BUYER' : '⏳ PENDING'}
        </span>
      </div>

      {/* Player row */}
      <div style={{ padding: '12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 36, height: 36, flexShrink: 0,
          border: `1px solid ${posColor}40`, color: posColor, background: `${posColor}0d`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: MONO, fontSize: 9, fontWeight: 900,
        }}>{player?.position ?? '?'}</div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 14, color: 'var(--paper)' }}>
            {player?.name ?? '—'}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 2, letterSpacing: '.1em' }}>
            {player?.club}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 18, color: 'var(--gold)', lineHeight: 1 }}>
            €{Number(listing.current_bid).toFixed(1)}M
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 2 }}>winning bid</div>
        </div>
      </div>

      {/* Action area — winner only */}
      {isWinner && (
        <div style={{ padding: '0 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {!windowOpen ? (
            <div style={{
              padding: '8px 12px',
              background: 'rgba(120,120,120,0.08)', border: '1px solid var(--rule)',
              fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: 'var(--mute)', lineHeight: 1.6,
            }}>
              ⏳ TRANSFER WINDOW CLOSED — your confirmation will be available when it reopens.
              The purchase will be void if you miss the next window.
            </div>
          ) : (
            <button
              onClick={handleConfirm}
              disabled={busy}
              style={{
                padding: '10px 16px',
                background: busy ? 'rgba(255,196,0,0.1)' : 'var(--gold)',
                color: busy ? 'var(--mute)' : 'var(--ink)',
                border: 'none', cursor: busy ? 'wait' : 'pointer',
                fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', fontWeight: 900,
                opacity: busy ? 0.6 : 1,
              }}
            >
              {busy ? 'CONFIRMING…' : `CONFIRM PURCHASE · €${Number(listing.current_bid).toFixed(1)}M`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Trade proposal row ────────────────────────────────────────────────────────
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
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: isPending ? 10 : 0 }}>
        <div style={{
          flexShrink: 0, width: 36, height: 36,
          border: `1px solid ${posColor}40`, color: posColor, background: `${posColor}0d`,
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
            <span style={{ color: 'var(--paper)' }}>{proposal.proposer_name ?? '?'}</span>
            <span style={{ color: 'var(--mute)' }}> → </span>
            <span style={{ color: 'var(--paper)' }}>{proposal.target_name ?? '?'}</span>
            {(proposal.cash_sweetener !== 0 || proposal.points_sweetener > 0) && ' · '}
            {proposal.cash_sweetener > 0 && <span style={{ color: 'var(--positive)' }}>+€{proposal.cash_sweetener}M </span>}
            {proposal.cash_sweetener < 0 && <span style={{ color: 'var(--danger)' }}>-€{Math.abs(proposal.cash_sweetener)}M </span>}
            {proposal.points_sweetener > 0 && <span style={{ color: 'var(--gold)' }}>+{proposal.points_sweetener}pts</span>}
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

      {isPending && isIncoming && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button disabled={busy} onClick={() => handleAction(onAccept, 'accept')}
            style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', fontWeight: 900, padding: '6px 14px', border: 'none', cursor: busy ? 'wait' : 'pointer', background: 'var(--positive)', color: '#000', opacity: busy ? 0.5 : 1 }}>
            ACCEPT
          </button>
          <button disabled={busy} onClick={() => handleAction(onReject, 'reject')}
            style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', fontWeight: 900, padding: '6px 14px', border: '1px solid var(--rule)', cursor: busy ? 'wait' : 'pointer', background: 'transparent', color: 'var(--mute)', opacity: busy ? 0.5 : 1 }}>
            DECLINE
          </button>
        </div>
      )}
      {isPending && !isIncoming && (
        <button disabled={busy} onClick={() => handleAction(onCancel, 'cancel')}
          style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.14em', fontWeight: 900, padding: '5px 12px', border: '1px solid rgba(239,68,68,0.35)', cursor: busy ? 'wait' : 'pointer', background: 'transparent', color: 'var(--danger)', opacity: busy ? 0.5 : 1 }}>
          CANCEL OFFER
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TradingView({
  // auctions
  auctions, pendingAuctions, closedAuctions, auctionsLoading,
  mySquadId, myUserId, myBudget,
  placeBid, cancelListing, sellNow, confirmWin,
  windowStatus,
  // trades
  incoming, outgoing, history,
  acceptProposal, rejectProposal, cancelProposal,
  // misc
  name, onToast,
}) {
  const [showAuctionHistory, setShowAuctionHistory] = useState(false);
  const [showTradeHistory,   setShowTradeHistory]   = useState(false);
  const [showHelp,           setShowHelp]           = useState(false);

  // Won auctions waiting for my confirmation
  const myPendingWins = (pendingAuctions ?? []).filter(a => a.highest_bidder_id === myUserId);
  const myLiveBids    = (auctions ?? []).filter(a => a.highest_bidder_id === myUserId).length;
  const totalActive   = (auctions?.length ?? 0) + (pendingAuctions?.length ?? 0) + incoming.length + outgoing.length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ink)', overflow: 'hidden' }}>

      {/* ── Help modal ─────────────────────────────────────────────── */}
      {showHelp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
             onClick={() => setShowHelp(false)}>
          <div style={{ background: 'var(--ink-2)', border: '1px solid var(--rule)', maxWidth: 480, width: '100%', padding: 28, position: 'relative' }}
               onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowHelp(false)} style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: 'var(--mute)', fontSize: 18, cursor: 'pointer' }}>✕</button>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--gold)', letterSpacing: '.22em', marginBottom: 16 }}>TRADING FLOOR · HOW IT WORKS</div>

            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--cyan)', letterSpacing: '.14em', marginBottom: 8 }}>🔨 AUCTIONS</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)', lineHeight: 1.6, marginBottom: 16 }}>
              List any player from your squad for auction. A 48-hour bidding window opens — managers bid above the starting price in increments. When the deadline passes the highest bidder is notified. They must <strong style={{ color: 'var(--paper)' }}>CONFIRM PURCHASE</strong> during the next open transfer window to complete the deal. Sellers can hit <strong style={{ color: 'var(--paper)' }}>SELL NOW</strong> at any point to close the auction immediately at the current bid.
            </div>
            <div style={{ height: 1, background: 'var(--rule)', margin: '0 0 16px' }} />

            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--cyan)', letterSpacing: '.14em', marginBottom: 8 }}>⇄ TRADE PROPOSALS</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)', lineHeight: 1.6, marginBottom: 16 }}>
              Click <strong style={{ color: 'var(--paper)' }}>TRADE</strong> on any player in another manager's roster to propose a direct swap. Add a cash sweetener (±€10M budget shift) or a points penalty (you give up ranking points) to balance unequal values. The target manager receives your proposal and can accept or decline. Accepted trades execute immediately.
            </div>
            <div style={{ height: 1, background: 'var(--rule)', margin: '0 0 16px' }} />

            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--cyan)', letterSpacing: '.14em', marginBottom: 8 }}>📊 THE COUNTERS</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--paper)' }}>AUCTIONS</strong> — all live auctions in the league.<br/>
              <strong style={{ color: 'var(--paper)' }}>MY BIDS</strong> — auctions where you currently hold the highest bid.<br/>
              <strong style={{ color: 'var(--paper)' }}>PROPOSALS</strong> — pending trade proposals sent or received by you.<br/>
              History (last 30 days) is shown below each section.
            </div>
          </div>
        </div>
      )}

      {/* ── Hero strip ─────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', flexShrink: 0 }}>
        <div style={{ padding: 'clamp(12px,2vw,20px) clamp(14px,3vw,28px)', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: MONO, fontSize: 'clamp(9px,1.8vw,10px)', color: 'var(--gold)', letterSpacing: '.22em' }}>
            TRADING FLOOR · {name.toUpperCase()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(18px,4vw,24px)' }}>
              Auctions, bids and trade proposals in one place.
            </div>
            <button
              onClick={() => setShowHelp(true)}
              title="How auctions & trades work"
              style={{
                flexShrink: 0, width: 20, height: 20, borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.4)',
                fontFamily: MONO, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                alignSelf: 'center',
              }}
            >?</button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
          {[
            { k: 'AUCTIONS',   v: (auctions?.length ?? 0) + (pendingAuctions?.length ?? 0), tone: 'var(--gold)'   },
            { k: 'MY BIDS',    v: myLiveBids,                                               tone: 'var(--danger)' },
            { k: 'PROPOSALS',  v: incoming.length + outgoing.length,                        tone: 'var(--cyan)'   },
          ].map((c, i) => (
            <div key={c.k} style={{ padding: 'clamp(8px,2vw,14px) clamp(10px,2.5vw,20px)', borderRight: i < 2 ? '1px solid var(--rule)' : 'none' }}>
              <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>{c.k}</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 'clamp(20px,4vw,28px)', color: c.tone, marginTop: 4, letterSpacing: '-0.02em' }}>{c.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>

        {/* ══ CONFIRM YOUR WIN (highest priority) ══ */}
        {myPendingWins.length > 0 && (
          <>
            <SectionHeader label="ACTION REQUIRED" count={myPendingWins.length} tone="var(--gold)" />
            {myPendingWins.map(listing => (
              <PendingConfirmCard
                key={listing.id}
                listing={listing}
                myUserId={myUserId}
                windowStatus={windowStatus}
                onConfirm={confirmWin}
                onToast={onToast}
              />
            ))}
          </>
        )}

        {/* ══ AUCTIONS — active ══ */}
        <SectionHeader label="AUCTIONS" count={auctions?.length ?? 0} tone="var(--gold)" />

        {auctionsLoading && (
          <div style={{ padding: '24px 16px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>
            SYNCING…
          </div>
        )}

        {!auctionsLoading && (auctions?.length ?? 0) === 0 && (pendingAuctions?.length ?? 0) === 0 && (
          <div style={{ padding: '24px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.18em' }}>NO ACTIVE AUCTIONS</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6 }}>
              List a player for auction from your Squad screen to start bidding.
            </div>
          </div>
        )}

        {(auctions ?? []).map(auction => (
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

        {/* Pending confirmation — seller's view (other managers' won auctions, not mine) */}
        {(pendingAuctions ?? []).filter(a => a.highest_bidder_id !== myUserId).map(listing => (
          <PendingConfirmCard
            key={listing.id}
            listing={listing}
            myUserId={myUserId}
            windowStatus={windowStatus}
            onConfirm={confirmWin}
            onToast={onToast}
          />
        ))}

        {/* Closed/cancelled auction history */}
        {(closedAuctions?.length ?? 0) > 0 && (
          <div>
            <button onClick={() => setShowAuctionHistory(v => !v)} style={{
              width: '100%', padding: '10px 16px', background: 'transparent',
              border: 'none', borderTop: '1px solid var(--rule)',
              fontFamily: MONO, fontSize: 9, letterSpacing: '.18em',
              color: 'var(--mute)', cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span>{showAuctionHistory ? '▾' : '▸'}</span>
              RECENT AUCTIONS ({closedAuctions.length})
            </button>
            {showAuctionHistory && closedAuctions.map(a => (
              <div key={a.id} style={{ padding: '10px 16px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 10, opacity: 0.6 }}>
                <div style={{ width: 32, height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 9, fontWeight: 900, color: POS_COLOR[a.players?.position] ?? 'var(--mute)', border: `1px solid ${POS_COLOR[a.players?.position] ?? 'var(--rule)'}40` }}>
                  {a.players?.position ?? '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 12, color: 'var(--paper)' }}>{a.players?.name ?? '—'}</div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.1em', marginTop: 2 }}>{a.players?.club}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '.14em', color: a.status === 'sold' ? 'var(--positive)' : 'var(--mute)' }}>
                    {a.status === 'sold' ? '✓ SOLD' : '— CANCELLED'}
                  </div>
                  {a.current_bid != null && (
                    <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--paper)', marginTop: 2 }}>€{Number(a.current_bid).toFixed(1)}M</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ══ INCOMING TRADE OFFERS ══ */}
        <SectionHeader label="INCOMING OFFERS" count={incoming.length} tone="var(--cyan)" />
        {incoming.length === 0 && (
          <div style={{ padding: '16px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.14em' }}>NO PENDING OFFERS</div>
        )}
        {incoming.map(p => (
          <TradeRow key={p.id} proposal={p} mySquadId={mySquadId}
            onAccept={async (id) => { await acceptProposal(id); onToast('Trade accepted! Squads updated.', 'success'); }}
            onReject={async (id) => { await rejectProposal(id); onToast('Trade declined.', 'info'); }}
            onCancel={cancelProposal}
          />
        ))}

        {/* ══ SENT TRADE OFFERS ══ */}
        <SectionHeader label="SENT OFFERS" count={outgoing.length} tone="var(--mute)" />
        {outgoing.length === 0 && (
          <div style={{ padding: '16px', fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.14em' }}>NO OUTGOING OFFERS</div>
        )}
        {outgoing.map(p => (
          <TradeRow key={p.id} proposal={p} mySquadId={mySquadId}
            onAccept={acceptProposal} onReject={rejectProposal}
            onCancel={async (id) => { await cancelProposal(id); onToast('Offer cancelled.', 'info'); }}
          />
        ))}

        {/* ══ TRADE HISTORY ══ */}
        {history.length > 0 && (
          <div>
            <button onClick={() => setShowTradeHistory(v => !v)} style={{ width: '100%', padding: '10px 16px', background: 'transparent', border: 'none', borderTop: '1px solid var(--rule)', fontFamily: MONO, fontSize: 9, letterSpacing: '.18em', color: 'var(--mute)', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>{showTradeHistory ? '▾' : '▸'}</span>
              RECENT TRADES ({history.length})
            </button>
            {showTradeHistory && history.map(p => (
              <TradeRow key={p.id} proposal={p} mySquadId={mySquadId}
                onAccept={acceptProposal} onReject={rejectProposal} onCancel={cancelProposal} />
            ))}
          </div>
        )}

        {/* Empty state */}
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
