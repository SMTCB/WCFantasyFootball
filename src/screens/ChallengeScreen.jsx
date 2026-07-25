import { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../hooks/useAuth';
import { useChallenges } from '../hooks/useChallenges';
import { useWallet } from '../hooks/useWallet';
import { useIsMobile } from '../hooks/useViewport';
import { useClubhouseContext } from '../context/ClubhouseContext';
import PrimaryActionBar from '../components/shared/PrimaryActionBar';
import { supabase } from '../lib/supabase';

const MONO = { fontFamily: 'JetBrains Mono, monospace' };
const HEAD = { fontFamily: 'Archivo Black, sans-serif', letterSpacing: '-0.02em' };
const BODY = { fontFamily: 'Archivo, sans-serif' };

// ── Coin icon ─────────────────────────────────────────────────────────────────
function Ci({ size = 'md' }) {
  const dim = { xl: 26, lg: 20, md: 15, sm: 11 }[size] ?? 15;
  const fs  = { xl: 13, lg: 10, md: 7.5, sm: 5.5 }[size] ?? 7.5;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      borderRadius: '50%', background: 'var(--gold)',
      color: '#fff', ...HEAD, boxShadow: 'inset 0 -1px 0 rgba(0,0,0,.2)',
      flexShrink: 0, width: dim, height: dim, fontSize: fs, lineHeight: 1,
    }}>C</span>
  );
}

function CoinAmt({ amount, size = 'md', color }) {
  const fs  = { xl: 34, lg: 20, md: 15, sm: 12 }[size] ?? 15;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size === 'sm' ? 3 : 5 }}>
      <Ci size={size} />
      <span style={{ ...HEAD, color: color ?? 'var(--gold)', fontSize: fs, lineHeight: 1 }}>
        {typeof amount === 'number' ? amount.toLocaleString() : amount}
      </span>
    </span>
  );
}

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

// ── Bet-type identity badge (gold = Competitor, accent = Freeform) ────────────
function TypeBadge({ betType }) {
  const isFree = betType === 'freeform';
  return (
    <span style={{
      background: isFree ? 'var(--abg)' : 'var(--gbg)', color: isFree ? 'var(--accent)' : 'var(--gold)',
      ...MONO, fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 100, flexShrink: 0,
    }}>
      {isFree ? 'Freeform' : 'Competitor'}
    </span>
  );
}

// ── Incoming challenge card (gold border) ─────────────────────────────────────
function IncomingCard({ challenge, onAccept, onDecline, loading }) {
  const netWin = Math.floor(challenge.stake_coins * 2 * 0.95) - challenge.stake_coins;
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid rgba(184,114,14,.3)',
      borderLeft: '3px solid var(--gold)',
      borderRadius: 6,
      padding: '12px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 9,
    }}>
      {/* Opponent + type + timer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ ...HEAD, fontSize: 14, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          {challenge.challenger_username ?? 'Challenger'}
        </span>
        <TypeBadge betType={challenge.bet_type} />
        <span style={{ marginLeft: 'auto', ...MONO, fontSize: 8.5, color: 'var(--gold)', letterSpacing: '.04em' }}>
          ⏱ {timeUntil(challenge.expires_at)}
        </span>
      </div>

      {challenge.bet_type === 'freeform' ? (
        <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600, lineHeight: 1.4 }}>{challenge.question}</div>
      ) : (
        <div style={{ ...MONO, fontSize: 9, color: 'var(--mute)' }}>{gwLabel(challenge.matchday_id)} · GW Total</div>
      )}

      {/* Message */}
      {challenge.message && (
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.45 }}>
          &ldquo;{challenge.message}&rdquo;
        </div>
      )}

      {/* Stake + net win */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <div>
          <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 4 }}>Stake each</div>
          <CoinAmt amount={challenge.stake_coins} size="sm" />
        </div>
        <div>
          <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 4 }}>Net win</div>
          <CoinAmt amount={netWin} size="sm" color="var(--pos)" />
        </div>
      </div>

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onAccept(challenge.id)}
          disabled={loading}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer',
            background: 'transparent', border: '1.5px solid var(--gold)',
            ...MONO, fontSize: 8.5, letterSpacing: '.14em', textTransform: 'uppercase',
            fontWeight: 600, color: 'var(--gold)', opacity: loading ? 0.6 : 1,
          }}
        >Accept</button>
        <button
          onClick={() => onDecline(challenge.id)}
          disabled={loading}
          style={{
            flex: 1, padding: '8px 0', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer',
            background: 'transparent', border: '1px solid var(--rule)',
            ...MONO, fontSize: 8.5, letterSpacing: '.14em', textTransform: 'uppercase',
            fontWeight: 500, color: 'var(--text2)', opacity: loading ? 0.6 : 1,
          }}
        >Decline</button>
      </div>
    </div>
  );
}

// ── Sent / outgoing card (accent border) ──────────────────────────────────────
function OutgoingCard({ challenge, onCancel, loading }) {
  const netWin = Math.floor(challenge.stake_coins * 2 * 0.95) - challenge.stake_coins;
  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--rule)',
      borderLeft: '3px solid var(--accent)',
      borderRadius: 6,
      padding: '11px 13px',
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
        <span style={{ ...HEAD, fontSize: 14, color: 'var(--text)', letterSpacing: '-0.01em' }}>
          → {challenge.opponent_username ?? 'Opponent'}
        </span>
        <TypeBadge betType={challenge.bet_type} />
        <span style={{ marginLeft: 'auto', ...MONO, fontSize: 8, color: 'var(--mute)' }}>
          Awaiting · {timeUntil(challenge.expires_at)}
        </span>
      </div>
      {challenge.bet_type === 'freeform' && (
        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, lineHeight: 1.4 }}>{challenge.question}</div>
      )}
      {challenge.message && (
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.45 }}>{challenge.message}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
        <CoinAmt amount={challenge.stake_coins} size="sm" />
        <span style={{ ...MONO, fontSize: 8, color: 'var(--mute)' }}>staked · net win: </span>
        <CoinAmt amount={netWin} size="sm" color="var(--pos)" />
      </div>
      <button
        onClick={() => onCancel(challenge.id)}
        disabled={loading}
        style={{
          padding: '8px', borderRadius: 6, border: '1px solid var(--rule)',
          background: 'transparent', ...MONO, fontSize: 8, color: 'var(--mute)',
          cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
        }}
      >Cancel</button>
    </div>
  );
}

