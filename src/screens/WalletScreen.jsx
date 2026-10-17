import { LoadingRows } from '../components/Skeleton';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWallet } from '../hooks/useWallet';
import { supabase } from '../lib/supabase';

const HEAD = { fontFamily: 'Archivo Black, sans-serif', letterSpacing: '-0.02em' };

const TYPE_META = {
  purchase:  { label: 'Purchase',   color: 'var(--pos)' },
  stake:     { label: 'Staked',     color: 'var(--mute)' },
  win:       { label: 'Win',        color: 'var(--pos)' },
  loss:      { label: 'Loss',       color: 'var(--neg)' },
  rake:      { label: 'Rake',       color: 'var(--mute)' },
  refund:    { label: 'Refund',     color: 'var(--pos)' },
  admin:     { label: 'Bonus',      color: 'var(--accent)' },
  entry_fee: { label: 'Entry fee',  color: 'var(--mute)' },
};

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function WalletScreen() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { wallet, loading } = useWallet(user?.id);
  const [buyStatus, setBuyStatus] = useState(null); // null | 'loading' | 'coming_soon' | 'error'
  const [econStats, setEconStats] = useState(null);

  const balance      = wallet?.balance      ?? 0;
  const escrow       = wallet?.escrow       ?? 0;
  const transactions = wallet?.transactions ?? [];

  useEffect(() => {
    supabase.rpc('get_coin_economy_stats').then(({ data }) => {
      if (data) setEconStats(data);
    });
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '24px 16px 48px' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 6 }}>
          Coin wallet
        </div>
        <h1 style={{ ...HEAD, fontSize: 'var(--fs-title)', color: 'var(--paper)', margin: 0 }}>
          Your balance
        </h1>
      </div>

      {/* Balance card */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius)',
        padding: '28px 24px',
        marginBottom: 16,
        textAlign: 'center',
      }}>
        {loading ? (
          <LoadingRows rows={3} />
        ) : (
          <>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 8 }}>
              Available
            </div>
            <div className="num" style={{ ...HEAD, fontSize: 'var(--fs-display)', color: 'var(--accent)', lineHeight: 1, marginBottom: 4 }}>
              {balance.toLocaleString()}
            </div>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
              Coins
            </div>
            {escrow > 0 && (
              <div style={{ marginTop: 16, padding: '8px 14px', background: 'var(--elev)', borderRadius: 'var(--radius)', display: 'inline-block' }}>
                <span style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
                  {escrow.toLocaleString()} in escrow (active challenges)
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Buy coins — Stripe-ready (returns 503 until keys are configured) */}
      <div style={{
        background: 'var(--elev)',
        border: '1px solid var(--rule)',
        borderRadius: 'var(--radius)',
        padding: '20px 24px',
        marginBottom: 28,
      }}>
        <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 12 }}>
          Buy coins
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[
            { coins: 500,  price: '£1.99' },
            { coins: 1500, price: '£4.99' },
            { coins: 5000, price: '£12.99' },
          ].map(({ coins, price }) => (
            <button
              key={coins}
              disabled={buyStatus === 'loading'}
              onClick={async () => {
                setBuyStatus('loading');
                try {
                  const { error } = await supabase.functions.invoke('purchase-coins/create-payment-intent', {
                    body: { pack_coins: coins },
                  });
                  // 503 means Stripe not yet configured — expected for now
                  if (error?.context?.status === 503 || error?.message?.includes('STRIPE_NOT_CONFIGURED')) {
                    setBuyStatus('coming_soon');
                  } else if (error) {
                    setBuyStatus('error');
                  }
                  // When Stripe IS configured: handle client_secret here with Stripe.js
                } catch {
                  setBuyStatus('coming_soon');
                }
                setTimeout(() => setBuyStatus(null), 3000);
              }}
              style={{
                flex: 1,
                minWidth: 90,
                minHeight: 'var(--tap)', padding: '10px 8px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--rule)',
                background: 'var(--card)',
                cursor: buyStatus === 'loading' ? 'wait' : 'pointer',
                opacity: buyStatus === 'loading' ? 0.6 : 1,
              }}
            >
              <div className="num" style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--accent)' }}>
                {coins.toLocaleString()}
              </div>
              <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2 }}>
                {price}
              </div>
            </button>
          ))}
        </div>
        <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 12, textAlign: 'center' }}>
          {buyStatus === 'coming_soon' && 'Payments coming soon'}
          {buyStatus === 'error' && 'Something went wrong — try again'}
          {buyStatus === 'loading' && 'Connecting…'}
          {!buyStatus && 'Payments coming soon'}
        </div>
      </div>

      {/* Quick link to Challenges */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate('/challenges')}
        onKeyDown={e => e.key === 'Enter' && navigate('/challenges')}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          minHeight: 'var(--tap)', padding: '16px 20px',
          marginBottom: 28,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <div>
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 4 }}>
            P2P betting
          </div>
          <div style={{ fontSize: 'var(--fs-body)', color: 'var(--paper)', fontWeight: 600 }}>
            My challenges
          </div>
        </div>
        <span style={{ fontSize: 'var(--fs-body-lg)', color: 'var(--mute)' }}>›</span>
      </div>

      {/* Economy stats — platform health snapshot */}
      {econStats && (
        <div style={{
          background: 'var(--elev)',
          border: '1px solid var(--rule)',
          borderRadius: 'var(--radius)',
          padding: '18px 20px',
          marginBottom: 28,
        }}>
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 14 }}>
            Platform economy
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
            {[
              { label: 'Circulating', value: Number(econStats.circulating).toLocaleString() },
              { label: 'In escrow',   value: Number(econStats.in_escrow).toLocaleString() },
              { label: 'Challenges',  value: econStats.challenges_total },
              { label: 'Rake burned', value: Number(econStats.rake_burned).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 2 }}>
                  {label}
                </div>
                <div className="num" style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--paper)' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div>
        <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 14 }}>
          Transaction history
        </div>

        {loading ? (
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', textAlign: 'center', padding: 24 }}>
            Loading…
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', textAlign: 'center', padding: 24 }}>
            No transactions yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {transactions.map((tx, i) => {
              const meta = TYPE_META[tx.type] ?? { label: tx.type, color: 'var(--mute)' };
              const isCredit = ['purchase', 'win', 'refund', 'admin'].includes(tx.type);
              return (
                <div key={i} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  borderBottom: '1px solid var(--rule)',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 'var(--fs-label)', color: meta.color }}>
                      {meta.label}
                    </span>
                    {tx.meta?.reason && (
                      <span style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
                        {tx.meta.reason.replace(/_/g, ' ')}
                      </span>
                    )}
                    <span style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
                      {timeAgo(tx.created_at)}
                    </span>
                  </div>
                  <span className="num" style={{ fontSize: 'var(--fs-body)', fontWeight: 700, color: isCredit ? 'var(--pos)' : 'var(--neg)' }}>
                    {isCredit ? '+' : '-'}{tx.amount.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
