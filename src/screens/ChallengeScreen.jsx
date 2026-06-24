import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../hooks/useAuth';
import { useChallenges } from '../hooks/useChallenges';
import { useWallet } from '../hooks/useWallet';

const MONO    = 'JetBrains Mono, monospace';
const DISPLAY = 'var(--font-display, "Editorial New", serif)';

const TABS = ['INCOMING', 'SENT', 'ACTIVE', 'HISTORY'];

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function timeUntil(dateStr) {
  const diff = Math.floor((new Date(dateStr) - Date.now()) / 1000);
  if (diff <= 0) return 'expired';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m left`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h left`;
  return `${Math.floor(diff / 86400)}d left`;
}

function gwLabel(matchdayId) {
  if (!matchdayId) return '—';
  const parts = matchdayId.split('-r');
  return parts.length === 2 ? `GW${parts[1]}` : matchdayId;
}

// ── Challenge card
function ChallengeCard({ challenge, userId, onAccept, onDecline, onCancel, actionLoading }) {
  const isChallenger = challenge.challenger_id === userId;
  const isPending    = challenge.status === 'pending';
  const isAccepted   = challenge.status === 'accepted';

  const statusColor = {
    pending:   'var(--accent)',
    accepted:  'var(--positive)',
    declined:  'var(--mute)',
    cancelled: 'var(--mute)',
    expired:   'var(--mute)',
    resolved:  challenge.winner_id === userId ? 'var(--positive)' : 'var(--danger)',
  }[challenge.status] ?? 'var(--mute)';

  const statusLabel = {
    pending:   'PENDING',
    accepted:  'ACTIVE',
    declined:  'DECLINED',
    cancelled: 'CANCELLED',
    expired:   'EXPIRED',
    resolved:  challenge.winner_id === userId ? 'YOU WON' : 'YOU LOST',
  }[challenge.status] ?? challenge.status.toUpperCase();

  return (
    <div style={{
      background: 'var(--shell)',
      border: '1px solid var(--rule)',
      borderRadius: 12,
      padding: '16px',
      marginBottom: 10,
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.15em', marginBottom: 3 }}>
            {gwLabel(challenge.matchday_id)} · GW TOTAL
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--paper)' }}>
            {isChallenger
              ? `You vs ${challenge.opponent_username ?? 'Opponent'}`
              : `${challenge.challenger_username ?? 'Challenger'} vs You`}
          </div>
        </div>
        <div style={{
          fontFamily: MONO,
          fontSize: 10,
          color: statusColor,
          letterSpacing: '.1em',
          padding: '3px 8px',
          border: `1px solid ${statusColor}`,
          borderRadius: 6,
          flexShrink: 0,
        }}>
          {statusLabel}
        </div>
      </div>

      {/* Stake */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 10, alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', marginBottom: 2 }}>STAKE</div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
            {challenge.stake_coins.toLocaleString()}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>COINS</div>
        </div>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', marginBottom: 2 }}>PRIZE POOL</div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: 'var(--paper)' }}>
            {Math.floor(challenge.stake_coins * 2 * 0.95).toLocaleString()}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>AFTER 5% RAKE</div>
        </div>
      </div>

      {/* Message */}
      {challenge.message && (
        <div style={{
          fontFamily: MONO, fontSize: 11, color: 'var(--mute)',
          padding: '8px 10px', background: 'var(--elev)',
          borderRadius: 6, marginBottom: 10,
          fontStyle: 'italic',
        }}>
          &ldquo;{challenge.message}&rdquo;
        </div>
      )}

      {/* Expiry / timing */}
      {isPending && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', marginBottom: 10 }}>
          {timeUntil(challenge.expires_at)} · sent {timeAgo(challenge.created_at)}
        </div>
      )}

      {/* Action buttons */}
      {isPending && !isChallenger && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={() => onAccept(challenge.id)}
            disabled={actionLoading}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              background: 'var(--positive)', border: 'none',
              fontFamily: MONO, fontSize: 11, fontWeight: 700,
              color: '#000', cursor: actionLoading ? 'not-allowed' : 'pointer',
              opacity: actionLoading ? 0.6 : 1,
            }}
          >
            ACCEPT
          </button>
          <button
            onClick={() => onDecline(challenge.id)}
            disabled={actionLoading}
            style={{
              flex: 1, padding: '10px', borderRadius: 8,
              background: 'var(--elev)', border: '1px solid var(--rule)',
              fontFamily: MONO, fontSize: 11, fontWeight: 700,
              color: 'var(--mute)', cursor: actionLoading ? 'not-allowed' : 'pointer',
              opacity: actionLoading ? 0.6 : 1,
            }}
          >
            DECLINE
          </button>
        </div>
      )}

      {isPending && isChallenger && (
        <button
          onClick={() => onCancel(challenge.id)}
          disabled={actionLoading}
          style={{
            width: '100%', padding: '9px', borderRadius: 8,
            background: 'transparent', border: '1px solid var(--rule)',
            fontFamily: MONO, fontSize: 11, color: 'var(--mute)',
            cursor: actionLoading ? 'not-allowed' : 'pointer',
            opacity: actionLoading ? 0.6 : 1,
          }}
        >
          CANCEL CHALLENGE
        </button>
      )}

      {isAccepted && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--positive)', textAlign: 'center', marginTop: 4 }}>
          Resolves automatically when GW{gwLabel(challenge.matchday_id).replace('GW', '')} settles
        </div>
      )}
    </div>
  );
}