// ── Live / active card (green border + score display, or freeform lifecycle) ──
function LiveCard({ challenge, userId, onDeclare, onConfirm, onDispute, loading }) {
  if (challenge.bet_type === 'freeform') {
    return <FreeformLiveCard challenge={challenge} userId={userId} onDeclare={onDeclare} onConfirm={onConfirm} onDispute={onDispute} loading={loading} />;
  }

  const myPts   = challenge.challenger_id === userId ? challenge.challenger_pts : challenge.opponent_pts;
  const oppPts  = challenge.challenger_id === userId ? challenge.opponent_pts : challenge.challenger_pts;
  const oppName = challenge.challenger_id === userId ? challenge.opponent_username : challenge.challenger_username;
  const diff    = (myPts ?? 0) - (oppPts ?? 0);

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid rgba(22,101,52,.28)',
      borderLeft: '3px solid var(--pos)',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid var(--rule)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--pos)', flexShrink: 0 }} />
        <span style={{ flex: 1, ...MONO, fontSize: 8.5, color: 'var(--mute)', letterSpacing: '.04em' }}>
          vs {oppName ?? 'Opponent'} · {gwLabel(challenge.matchday_id)}
        </span>
        <CoinAmt amount={challenge.stake_coins} size="sm" />
      </div>

      {/* Score display */}
      <div style={{ display: 'flex' }}>
        <div style={{
          flex: 1, padding: '12px 10px', textAlign: 'center',
          background: diff > 0 ? 'var(--pbg)' : 'transparent',
        }}>
          <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '.12em', textTransform: 'uppercase', color: diff > 0 ? 'var(--pos)' : 'var(--mute)', marginBottom: 4 }}>
            {diff > 0 ? 'You (leading)' : 'You'}
          </div>
          <div style={{ ...HEAD, fontSize: 34, letterSpacing: '-0.03em', lineHeight: 1, color: diff > 0 ? 'var(--pos)' : 'var(--text)' }}>
            {myPts ?? '—'}
          </div>
          <div style={{ ...MONO, fontSize: 7, color: diff > 0 ? 'var(--pos)' : 'var(--mute)', marginTop: 2 }}>pts</div>
        </div>
        <div style={{ width: 1, background: 'var(--rule)', alignSelf: 'stretch' }} />
        <div style={{ flex: 1, padding: '12px 10px', textAlign: 'center' }}>
          <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '.12em', textTransform: 'uppercase', color: diff < 0 ? 'var(--neg)' : 'var(--mute)', marginBottom: 4 }}>
            {oppName}
          </div>
          <div style={{ ...HEAD, fontSize: 34, letterSpacing: '-0.03em', lineHeight: 1, color: diff < 0 ? 'var(--neg)' : 'var(--text)' }}>
            {oppPts ?? '—'}
          </div>
          <div style={{ ...MONO, fontSize: 7, color: 'var(--mute)', marginTop: 2 }}>pts</div>
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 13px', background: 'var(--elev)', borderTop: '1px solid var(--rule)',
        ...MONO, fontSize: 8.5,
      }}>
        <span style={{ color: diff > 0 ? 'var(--pos)' : diff < 0 ? 'var(--neg)' : 'var(--mute)', letterSpacing: '.04em' }}>
          {diff > 0 ? `↑ +${diff} lead` : diff < 0 ? `↓ ${diff} behind` : 'Level'}
        </span>
        <span style={{ color: 'var(--mute)' }}>{gwLabel(challenge.matchday_id)} running</span>
      </div>
    </div>
  );
}

// ── Freeform lifecycle card: live → your-move/awaiting → pending arbitration ──
function FreeformLiveCard({ challenge, userId, onDeclare, onConfirm, onDispute, loading }) {
  const oppName = challenge.challenger_id === userId ? challenge.opponent_username : challenge.challenger_username;
  const isProposer = challenge.proposed_by === userId;
  const proposerName = challenge.proposed_by === challenge.challenger_id ? challenge.challenger_username : challenge.opponent_username;
  const winnerLabel = challenge.proposed_winner_id == null
    ? 'a push (no winner)'
    : challenge.proposed_winner_id === userId ? 'you' : (challenge.proposed_winner_username ?? oppName);

  if (challenge.status === 'disputed') {
    return (
      <div style={{
        background: 'var(--elev)', border: '1.5px dashed var(--mute)', borderRadius: 6,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <TypeBadge betType="freeform" />
          <span style={{ ...MONO, fontSize: 8, color: 'var(--mute)' }}>vs {oppName ?? 'Opponent'}</span>
        </div>
        <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600, lineHeight: 1.4 }}>{challenge.question}</div>
        <div style={{ ...MONO, fontSize: 10, color: 'var(--mute)', lineHeight: 1.5 }}>
          ⚖ Disputed — the Clubhouse owner will review and decide.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
          <CoinAmt amount={challenge.stake_coins} size="sm" />
          <span style={{ ...MONO, fontSize: 8, color: 'var(--mute)' }}>frozen in escrow</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid rgba(26,111,168,.28)',
      borderLeft: `3px solid ${challenge.proposed_by && !isProposer ? 'var(--gold)' : 'var(--accent)'}`,
      borderRadius: 6, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 9,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <TypeBadge betType="freeform" />
        <span style={{ ...MONO, fontSize: 8, color: 'var(--mute)' }}>vs {oppName ?? 'Opponent'}</span>
        <span style={{ marginLeft: 'auto' }}><CoinAmt amount={challenge.stake_coins} size="sm" /></span>
      </div>
      <div style={{ fontSize: 13.5, color: 'var(--text)', fontWeight: 600, lineHeight: 1.4 }}>{challenge.question}</div>

      {!challenge.proposed_by ? (
        <>
          <div style={{ ...MONO, fontSize: 9, color: 'var(--mute)' }}>Both staked · escrow held</div>
          <button
            onClick={() => onDeclare(challenge)}
            disabled={loading}
            style={{
              padding: '9px 0', borderRadius: 6, border: '1.5px solid var(--accent)',
              background: 'transparent', color: 'var(--accent)', cursor: loading ? 'not-allowed' : 'pointer',
              ...MONO, fontSize: 8.5, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600,
              opacity: loading ? 0.6 : 1,
            }}
          >Declare Result</button>
        </>
      ) : isProposer ? (
        <div style={{ ...MONO, fontSize: 10, color: 'var(--mute)', lineHeight: 1.5 }}>
          You declared <strong style={{ color: 'var(--text)' }}>{winnerLabel}</strong> — waiting for {oppName} to confirm or dispute.
        </div>
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--text)' }}>{proposerName}</strong> declared: <strong style={{ color: 'var(--text)' }}>{winnerLabel}</strong>{challenge.proposed_winner_id == null ? '' : ' wins'}. Confirm to settle, or dispute if you disagree.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onConfirm(challenge.id)}
              disabled={loading}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: '1.5px solid var(--accent)',
                background: 'transparent', color: 'var(--accent)', cursor: loading ? 'not-allowed' : 'pointer',
                ...MONO, fontSize: 8.5, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600, opacity: loading ? 0.6 : 1,
              }}
            >Confirm</button>
            <button
              onClick={() => onDispute(challenge.id)}
              disabled={loading}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 6, border: '1.5px solid var(--neg)',
                background: 'transparent', color: 'var(--neg)', cursor: loading ? 'not-allowed' : 'pointer',
                ...MONO, fontSize: 8.5, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600, opacity: loading ? 0.6 : 1,
              }}
            >Dispute</button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Declare Result drawer (S09) ────────────────────────────────────────────────
