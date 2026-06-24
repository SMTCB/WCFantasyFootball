import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useWallet } from '../hooks/useWallet';
import { supabase } from '../lib/supabase';

const MONO = 'JetBrains Mono, monospace';

const TYPE_META = {
  purchase:  { label: 'PURCHASE',   color: 'var(--positive)' },
  stake:     { label: 'STAKED',     color: 'var(--mute)' },
  win:       { label: 'WIN',        color: 'var(--positive)' },
  loss:      { label: 'LOSS',       color: 'var(--danger)' },
  rake:      { label: 'RAKE',       color: 'var(--mute)' },
  refund:    { label: 'REFUND',     color: 'var(--positive)' },
  admin:     { label: 'BONUS',      color: 'var(--accent)' },
  entry_fee: { label: 'ENTRY FEE',  color: 'var(--mute)' },
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
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.2em', color: 'var(--mute)', marginBottom: 6 }}>
          COIN WALLET
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: 'var(--paper)', margin: 0 }}>
          Your Balance
        </h1>
      </div>

      {/* Balance card */}
      <div style={{
        background: 'var(--shell)',
        border: '1px solid var(--rule)',
        borderRadius: 12,
        padding: '28px 24px',
        marginBottom: 16,
        textAlign: 'center',
      }}>
        {loading ? (
          <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--mute)' }}>Loading…</div>
        ) : (
          <>
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '.18em', color: 'var(--mute)', marginBottom: 8 }}>
              AVAILABLE
            </div>
            <div style={{ fontSize: 52, fontWeight: 800, color: 'var(--accent)', lineHeight: 1, marginBottom: 4 }}>
              {balance.toLocaleString()}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)' }}>
              COINS
            </div>
            {escrow > 0 && (
              <div style={{ marginTop: 16, padding: '8px 14px', background: 'var(--elev)', borderRadius: 8, display: 'inline-block' }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)' }}>
                  {escrow.toLocaleString()} IN ESCROW (active challenges)
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
        borderRadius: 12,
        padding: '20px 24px',
        marginBottom: 28,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', color: 'var(--mute)', marginBottom: 12 }}>
          BUY COINS
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
                padding: '10px 8px',
                borderRadius: 8,
                border: '1px solid var(--rule)',
                background: 'var(--shell)',
                cursor: buyStatus === 'loading' ? 'wait' : 'pointer',
                opacity: buyStatus === 'loading' ? 0.6 : 1,
              }}
            >
              <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
                {coins.toLocaleString()}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', marginTop: 2 }}>
                {price}
              </div>
            </button>
          ))}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', marginTop: 12, textAlign: 'center' }}>
          {buyStatus === 'coming_soon' && 'PAYMENTS COMING SOON'}
          {buyStatus === 'error' && 'SOMETHING WENT WRONG — TRY AGAIN'}
          {buyStatus === 'loading' && 'CONNECTING…'}
          {!buyStatus && 'PAYMENTS COMING SOON'}
        </div>
      </div>

      {/* Quick link to Challenges */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => navigate('/challenges')}
        onKeyDown={e => e.key === 'Enter' && navigate('/challenges')}
        style={{
          background: 'var(--shell)',
          border: '1px solid var(--rule)',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 28,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}
      >
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', color: 'var(--mute)', marginBottom: 4 }}>
            P2P BETTING
          </div>
          <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--paper)', fontWeight: 600 }}>
            My Challenges
          </div>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 16, color: 'var(--mute)' }}>›</span>
      </div>

      {/* Economy stats — platform health snapshot */}
      {econStats && (
        <div style={{
          background: 'var(--elev)',
          border: '1px solid var(--rule)',
          borderRadius: 12,
          padding: '18px 20px',
          marginBottom: 28,
        }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', color: 'var(--mute)', marginBottom: 14 }}>
            PLATFORM ECONOMY
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
            {[
              { label: 'CIRCULATING', value: Number(econStats.circulating).toLocaleString() },
              { label: 'IN ESCROW',   value: Number(econStats.in_escrow).toLocaleString() },
              { label: 'CHALLENGES',  value: econStats.challenges_total },
              { label: 'RAKE BURNED', value: Number(econStats.rake_burned).toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label}>
                <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 15, fontWeight: 700, color: 'var(--paper)' }}>
                  {value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transaction history */}
      <div>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.18em', color: 'var(--mute)', marginBottom: 14 }}>
          TRANSACTION HISTORY
        </div>

        {loading ? (
          <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--mute)', textAlign: 'center', padding: 24 }}>
            Loading…
          </div>
        ) : transactions.length === 0 ? (
          <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--mute)', textAlign: 'center', padding: 24 }}>
            No transactions yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {transactions.map((tx, i) => {
              const meta = TYPE_META[tx.type] ?? { label: tx.type.toUpperCase(), color: 'var(--mute)' };
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
                    <span style={{ fontFamily: MONO, fontSize: 11, color: meta.color, letterSpacing: '.1em' }}>
                      {meta.label}
                    </span>
                    {tx.meta?.reason && (
                      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)' }}>
                        {tx.meta.reason.replace(/_/g, ' ')}
                      </span>
                    )}
                    <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)' }}>
                      {timeAgo(tx.created_at)}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: MONO,
                    fontSize: 15,
                    fontWeight: 700,
                    color: isCredit ? 'var(--positive)' : 'var(--danger)',
                  }}>
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