// ── Create challenge modal
function CreateChallengeModal({ onClose, onCreate, wallet, leagueId, leagueMatchdayId }) {
  const [opponentId, setOpponentId]     = useState('');
  const [matchdayId, setMatchdayId]     = useState(leagueMatchdayId ?? '');
  const [stakeCoins, setStakeCoins]     = useState(100);
  const [message, setMessage]           = useState('');
  const [submitting, setSubmitting]     = useState(false);
  const [error, setError]               = useState(null);

  const balance = wallet?.balance ?? 0;
  const prizePool = Math.floor(stakeCoins * 2 * 0.95);
  const overBudget = stakeCoins > balance;

  async function handleSubmit() {
    if (!opponentId.trim()) { setError('Enter opponent user ID'); return; }
    if (!matchdayId.trim()) { setError('Enter matchday ID'); return; }
    if (stakeCoins < 10)    { setError('Minimum stake is 10 coins'); return; }
    if (overBudget)         { setError('Insufficient balance'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ leagueId, opponentId, matchdayId, stakeCoins, message: message || null });
      onClose();
    } catch (e) {
      const friendly = {
        DAILY_STAKE_CAP_EXCEEDED: 'Daily stake limit reached (1,000 coins / 24h)',
        DUPLICATE_CHALLENGE:      'A challenge already exists between you two for this GW',
        OPPONENT_NOT_MEMBER:      'That user is not a member of this league',
        INSUFFICIENT_BALANCE:     'Insufficient coins',
      }[e.message] ?? e.message;
      setError(friendly);
    }
    setSubmitting(false);
  }

  const modal = (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: -1 }} />
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'var(--shell)',
        border: '1px solid var(--rule)',
        borderTopLeftRadius: 16, borderTopRightRadius: 16,
        padding: '24px 20px 40px',
      }}>
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.18em', marginBottom: 4 }}>
          NEW CHALLENGE
        </div>
        <h2 style={{ fontFamily: DISPLAY, fontSize: 20, color: 'var(--paper)', margin: '0 0 20px' }}>
          Send a GW Total Bet
        </h2>

        {/* Opponent ID */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', display: 'block', marginBottom: 4 }}>
            OPPONENT USER ID
          </label>
          <input
            value={opponentId}
            onChange={e => setOpponentId(e.target.value)}
            placeholder="paste user id…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--elev)', border: '1px solid var(--rule)',
              color: 'var(--paper)', fontFamily: MONO, fontSize: 12,
            }}
          />
        </div>

        {/* Matchday */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', display: 'block', marginBottom: 4 }}>
            GAMEWEEK (matchday ID)
          </label>
          <input
            value={matchdayId}
            onChange={e => setMatchdayId(e.target.value)}
            placeholder="e.g. 429-r3"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--elev)', border: '1px solid var(--rule)',
              color: 'var(--paper)', fontFamily: MONO, fontSize: 12,
            }}
          />
        </div>

        {/* Stake */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', display: 'block', marginBottom: 4 }}>
            STAKE (your balance: {balance.toLocaleString()} coins)
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {[50, 100, 250, 500].map(v => (
              <button
                key={v}
                onClick={() => setStakeCoins(v)}
                style={{
                  flex: 1, padding: '8px 4px', borderRadius: 8,
                  background: stakeCoins === v ? 'var(--accent)' : 'var(--elev)',
                  border: `1px solid ${stakeCoins === v ? 'var(--accent)' : 'var(--rule)'}`,
                  color: stakeCoins === v ? '#000' : 'var(--paper)',
                  fontFamily: MONO, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <input
            type="number"
            min={10}
            max={balance}
            value={stakeCoins}
            onChange={e => setStakeCoins(Math.max(10, parseInt(e.target.value) || 0))}
            style={{
              width: '100%', boxSizing: 'border-box', marginTop: 8,
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--elev)', border: `1px solid ${overBudget ? 'var(--danger)' : 'var(--rule)'}`,
              color: overBudget ? 'var(--danger)' : 'var(--paper)',
              fontFamily: MONO, fontSize: 13,
            }}
          />
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', marginTop: 6 }}>
            Prize pool: <span style={{ color: 'var(--positive)' }}>{prizePool.toLocaleString()}</span> coins after 5% rake
          </div>
        </div>

        {/* Message */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', display: 'block', marginBottom: 4 }}>
            MESSAGE (optional · {140 - message.length} chars)
          </label>
          <input
            maxLength={140}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="trash talk here…"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--elev)', border: '1px solid var(--rule)',
              color: 'var(--paper)', fontFamily: MONO, fontSize: 12,
            }}
          />
        </div>

        {error && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--danger)', marginBottom: 12 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={submitting || overBudget}
          style={{
            width: '100%', padding: '14px',
            borderRadius: 10, border: 'none',
            background: overBudget ? 'var(--ink-3)' : 'var(--accent)',
            color: overBudget ? 'var(--mute)' : '#000',
            fontFamily: MONO, fontSize: 13, fontWeight: 700,
            cursor: (submitting || overBudget) ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'SENDING…' : 'SEND CHALLENGE'}
        </button>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

// ── Main screen
export default function ChallengeScreen() {
  const { user } = useAuth();
  const { wallet } = useWallet(user?.id);
  const {
    incoming, outgoing, active, history,
    loading, createChallenge,
    acceptChallenge, declineChallenge, cancelChallenge,
  } = useChallenges(user?.id);

  const [tab, setTab]               = useState('INCOMING');
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setAction]  = useState(false);
  const [toast, setToast]           = useState(null);

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  async function handleAccept(id) {
    setAction(true);
    try {
      await acceptChallenge(id);
      showToast('Challenge accepted — coins staked!');
    } catch (e) {
      showToast(e.message, true);
    }
    setAction(false);
  }

  async function handleDecline(id) {
    setAction(true);
    try {
      await declineChallenge(id);
      showToast('Challenge declined — challenger refunded.');
    } catch (e) {
      showToast(e.message, true);
    }
    setAction(false);
  }

  async function handleCancel(id) {
    setAction(true);
    try {
      await cancelChallenge(id);
      showToast('Challenge cancelled — coins returned.');
    } catch (e) {
      showToast(e.message, true);
    }
    setAction(false);
  }

  const tabData = {
    INCOMING: incoming,
    SENT:     outgoing,
    ACTIVE:   active,
    HISTORY:  history,
  };
  const currentList = tabData[tab] ?? [];

  return (
    <div style={{ maxWidth: 520, margin: '0 auto', padding: '24px 16px 80px' }}>

      {/* Toast */}
      {toast && createPortal(
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: toast.isError ? 'var(--danger)' : 'var(--positive)',
          color: '#000', padding: '10px 20px', borderRadius: 10,
          fontFamily: MONO, fontSize: 12, fontWeight: 700,
          zIndex: 999, whiteSpace: 'nowrap',
        }}>
          {toast.msg}
        </div>,
        document.body,
      )}

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '.2em', color: 'var(--mute)', marginBottom: 6 }}>
            P2P BETTING
          </div>
          <h1 style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700, color: 'var(--paper)', margin: 0 }}>
            Challenges
          </h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', marginBottom: 2 }}>BALANCE</div>
          <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
            {(wallet?.balance ?? 0).toLocaleString()}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>COINS</div>
        </div>
      </div>

      {/* New challenge button */}
      <button
        onClick={() => setShowCreate(true)}
        style={{
          width: '100%', padding: '14px', borderRadius: 10,
          background: 'var(--accent)', border: 'none',
          fontFamily: MONO, fontSize: 12, fontWeight: 700,
          color: '#000', cursor: 'pointer', marginBottom: 24,
        }}
      >
        + NEW CHALLENGE
      </button>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, overflowX: 'auto' }}>
        {TABS.map(t => {
          const count = tabData[t]?.length ?? 0;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '8px 4px',
                borderRadius: 8,
                background: tab === t ? 'var(--accent)' : 'var(--elev)',
                border: `1px solid ${tab === t ? 'var(--accent)' : 'var(--rule)'}`,
                fontFamily: MONO, fontSize: 9,
                color: tab === t ? '#000' : 'var(--mute)',
                fontWeight: 700, cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t}{count > 0 ? ` (${count})` : ''}
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--mute)', textAlign: 'center', padding: 32 }}>
          Loading…
        </div>
      ) : currentList.length === 0 ? (
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--mute)', textAlign: 'center', padding: 32 }}>
          {tab === 'INCOMING' && 'No pending challenges from other managers.'}
          {tab === 'SENT' && 'You haven\'t sent any challenges.'}
          {tab === 'ACTIVE' && 'No active challenges in progress.'}
          {tab === 'HISTORY' && 'No challenge history yet.'}
        </div>
      ) : (
        currentList.map(c => (
          <ChallengeCard
            key={c.id}
            challenge={c}
            userId={user?.id}
            onAccept={handleAccept}
            onDecline={handleDecline}
            onCancel={handleCancel}
            actionLoading={actionLoading}
          />
        ))
      )}

      {/* Create modal */}
      {showCreate && (
        <CreateChallengeModal
          onClose={() => setShowCreate(false)}
          onCreate={createChallenge}
          wallet={wallet}
          leagueId={null}
          leagueMatchdayId={null}
        />
      )}
    </div>
  );
}