function DeclareResultModal({ challenge, userId, onClose, onSubmit }) {
  const oppName = challenge.challenger_id === userId ? challenge.opponent_username : challenge.challenger_username;
  const [pick, setPick]           = useState(null); // 'me' | 'opponent' | 'push'
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState(null);

  async function handleSubmit() {
    if (!pick) { setError('Choose an outcome'); return; }
    const winnerId = pick === 'me' ? userId : pick === 'opponent'
      ? (challenge.challenger_id === userId ? challenge.opponent_id : challenge.challenger_id)
      : null;
    setSubmitting(true); setError(null);
    try { await onSubmit(winnerId); onClose(); }
    catch (e) { setError(e.message); setSubmitting(false); }
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(18,24,32,.42)', zIndex: -1 }} onClick={onClose} />
      <div style={{
        width: '100%', maxWidth: 480, background: 'var(--card)',
        border: '1px solid var(--rule)', borderTopLeftRadius: 12, borderTopRightRadius: 12,
        padding: '22px 24px 18px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ ...MONO, fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 5 }}>Declare Result</div>
            <div style={{ ...HEAD, fontSize: 19, color: 'var(--text)', lineHeight: 1.3 }}>{challenge.question}</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid var(--rule)', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 17, color: 'var(--text2)', flexShrink: 0 }}
          >×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
          <PickerRow selected={pick === 'me'} onClick={() => setPick('me')}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>You won</span>
            <RadioDot selected={pick === 'me'} />
          </PickerRow>
          <PickerRow selected={pick === 'opponent'} onClick={() => setPick('opponent')}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{oppName} won</span>
            <RadioDot selected={pick === 'opponent'} />
          </PickerRow>
          <PickerRow selected={pick === 'push'} onClick={() => setPick('push')}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>Push — no winner</span>
            <RadioDot selected={pick === 'push'} />
          </PickerRow>
        </div>

        <div style={{ background: 'var(--gbg)', border: '1px solid rgba(184,114,14,.18)', borderRadius: 6, padding: '10px 12px', ...MONO, fontSize: 10, color: 'var(--gold)', lineHeight: 1.5, marginBottom: 14 }}>
          ⚠ Real coins move once {oppName} confirms — choose carefully. If they disagree, the Clubhouse owner will settle it.
        </div>

        {error && <div style={{ ...MONO, fontSize: 11, color: 'var(--neg)', marginBottom: 12 }}>{error}</div>}

        <button
          onClick={handleSubmit} disabled={submitting || !pick}
          style={{
            width: '100%', padding: '12px', borderRadius: 6, border: 'none', cursor: (submitting || !pick) ? 'not-allowed' : 'pointer',
            background: pick ? 'var(--accent)' : 'var(--elev)', color: pick ? '#fff' : 'var(--mute)',
            ...MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600,
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Submitting…' : 'Declare Result'}
        </button>
      </div>
    </div>,
    document.body,
  );
}

// ── Owner Arbitration drawer (S10) ─────────────────────────────────────────────
function ArbitrationModal({ challenge, onClose, onSubmit }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);
  const proposerName = challenge.proposed_by === challenge.challenger_id ? challenge.challenger_username : challenge.opponent_username;
  const proposedWinnerLabel = challenge.proposed_winner_id == null
    ? 'a push'
    : challenge.proposed_winner_id === challenge.challenger_id ? challenge.challenger_username : challenge.opponent_username;

  async function handle(winnerId) {
    setSubmitting(true); setError(null);
    try { await onSubmit(winnerId); onClose(); }
    catch (e) { setError(e.message); setSubmitting(false); }
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(18,24,32,.42)', zIndex: -1 }} onClick={onClose} />
      <div style={{
        width: '100%', maxWidth: 500, background: 'var(--card)',
        border: '1px solid var(--rule)', borderTopLeftRadius: 12, borderTopRightRadius: 12,
        padding: '22px 24px 18px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ ...MONO, fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--purple)', marginBottom: 5 }}>⚖ Owner Arbitration</div>
            <div style={{ ...HEAD, fontSize: 19, color: 'var(--text)', lineHeight: 1.3 }}>{challenge.question}</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid var(--rule)', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 17, color: 'var(--text2)', flexShrink: 0 }}
          >×</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ ...MONO, fontSize: 8, color: 'var(--mute)', marginBottom: 4 }}>CHALLENGER</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{challenge.challenger_username}</div>
          </div>
          <div style={{ flex: 1, background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 6, padding: '10px 12px' }}>
            <div style={{ ...MONO, fontSize: 8, color: 'var(--mute)', marginBottom: 4 }}>OPPONENT</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{challenge.opponent_username}</div>
          </div>
        </div>

        <div style={{ background: 'rgba(140,73,201,.09)', border: '1px solid rgba(140,73,201,.32)', borderRadius: 6, padding: '10px 12px', fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 16 }}>
          <strong style={{ color: 'var(--text)' }}>{proposerName}</strong> declared <strong style={{ color: 'var(--text)' }}>{proposedWinnerLabel}</strong>{challenge.proposed_winner_id == null ? '' : ' the winner'}, and the other party disputed it. Stakes (<strong style={{ color: 'var(--text)' }}>{challenge.stake_coins}</strong> coins each) are frozen in escrow until you decide.
        </div>

        {error && <div style={{ ...MONO, fontSize: 11, color: 'var(--neg)', marginBottom: 12 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => handle(challenge.challenger_id)} disabled={submitting}
            style={{ padding: '11px', borderRadius: 6, border: '1.5px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: submitting ? 'not-allowed' : 'pointer', ...MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, opacity: submitting ? 0.6 : 1 }}
          >Award {challenge.challenger_username}</button>
          <button
            onClick={() => handle(challenge.opponent_id)} disabled={submitting}
            style={{ padding: '11px', borderRadius: 6, border: '1.5px solid var(--accent)', background: 'transparent', color: 'var(--accent)', cursor: submitting ? 'not-allowed' : 'pointer', ...MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, opacity: submitting ? 0.6 : 1 }}
          >Award {challenge.opponent_username}</button>
          <button
            onClick={() => handle(null)} disabled={submitting}
            style={{ padding: '11px', borderRadius: 6, border: '1.5px solid var(--mute)', background: 'transparent', color: 'var(--mute)', cursor: submitting ? 'not-allowed' : 'pointer', ...MONO, fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, opacity: submitting ? 0.6 : 1 }}
          >Void — return stakes</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Settled / history item ────────────────────────────────────────────────────
function HistoryItem({ challenge, userId }) {
  const won     = challenge.winner_id === userId;
  const draw    = challenge.winner_id == null && challenge.status === 'resolved';
  const voided  = ['cancelled', 'expired', 'declined'].includes(challenge.status);
  const isChallenger = challenge.challenger_id === userId;
  const oppName = isChallenger ? challenge.opponent_username : challenge.challenger_username;
  const netWin  = Math.floor(challenge.stake_coins * 2 * 0.95) - challenge.stake_coins;

  let label = 'Result';
  let amtColor = 'var(--mute)';
  let amtStr = '';
  if (voided) { label = challenge.status === 'declined' ? 'Declined' : 'Voided'; amtStr = `${challenge.stake_coins.toLocaleString()} C returned`; }
  else if (draw) { label = 'Draw'; amtStr = `${challenge.stake_coins.toLocaleString()} C returned`; }
  else if (won) { label = 'You won'; amtColor = 'var(--pos)'; amtStr = `+${netWin.toLocaleString()} C`; }
  else { label = `${oppName ?? 'Opponent'} won`; amtColor = 'var(--neg)'; amtStr = `−${challenge.stake_coins.toLocaleString()} C`; }

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6,
      padding: '10px 13px', display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ ...HEAD, fontSize: 13, color: 'var(--text)', letterSpacing: '-0.01em' }}>{label}</span>
          <TypeBadge betType={challenge.bet_type} />
          {challenge.bet_type !== 'freeform' && (
            <span style={{ ...MONO, fontSize: 8, color: 'var(--mute)' }}>vs {oppName} · {gwLabel(challenge.matchday_id)}</span>
          )}
        </div>
        <div style={{ ...MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.04em' }}>
          {challenge.bet_type === 'freeform'
            ? challenge.question
            : `GW Total Battle${challenge.challenger_pts != null ? ` · ${challenge.challenger_pts}—${challenge.opponent_pts} pts` : ''}`}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ ...HEAD, fontSize: 15, letterSpacing: '-0.02em', color: amtColor }}>{amtStr}</span>
          {!voided && <Ci size="sm" />}
        </div>
        {won && <div style={{ ...MONO, fontSize: 7.5, color: 'var(--mute)', marginTop: 2 }}>after rake</div>}
      </div>
    </div>
  );
}

// ── Wallet tab content (inline) ───────────────────────────────────────────────
const TX_META = {
  purchase:  { label: 'PURCHASE',  color: 'var(--pos)' },
  stake:     { label: 'STAKED',    color: 'var(--mute)' },
  win:       { label: 'WIN',       color: 'var(--pos)' },
  loss:      { label: 'LOSS',      color: 'var(--neg)' },
  rake:      { label: 'RAKE',      color: 'var(--mute)' },
  refund:    { label: 'REFUND',    color: 'var(--pos)' },
  admin:     { label: 'BONUS',     color: 'var(--accent)' },
  entry_fee: { label: 'ENTRY FEE', color: 'var(--mute)' },
};

function WalletTabContent({ wallet, walletLoading }) {
  const [buyStatus, setBuyStatus] = useState(null);
  const [econStats, setEconStats] = useState(null);

  useEffect(() => {
    supabase.rpc('get_coin_economy_stats').then(({ data }) => { if (data) setEconStats(data); });
  }, []);

  const balance      = wallet?.balance      ?? 0;
  const escrow       = wallet?.escrow       ?? 0;
  const transactions = wallet?.transactions ?? [];

  return (
    <div style={{ padding: '20px 26px', overflowY: 'auto', flex: 1, display: 'flex', gap: 20 }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Balance card */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ ...HEAD, fontSize: 13, letterSpacing: '-0.01em' }}>Coin Wallet</div>
          </div>
          <div style={{ padding: '20px 16px', textAlign: 'center' }}>
            {walletLoading ? (
              <div style={{ ...MONO, fontSize: 12, color: 'var(--mute)' }}>Loading…</div>
            ) : (
              <>
                <div style={{ ...MONO, fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 10 }}>Available balance</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
                  <Ci size="xl" />
                  <span style={{ ...HEAD, fontSize: 38, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--gold)' }}>{balance.toLocaleString()}</span>
                </div>
                {escrow > 0 && (
                  <div style={{ ...MONO, fontSize: 8.5, color: 'var(--mute)', marginBottom: 16 }}>
                    {escrow.toLocaleString()} coins locked in challenges
                  </div>
                )}
                <button
                  disabled={buyStatus === 'loading'}
                  onClick={async () => {
                    setBuyStatus('loading');
                    try {
                      const { error } = await supabase.functions.invoke('purchase-coins/create-payment-intent', { body: { pack_coins: 500 } });
                      setBuyStatus(error?.message?.includes('STRIPE_NOT_CONFIGURED') ? 'coming_soon' : 'coming_soon');
                    } catch { setBuyStatus('coming_soon'); }
                    setTimeout(() => setBuyStatus(null), 3000);
                  }}
                  style={{
                    width: '100%', padding: '8px 0', borderRadius: 6,
                    border: '1.5px solid var(--rule)', background: 'transparent',
                    ...MONO, fontSize: 8.5, letterSpacing: '.12em', textTransform: 'uppercase',
                    color: 'var(--text2)', cursor: 'pointer',
                  }}
                >
                  {buyStatus === 'coming_soon' ? 'Payments coming soon' : buyStatus === 'loading' ? 'Connecting…' : 'Buy Coins →'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Coin packs */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
            <div style={{ ...HEAD, fontSize: 13, letterSpacing: '-0.01em' }}>Buy Coins</div>
          </div>
          <div style={{ padding: '16px 16px', display: 'flex', gap: 10 }}>
            {[{ coins: 500, price: '£1.99' }, { coins: 1500, price: '£4.99' }, { coins: 5000, price: '£12.99' }].map(({ coins, price }) => (
              <div key={coins} style={{
                flex: 1, padding: '12px 8px', borderRadius: 6,
                border: '1px solid var(--rule)', background: 'var(--elev)',
                textAlign: 'center', cursor: 'pointer',
              }}>
                <div style={{ ...HEAD, fontSize: 16, letterSpacing: '-0.02em', color: 'var(--gold)' }}>{coins.toLocaleString()}</div>
                <div style={{ ...MONO, fontSize: 8.5, color: 'var(--mute)', marginTop: 3 }}>{price}</div>
              </div>
            ))}
          </div>
          <div style={{ padding: '0 16px 12px', ...MONO, fontSize: 8, color: 'var(--mute)', textAlign: 'center' }}>Payments coming soon</div>
        </div>

        {/* Economy stats */}
        {econStats && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
              <div style={{ ...HEAD, fontSize: 13, letterSpacing: '-0.01em' }}>Platform Economy</div>
            </div>
            <div style={{ padding: '16px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px' }}>
              {[
                { label: 'CIRCULATING', value: Number(econStats.circulating).toLocaleString() },
                { label: 'IN ESCROW',   value: Number(econStats.in_escrow).toLocaleString() },
                { label: 'CHALLENGES',  value: econStats.challenges_total },
                { label: 'RAKE BURNED', value: Number(econStats.rake_burned).toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ ...MONO, fontSize: 7.5, color: 'var(--mute)', letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
                  <div style={{ ...HEAD, fontSize: 16, color: 'var(--text)' }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transaction history */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
            <div style={{ ...HEAD, fontSize: 13, letterSpacing: '-0.01em' }}>Transaction History</div>
          </div>
          <div style={{ padding: '0 16px' }}>
            {walletLoading ? (
              <div style={{ ...MONO, fontSize: 12, color: 'var(--mute)', textAlign: 'center', padding: '24px 0' }}>Loading…</div>
            ) : transactions.length === 0 ? (
              <div style={{ ...MONO, fontSize: 11, color: 'var(--mute)', textAlign: 'center', padding: '24px 0' }}>No transactions yet</div>
            ) : transactions.map((tx, i) => {
              const meta = TX_META[tx.type] ?? { label: tx.type.toUpperCase(), color: 'var(--mute)' };
              const isCredit = ['purchase', 'win', 'refund', 'admin'].includes(tx.type);
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '11px 0', borderBottom: i < transactions.length - 1 ? '1px solid var(--rule)' : 'none',
                }}>
                  <div>
                    <div style={{ ...MONO, fontSize: 10, color: meta.color, letterSpacing: '.1em', marginBottom: 2 }}>{meta.label}</div>
                    {tx.meta?.reason && (
                      <div style={{ ...MONO, fontSize: 9, color: 'var(--mute)' }}>{tx.meta.reason.replace(/_/g, ' ')}</div>
                    )}
                    <div style={{ ...MONO, fontSize: 9, color: 'var(--mute)' }}>{timeAgo(tx.created_at)}</div>
                  </div>
                  <span style={{ ...HEAD, fontSize: 14, color: isCredit ? 'var(--pos)' : 'var(--neg)' }}>
                    {isCredit ? '+' : '-'}{tx.amount.toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Member avatar (colored initial circle, matches ClubhouseScreen pattern) ───
const MEMBER_COLORS = ['var(--accent)', 'var(--f1)', 'var(--ten)', 'var(--gold)', '#7C3AED', '#4B5568'];

function MemberAvatar({ username, index, size = 28 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: MEMBER_COLORS[index % MEMBER_COLORS.length],
      display: 'grid', placeItems: 'center',
      ...HEAD, fontSize: size * 0.4, color: '#fff',
    }}>
      {(username?.[0] ?? '?').toUpperCase()}
    </div>
  );
}

function RadioDot({ selected }) {
  return (
    <span style={{
      width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
      border: `1.5px solid ${selected ? 'var(--gold)' : 'var(--rule)'}`,
      display: 'grid', placeItems: 'center',
    }}>
      {selected && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)' }} />}
    </span>
  );
}

function PickerRow({ selected, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '9px 11px', borderRadius: 6, cursor: 'pointer', textAlign: 'left',
        background: selected ? 'var(--gbg)' : 'var(--elev)',
        border: `1px solid ${selected ? 'var(--gold)' : 'var(--rule)'}`,
      }}
    >
      {children}
    </button>
  );
}

function Chip({ selected, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 13px', borderRadius: 100, cursor: 'pointer',
        background: selected ? 'var(--gold)' : 'var(--elev)',
        border: `1px solid ${selected ? 'var(--gold)' : 'var(--rule)'}`,
        color: selected ? '#fff' : 'var(--text)',
        ...MONO, fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

// Current/next gameweek for a league's tournament — same matchday_deadlines pattern
// BetCreatorPanel.jsx uses for its own gameweek picker.
function useGameweekOptions(leagueId) {
  const [current, setCurrent] = useState(null);
  const [next, setNext]       = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!leagueId) { setCurrent(null); setNext(null); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: league } = await supabase.from('leagues').select('tournament_id').eq('id', leagueId).single();
      const tournamentId = league?.tournament_id;
      if (!tournamentId) {
        if (!cancelled) { setCurrent(null); setNext(null); setLoading(false); }
        return;
      }
      const now = new Date().toISOString();
      const [{ data: nextRows }, { data: currentRows }] = await Promise.all([
        supabase.from('matchday_deadlines').select('matchday_id, deadline_at').eq('tournament_id', tournamentId).gt('deadline_at', now).order('deadline_at', { ascending: true }).limit(1),
        supabase.from('matchday_deadlines').select('matchday_id, deadline_at').eq('tournament_id', tournamentId).lte('deadline_at', now).order('deadline_at', { ascending: false }).limit(1),
      ]);
      if (!cancelled) {
        setCurrent(currentRows?.[0] ?? null);
        setNext(nextRows?.[0] ?? null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leagueId]);

  return { current, next, loading };
}

// ── Create challenge drawer (slide-in via createPortal) ───────────────────────
function CreateChallengeModal({ onClose, onCreate, wallet, circleId, circleName, currentUserId, members, footballLeagues }) {
  const opponents = (members ?? []).filter(m => m.user_id !== currentUserId);
  const hasOpponents    = opponents.length > 0;
  const hasCompetitions = (footballLeagues ?? []).length > 0;
  const blocked = !circleId || !hasOpponents;

  const [betType, setBetType]       = useState(hasCompetitions ? 'gw_total' : 'freeform');
  const [opponentId, setOpponentId] = useState(null);
  const [leagueId, setLeagueId]     = useState(null);
  const [gw, setGw]                 = useState(null); // 'current' | 'next'
  const [question, setQuestion]     = useState('');
  const [stakeCoins, setStakeCoins] = useState(100);
  const [message, setMessage]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState(null);

  const isFreeform = betType === 'freeform';
  const { current, next, loading: gwLoading } = useGameweekOptions(isFreeform ? null : leagueId);
  const matchdayId = gw === 'current' ? current?.matchday_id : gw === 'next' ? next?.matchday_id : null;

  const balance    = wallet?.balance ?? 0;
  const prizePool  = Math.floor(stakeCoins * 2 * 0.95);
  const netWin     = Math.max(0, prizePool - stakeCoins);
  const overBudget = stakeCoins > balance;

  async function handleSubmit() {
    if (!opponentId) { setError('Pick an opponent'); return; }
    if (isFreeform) {
      if (!question.trim()) { setError('Describe what you’re betting on'); return; }
      if (question.trim().length > 140) { setError('Question is too long'); return; }
    } else {
      if (!leagueId)   { setError('Pick a competition'); return; }
      if (!matchdayId) { setError('Pick a gameweek'); return; }
    }
    if (stakeCoins < 10) { setError('Minimum stake is 10 coins'); return; }
    if (overBudget)  { setError('Insufficient balance'); return; }
    setSubmitting(true); setError(null);
    try {
      await onCreate({
        circleId, betType, opponentId, stakeCoins, message: message || null,
        leagueId: isFreeform ? null : leagueId,
        matchdayId: isFreeform ? null : matchdayId,
        question: isFreeform ? question.trim() : null,
      });
      onClose();
    } catch (e) {
      const friendly = {
        DAILY_STAKE_CAP_EXCEEDED:   'Daily stake limit reached (1,000 coins / 24h)',
        DAILY_LIMIT_REACHED:        'Daily challenge limit reached for this competition',
        DUPLICATE_CHALLENGE:        'A challenge already exists between you two for this GW',
        NOT_CIRCLE_MEMBER:          'You are not a member of this Clubhouse',
        OPPONENT_NOT_CIRCLE_MEMBER: 'That member has left this Clubhouse',
        LEAGUE_NOT_IN_CIRCLE:       'That competition is not linked to this Clubhouse',
        NOT_LEAGUE_MEMBER:          'You are not a member of that league',
        OPPONENT_NOT_MEMBER:        'That member is not in that league',
        INSUFFICIENT_BALANCE:       'Insufficient coins',
        BET_TYPE_NOT_SUPPORTED:     'That bet type is not available yet',
        QUESTION_REQUIRED:          'Describe what you’re betting on',
        QUESTION_TOO_LONG:          'Question is too long (140 chars max)',
      }[e.message] ?? e.message;
      setError(friendly);
    }
    setSubmitting(false);
  }

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(18,24,32,.42)', zIndex: -1 }} onClick={onClose} />
      <div style={{
        width: '100%', maxWidth: 520, background: 'var(--card)',
        border: '1px solid var(--rule)', borderTopLeftRadius: 12, borderTopRightRadius: 12,
        padding: '22px 24px 18px', maxHeight: '90vh', overflowY: 'auto',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ ...MONO, fontSize: 8, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 5 }}>New Challenge</div>
            <div style={{ ...HEAD, fontSize: 20, color: 'var(--text)' }}>{isFreeform ? 'Send a Freeform Bet' : 'Send a GW Total Bet'}</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: '50%', border: '1.5px solid var(--rule)', background: 'transparent', cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: 17, color: 'var(--text2)' }}
          >×</button>
        </div>

        {blocked ? (
          <div style={{ padding: '30px 6px 12px', textAlign: 'center' }}>
            {!circleId ? (
              <>
                <div style={{ ...HEAD, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>No Clubhouse selected</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>Join or create a Clubhouse before starting a challenge.</div>
              </>
            ) : (
              <>
                <div style={{ ...HEAD, fontSize: 16, color: 'var(--text)', marginBottom: 8 }}>Nobody to challenge yet</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                  Invite more managers to {circleName ?? 'this Clubhouse'} before you can send a challenge.
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            {/* Bet-type picker */}
            <div style={{ marginBottom: 14 }}>
              <span style={{ ...MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', display: 'block', marginBottom: 6 }}>Bet Type</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => hasCompetitions && setBetType('gw_total')}
                  disabled={!hasCompetitions}
                  style={{
                    flex: 1, textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: hasCompetitions ? 'pointer' : 'not-allowed',
                    background: betType === 'gw_total' ? 'var(--gbg)' : 'var(--elev)',
                    border: `2px solid ${betType === 'gw_total' ? 'var(--gold)' : 'var(--rule)'}`,
                    opacity: hasCompetitions ? 1 : 0.5,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>🏆 Competitor</div>
                  <div style={{ ...MONO, fontSize: 9, color: 'var(--mute)' }}>
                    {hasCompetitions ? 'Auto-resolved GW total' : 'No competitions linked'}
                  </div>
                </button>
                <button
                  onClick={() => setBetType('freeform')}
                  style={{
                    flex: 1, textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                    background: isFreeform ? 'var(--abg)' : 'var(--elev)',
                    border: `2px solid ${isFreeform ? 'var(--accent)' : 'var(--rule)'}`,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>💬 Freeform</div>
                  <div style={{ ...MONO, fontSize: 9, color: 'var(--mute)' }}>Settle by agreement</div>
                </button>
              </div>
            </div>

            {/* Opponent picker */}
            <div style={{ marginBottom: 14 }}>
              <span style={{ ...MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', display: 'block', marginBottom: 6 }}>Opponent</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
                {opponents.map((m, i) => (
                  <PickerRow key={m.user_id} selected={opponentId === m.user_id} onClick={() => setOpponentId(m.user_id)}>
                    <MemberAvatar username={m.username} index={i} />
                    <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{m.username}</span>
                    <RadioDot selected={opponentId === m.user_id} />
                  </PickerRow>
                ))}
              </div>
            </div>

            {isFreeform ? (
              /* Question field */
              <label style={{ display: 'block', marginBottom: 14 }}>
                <span style={{ ...MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', display: 'block', marginBottom: 6 }}>
                  What are you betting on? (<span style={{ color: question.length > 140 ? 'var(--neg)' : 'var(--mute)' }}>{140 - question.length}</span> chars)
                </span>
                <textarea
                  maxLength={140} value={question} onChange={e => setQuestion(e.target.value)}
                  placeholder="Will it rain at kickoff for Saturday's derby?"
                  rows={2}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6, background: 'var(--elev)', border: '1px solid var(--rule)', color: 'var(--text)', ...BODY, fontSize: 13, resize: 'none', fontFamily: 'inherit' }}
                />
              </label>
            ) : (
              <>
                {/* Competition picker */}
                <div style={{ marginBottom: 14 }}>
                  <span style={{ ...MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', display: 'block', marginBottom: 6 }}>Competition</span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {footballLeagues.map(l => (
                      <Chip key={l.id} selected={leagueId === l.id} onClick={() => { setLeagueId(l.id); setGw(null); }}>{l.name}</Chip>
                    ))}
                  </div>
                </div>

                {/* Gameweek picker */}
                {leagueId && (
                  <div style={{ marginBottom: 14 }}>
                    <span style={{ ...MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', display: 'block', marginBottom: 6 }}>Gameweek</span>
                    {gwLoading ? (
                      <div style={{ ...MONO, fontSize: 11, color: 'var(--mute)' }}>Loading…</div>
                    ) : !current && !next ? (
                      <div style={{ ...MONO, fontSize: 11, color: 'var(--mute)' }}>No upcoming gameweeks found.</div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {current && <Chip selected={gw === 'current'} onClick={() => setGw('current')}>Current · {gwLabel(current.matchday_id)}</Chip>}
                        {next    && <Chip selected={gw === 'next'}    onClick={() => setGw('next')}>Next · {gwLabel(next.matchday_id)}</Chip>}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Stake */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ ...MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 6 }}>
                Stake (balance: <span style={{ color: 'var(--gold)' }}>{balance.toLocaleString()} coins</span>)
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {[50, 100, 250, 500].map(v => (
                  <button key={v} onClick={() => setStakeCoins(v)} style={{
                    flex: 1, padding: '8px 4px', borderRadius: 6, cursor: 'pointer',
                    background: stakeCoins === v ? 'var(--gold)' : 'var(--elev)',
                    border: `1px solid ${stakeCoins === v ? 'var(--gold)' : 'var(--rule)'}`,
                    color: stakeCoins === v ? '#fff' : 'var(--text)',
                    ...MONO, fontSize: 11, fontWeight: 700,
                  }}>{v}</button>
                ))}
              </div>
              <input
                type="number" min={10} max={balance} value={stakeCoins}
                onChange={e => setStakeCoins(Math.max(10, parseInt(e.target.value) || 0))}
                style={{
                  width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6,
                  background: 'var(--elev)', border: `1px solid ${overBudget ? 'var(--neg)' : 'var(--rule)'}`,
                  color: overBudget ? 'var(--neg)' : 'var(--text)', ...MONO, fontSize: 13,
                }}
              />
              <div style={{ ...MONO, fontSize: 9, color: 'var(--mute)', marginTop: 5 }}>
                Net win if you win: <span style={{ color: 'var(--pos)' }}>{netWin.toLocaleString()} coins</span> after 5% rake
              </div>
            </div>

            {/* Message */}
            <label style={{ display: 'block', marginBottom: 16 }}>
              <span style={{ ...MONO, fontSize: 9, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', display: 'block', marginBottom: 6 }}>
                Message (optional · {140 - message.length} chars)
              </span>
              <input
                maxLength={140} value={message} onChange={e => setMessage(e.target.value)}
                placeholder="trash talk here…"
                style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6, background: 'var(--elev)', border: '1px solid var(--rule)', color: 'var(--text)', ...BODY, fontSize: 13 }}
              />
            </label>

            {error && <div style={{ ...MONO, fontSize: 11, color: 'var(--neg)', marginBottom: 12 }}>{error}</div>}

            <button
              onClick={handleSubmit} disabled={submitting || overBudget}
              style={{
                width: '100%', padding: '12px', borderRadius: 6, border: 'none', cursor: (submitting || overBudget) ? 'not-allowed' : 'pointer',
                background: overBudget ? 'var(--elev)' : 'var(--gold)', color: overBudget ? 'var(--mute)' : '#fff',
                ...MONO, fontSize: 9, letterSpacing: '.14em', textTransform: 'uppercase', fontWeight: 600,
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? 'Sending…' : '⚔ Send Challenge'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Sidebar content (shared between desktop sidebar and mobile inline) ────────
function SidebarContent({ balance, escrow, netWL, history, userId, onNewChallenge, onGoToWallet, isMobile }) {
  const won    = history.filter(c => c.winner_id === userId).length;
  const lost   = history.filter(c => c.status === 'resolved' && c.winner_id !== userId && c.winner_id != null).length;
  const voided = history.filter(c => c.status !== 'resolved').length;
  const total  = history.filter(c => c.status === 'resolved').length;

  return (
    <>
      {/* New challenge CTA — desktop only; mobile uses PrimaryActionBar */}
      {!isMobile && (
        <button
          onClick={onNewChallenge}
          style={{
            width: '100%', padding: '12px 24px', borderRadius: 6, border: 'none',
            background: 'var(--gold)', color: '#fff', cursor: 'pointer',
            ...MONO, fontSize: 9.5, letterSpacing: '.12em', textTransform: 'uppercase',
            fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: '0 6px 24px -6px rgba(184,114,14,.5)',
          }}
        >⚔ New Challenge</button>
      )}

      {/* Wallet mini-card */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ ...HEAD, fontSize: 13, letterSpacing: '-0.01em' }}>Coin Wallet</div>
        </div>
        <div style={{ padding: '16px 16px' }}>
          <div style={{ ...MONO, fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 5 }}>Available balance</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ci size="xl" />
            <span style={{ ...HEAD, fontSize: 28, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--gold)' }}>{balance.toLocaleString()}</span>
          </div>
          {escrow > 0 && (
            <div style={{ ...MONO, fontSize: 8.5, color: 'var(--mute)', marginBottom: 13 }}>
              {escrow.toLocaleString()} coins locked in challenges
            </div>
          )}
          <button
            onClick={onGoToWallet}
            style={{
              width: '100%', padding: '8px 0', borderRadius: 6, border: '1.5px solid var(--rule)',
              background: 'transparent', cursor: 'pointer',
              ...MONO, fontSize: 8.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text2)',
            }}
          >Buy Coins →</button>
        </div>
      </div>

      {/* Season record */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ ...HEAD, fontSize: 13, letterSpacing: '-0.01em' }}>Season record</div>
        </div>
        <div style={{ padding: '10px 14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', textAlign: 'center', paddingBottom: 10, marginBottom: 8, borderBottom: '1px solid var(--rule)' }}>
            <div style={{ padding: '6px 0' }}>
              <div style={{ ...HEAD, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--pos)' }}>{won}</div>
              <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mute)', marginTop: 2 }}>Won</div>
            </div>
            <div style={{ padding: '6px 0', borderLeft: '1px solid var(--rule)', borderRight: '1px solid var(--rule)' }}>
              <div style={{ ...HEAD, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--neg)' }}>{lost}</div>
              <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mute)', marginTop: 2 }}>Lost</div>
            </div>
            <div style={{ padding: '6px 0' }}>
              <div style={{ ...HEAD, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--mute)' }}>{voided}</div>
              <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--mute)', marginTop: 2 }}>Void</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--rule)' }}>
            <span style={{ color: 'var(--text2)' }}>Net P&L</span>
            <strong style={{ ...HEAD, fontSize: 13, letterSpacing: '-0.01em', color: netWL >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{netWL >= 0 ? '+' : ''}{netWL.toLocaleString()} C</strong>
          </div>
          {total > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: 'var(--text2)' }}>Win rate</span>
              <strong style={{ ...HEAD, fontSize: 13, letterSpacing: '-0.01em' }}>{Math.round(won / total * 100)}%</strong>
            </div>
          )}
        </div>
      </div>

      {/* How it works info */}
      <div style={{ background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 6 }}>
        <div style={{ padding: '13px 14px' }}>
          <div style={{ ...HEAD, fontSize: 12.5, letterSpacing: '-0.01em', marginBottom: 6 }}>How Challenges work</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>
            Challenge any Clubhouse member to a Competitor (auto-resolved GW Total) or Freeform (settle-by-agreement) bet. Both stake coins — winner takes 95%, 5% rake burned.
          </div>
          <div style={{ marginTop: 9, ...MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.04em' }}>Stakes held in escrow until result</div>
        </div>
      </div>
    </>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ChallengeScreen() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const { wallet, loading: walletLoading } = useWallet(user?.id);
  const { activeCircleId, activeCircle, members, competitions } = useClubhouseContext();
  const {
    incoming, outgoing, active, disputed, history, loading,
    createChallenge, acceptChallenge, declineChallenge, cancelChallenge,
    declareResult, confirmResult, disputeResult, arbitrateResult,
  } = useChallenges(user?.id, activeCircleId);

  const [outerTab, setOuterTab] = useState('challenges');
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setAction]  = useState(false);
  const [toast, setToast]           = useState(null);
  const [declaringChallenge, setDeclaringChallenge]     = useState(null);
  const [arbitratingChallenge, setArbitratingChallenge] = useState(null);

  const isOwner = activeCircle?.role === 'owner';
  const myDisputed    = disputed.filter(c => c.challenger_id === user?.id || c.opponent_id === user?.id);
  const ownerDisputed = isOwner ? disputed.filter(c => c.challenger_id !== user?.id && c.opponent_id !== user?.id) : [];
  const liveChallenges = [...active, ...myDisputed];

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  async function handleAccept(id) {
    setAction(true);
    try { await acceptChallenge(id); showToast('Challenge accepted — coins staked!'); }
    catch (e) { showToast(e.message, true); }
    setAction(false);
  }

  async function handleDecline(id) {
    setAction(true);
    try { await declineChallenge(id); showToast('Challenge declined.'); }
    catch (e) { showToast(e.message, true); }
    setAction(false);
  }

  async function handleCancel(id) {
    setAction(true);
    try { await cancelChallenge(id); showToast('Challenge cancelled — coins returned.'); }
    catch (e) { showToast(e.message, true); }
    setAction(false);
  }

  async function handleDeclareSubmit(winnerId) {
    await declareResult(declaringChallenge.id, winnerId);
    showToast('Result declared — waiting for confirmation.');
  }

  async function handleConfirm(id) {
    setAction(true);
    try { await confirmResult(id); showToast('Confirmed — coins settled!'); }
    catch (e) { showToast(e.message, true); }
    setAction(false);
  }

  async function handleDispute(id) {
    setAction(true);
    try { await disputeResult(id); showToast('Disputed — the Clubhouse owner has been notified.'); }
    catch (e) { showToast(e.message, true); }
    setAction(false);
  }

  async function handleArbitrateSubmit(winnerId) {
    await arbitrateResult(arbitratingChallenge.id, winnerId);
    showToast(winnerId ? 'Arbitrated — coins settled.' : 'Voided — both stakes returned.');
  }

  const balance  = wallet?.balance  ?? 0;
  const escrow   = wallet?.escrow   ?? 0;
  const netWL = history.reduce((sum, c) => {
    if (c.winner_id === user?.id) return sum + Math.floor(c.stake_coins * 2 * 0.95) - c.stake_coins;
    if (c.status === 'resolved' && c.winner_id !== user?.id && c.winner_id != null) return sum - c.stake_coins;
    return sum;
  }, 0);

  const tabs = [
    { key: 'challenges', label: 'Challenges' },
    { key: 'wallet',     label: 'Wallet'     },
  ];

  // Mobile: page scrolls in document flow; Desktop: fixed-height flex column
  const rootStyle = isMobile
    ? { display: 'flex', flexDirection: 'column', background: 'var(--bg)', minHeight: '100%' }
    : { height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' };

  return (
    <div style={rootStyle}>

      {/* Toast */}
      {toast && createPortal(
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          background: toast.isError ? 'var(--neg)' : 'var(--shell)', color: '#fff',
          padding: '12px 22px', borderRadius: 6, ...MONO, fontSize: 10,
          letterSpacing: '.05em', zIndex: 999, whiteSpace: 'nowrap',
          boxShadow: '0 8px 28px rgba(0,0,0,.25)',
        }}>
          {toast.msg}
        </div>,
        document.body,
      )}

      {/* Header */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', padding: isMobile ? '14px 16px 0' : '14px 26px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: 12, gap: 16 }}>
          <div>
            <div style={{ ...MONO, fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 4 }}>P2P Betting</div>
            <div style={{ ...HEAD, fontSize: 23, letterSpacing: '-0.025em', color: 'var(--paper)', lineHeight: 1 }}>Coin Challenges</div>
          </div>
          {/* Key stats */}
          <div style={{ display: 'flex', gap: isMobile ? 14 : 22, alignItems: 'flex-start', paddingTop: 2 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 3 }}>Balance</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginTop: 2 }}>
                <Ci size="lg" />
                <span style={{ ...HEAD, fontSize: 18, letterSpacing: '-0.02em', color: 'var(--gold)' }}>{balance.toLocaleString()}</span>
              </div>
            </div>
            {!isMobile && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 3 }}>In escrow</div>
                <div style={{ ...HEAD, fontSize: 18, letterSpacing: '-0.02em', color: 'var(--paper)' }}>{escrow.toLocaleString()}</div>
              </div>
            )}
            <div style={{ textAlign: 'right' }}>
              <div style={{ ...MONO, fontSize: 7.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 3 }}>Net W/L</div>
              <div style={{ ...HEAD, fontSize: 18, letterSpacing: '-0.02em', color: netWL >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                {netWL >= 0 ? '+' : ''}{netWL.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex' }}>
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setOuterTab(t.key)}
              style={{
                fontSize: 12.5, fontWeight: 600, color: outerTab === t.key ? 'var(--paper)' : 'var(--mute)',
                padding: '9px 14px', position: 'relative', cursor: 'pointer',
                background: 'transparent', border: 'none', whiteSpace: 'nowrap',
              }}
            >
              {t.label}
              {outerTab === t.key && (
                <span style={{
                  position: 'absolute', left: 14, right: 14, bottom: -1,
                  height: 2, background: 'var(--gold)', borderRadius: 1,
                }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Challenges tab */}
      {outerTab === 'challenges' && (
        <div style={{
          flex: 1,
          overflowY: isMobile ? 'visible' : 'auto',
          padding: isMobile ? '16px 16px 88px' : '20px 26px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 20,
        }}>

          {/* Mobile: sidebar content folded above challenges */}
          {isMobile && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SidebarContent
                balance={balance} escrow={escrow} netWL={netWL}
                history={history} userId={user?.id}
                onNewChallenge={() => setShowCreate(true)}
                onGoToWallet={() => setOuterTab('wallet')}
                isMobile={true}
              />
            </div>
          )}

          {/* Main column */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Incoming section */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{ ...MONO, fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)' }}>Incoming</div>
                {incoming.length > 0 && (
                  <span style={{
                    background: 'var(--gbg)', color: 'var(--gold)',
                    ...MONO, fontSize: 8.5, letterSpacing: '.06em', padding: '1px 8px',
                    borderRadius: 100, fontWeight: 600,
                  }}>{incoming.length}</span>
                )}
              </div>
              {loading ? (
                <div style={{ ...MONO, fontSize: 11, color: 'var(--mute)', padding: 16, textAlign: 'center' }}>Loading…</div>
              ) : incoming.length === 0 ? (
                <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '20px 16px', ...MONO, fontSize: 11, color: 'var(--mute)', textAlign: 'center' }}>
                  No pending challenges from other managers.
                </div>
              ) : (
                <div style={{ background: 'var(--gbg)', border: '1px solid rgba(184,114,14,.18)', borderRadius: 6, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {incoming.map(c => (
                    <IncomingCard key={c.id} challenge={c} userId={user?.id} onAccept={handleAccept} onDecline={handleDecline} loading={actionLoading} />
                  ))}
                </div>
              )}
            </div>

            {/* Sent + Live — 2-col on desktop, stacked on mobile */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
              gap: 14,
            }}>
              <div>
                <div style={{ ...MONO, fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 9 }}>Sent · awaiting</div>
                {outgoing.length === 0 ? (
                  <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px', ...MONO, fontSize: 11, color: 'var(--mute)', textAlign: 'center' }}>
                    No sent challenges.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {outgoing.map(c => <OutgoingCard key={c.id} challenge={c} userId={user?.id} onCancel={handleCancel} loading={actionLoading} />)}
                  </div>
                )}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    ...MONO, fontSize: 7.5, letterSpacing: '.1em', textTransform: 'uppercase',
                    padding: '3px 8px', borderRadius: 100, background: 'var(--nbg)', color: 'var(--neg)',
                  }}>
                    <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
                    Live
                  </span>
                  <span style={{ ...MONO, fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)' }}>Active</span>
                </div>
                {liveChallenges.length === 0 ? (
                  <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px', ...MONO, fontSize: 11, color: 'var(--mute)', textAlign: 'center' }}>
                    No live challenges.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {liveChallenges.map(c => (
                      <LiveCard
                        key={c.id} challenge={c} userId={user?.id}
                        onDeclare={setDeclaringChallenge} onConfirm={handleConfirm} onDispute={handleDispute}
                        loading={actionLoading}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Owner arbitration — disputed freeform bets between other members */}
            {isOwner && ownerDisputed.length > 0 && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <div style={{ ...MONO, fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--purple)' }}>⚖ Arbitration needed</div>
                  <span style={{
                    background: 'rgba(140,73,201,.12)', color: 'var(--purple)',
                    ...MONO, fontSize: 8.5, letterSpacing: '.06em', padding: '1px 8px',
                    borderRadius: 100, fontWeight: 600,
                  }}>{ownerDisputed.length}</span>
                </div>
                <div style={{ background: 'rgba(140,73,201,.06)', border: '1px solid rgba(140,73,201,.24)', borderRadius: 6, padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {ownerDisputed.map(c => (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '10px 12px' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', marginBottom: 3 }}>{c.question}</div>
                        <div style={{ ...MONO, fontSize: 9, color: 'var(--mute)' }}>{c.challenger_username} vs {c.opponent_username} · <CoinAmt amount={c.stake_coins} size="sm" /></div>
                      </div>
                      <button
                        onClick={() => setArbitratingChallenge(c)}
                        style={{
                          flexShrink: 0, padding: '8px 12px', borderRadius: 6, border: '1.5px solid var(--purple)',
                          background: 'transparent', color: 'var(--purple)', cursor: 'pointer',
                          ...MONO, fontSize: 8.5, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600,
                        }}
                      >Review</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Settled history */}
            {history.length > 0 && (
              <div>
                <div style={{ ...MONO, fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 9 }}>Settled this season</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {history.map(c => <HistoryItem key={c.id} challenge={c} userId={user?.id} />)}
                </div>
              </div>
            )}
          </div>

          {/* Desktop: right sidebar */}
          {!isMobile && (
            <div style={{ width: 256, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SidebarContent
                balance={balance} escrow={escrow} netWL={netWL}
                history={history} userId={user?.id}
                onNewChallenge={() => setShowCreate(true)}
                onGoToWallet={() => setOuterTab('wallet')}
                isMobile={false}
              />
            </div>
          )}
        </div>
      )}

      {/* Wallet tab */}
      {outerTab === 'wallet' && (
        <WalletTabContent wallet={wallet} walletLoading={walletLoading} />
      )}

      {/* Mobile: PrimaryActionBar for ⚔ New Challenge */}
      {isMobile && outerTab === 'challenges' && (
        <PrimaryActionBar
          label="⚔ New Challenge"
          state="action"
          onPress={() => setShowCreate(true)}
          accent="var(--gold)"
        />
      )}

      {/* Create challenge modal */}
      {showCreate && (
        <CreateChallengeModal
          onClose={() => setShowCreate(false)}
          onCreate={createChallenge}
          wallet={wallet}
          circleId={activeCircleId}
          circleName={activeCircle?.name}
          currentUserId={user?.id}
          members={members}
          footballLeagues={competitions.football}
        />
      )}

      {/* Declare Result modal */}
      {declaringChallenge && (
        <DeclareResultModal
          challenge={declaringChallenge}
          userId={user?.id}
          onClose={() => setDeclaringChallenge(null)}
          onSubmit={handleDeclareSubmit}
        />
      )}

      {/* Owner Arbitration modal */}
      {arbitratingChallenge && (
        <ArbitrationModal
          challenge={arbitratingChallenge}
          onClose={() => setArbitratingChallenge(null)}
          onSubmit={handleArbitrateSubmit}
        />
      )}
    </div>
  );
}
