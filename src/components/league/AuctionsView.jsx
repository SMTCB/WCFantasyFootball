import AuctionCard from '../AuctionCard';
import { MONO, DISPLAY } from './HubShared';

export default function AuctionsView({ auctions, auctionsLoading, name, mySquadId, placeBid, cancelListing, sellNow, onToast }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--ink)' }}>
      <div style={{ padding: '20px 28px', borderBottom: '1px solid var(--rule)', background: 'var(--ink-2)', display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', flexShrink: 0 }}>
        <div style={{ borderRight: '1px solid var(--rule)', paddingRight: 24 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--gold)', letterSpacing: '.22em' }}>AUCTION HOUSE · {name.toUpperCase()}</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 24, marginTop: 6 }}>Open bids. No two managers own the same player.</div>
        </div>
        {[
          { k: 'LIVE',   v: auctions.filter(a => a.status === 'active').length, tone: 'var(--danger)' },
          { k: 'LISTED', v: auctions.length,                                    tone: 'var(--gold)'   },
          { k: 'STATUS', v: auctionsLoading ? '…' : 'LIVE',                    tone: 'var(--cyan)'   },
        ].map((c, i) => (
          <div key={c.k} style={{ padding: '0 22px', borderRight: i < 2 ? '1px solid var(--rule)' : 'none' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>{c.k}</div>
            <div style={{ fontFamily: DISPLAY, fontSize: 28, color: c.tone, marginTop: 6, letterSpacing: '-0.02em' }}>{c.v}</div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '0 0 80px' }}>
        {auctionsLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 28px' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.2em' }}>SYNCING AUCTIONS…</div>
          </div>
        )}
        {!auctionsLoading && auctions.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 28px', gap: 12 }}>
            <div style={{ fontSize: 28 }}>🔨</div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.2em' }}>NO ACTIVE AUCTIONS</div>
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', opacity: 0.6, maxWidth: 320, textAlign: 'center' }}>
              List a player for auction from your Squad screen to start bidding.
            </div>
          </div>
        )}
        {auctions.map(auction => (
          <AuctionCard
            key={auction.id}
            auction={auction}
            mySquadId={mySquadId}
            onBid={async (id, amount) => { const res = await placeBid(id, amount); if (res.ok) onToast('Bid placed!', 'success'); return res; }}
            onCancel={async (id) => { const res = await cancelListing(id); if (res.ok) onToast('Listing cancelled.', 'info'); return res; }}
            onSellNow={async (id) => { const res = await sellNow(id); if (res.ok) onToast('Player sold!', 'success'); return res; }}
          />
        ))}
      </div>
    </div>
  );
}
