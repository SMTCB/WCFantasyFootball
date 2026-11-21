import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useChallenges } from '../hooks/useChallenges';
import { useGroupBets } from '../hooks/useGroupBets';
import { useAllBets } from '../hooks/useAllBets';
import { useWallet } from '../hooks/useWallet';
import { useChallengeLiveTotals } from '../hooks/useChallengeLiveTotals';
import { useIsMobile } from '../hooks/useViewport';
import { useClubhouseContext } from '../context/ClubhouseContext';
import { LoadingRows } from '../components/Skeleton';
import ConfirmModal from '../components/ConfirmModal';
import BetThread from '../components/BetThread';
import { supabase } from '../lib/supabase';
import {
  HEAD, Ci, CoinAmt, MemberAvatar, gwLabel, timeAgo, timeUntil, TX_META,
  friendlyBetError, DeclareResultModal, ArbitrationModal, CreateGroupBetModal,
  SubmitAnswerModal, DeclareOutcomeModal, ArbitrateOutcomeModal, CreateChallengeModal,
} from '../components/bets/BetKit';

// The Bets screen (MD-8): every bet across every clubhouse, in four plain groups:
// waiting on you, live now, waiting for a result, settled. A sentence composer on
// top, the bet's conversation on the right (full screen on phone).

const MIN_STAKE = 10;
const MAX_STAKE = 500;
const MAX_QUESTION = 140;
const RAKE_KEEP = 0.95;

const CLAIM_ERRORS = {
  ALREADY_CLAIMED:            'Someone already took this bet',
  CHALLENGE_NOT_PENDING:      'This bet is no longer open',
  CHALLENGE_EXPIRED:          'This bet has expired',
  CANNOT_CLAIM_OWN_CHALLENGE: "You can't take your own bet",
  NOT_CIRCLE_MEMBER:          'You are not a member of this Clubhouse',
  NOT_LEAGUE_MEMBER:          'You are not a member of that league',
};
const CREATE_ERRORS = {
  DAILY_STAKE_CAP_EXCEEDED: 'That goes over your daily stake limit',
  DAILY_LIMIT_REACHED:      "You've made the most bets allowed today",
  DUPLICATE_CHALLENGE:      'You already have this bet open with them',
  NOT_CIRCLE_MEMBER:        'You are not a member of this Clubhouse',
  OPPONENT_NOT_CIRCLE_MEMBER: 'They are not in this Clubhouse',
  INSUFFICIENT_BALANCE:     'Not enough coins',
  QUESTION_REQUIRED:        'Say what the bet is',
  QUESTION_TOO_LONG:        'Keep it to 140 characters',
};

const TEMPLATES = [
  { key: 'gw',    label: 'Who scores more this matchweek?' },
  { key: 'round', label: 'Loser buys the round' },
  { key: 'group', label: 'Ask the whole clubhouse' },
];

const winnerTakes = stake => Math.floor(stake * 2 * RAKE_KEEP);

// ── Small pieces ──────────────────────────────────────────────────────────────

function Btn({ kind = 'ghost', onClick, disabled, children, small }) {
  const styles = {
    primary: { background: 'var(--accent)', color: 'var(--on-accent)', border: '1px solid var(--accent)' },
    gold:    { background: 'var(--gold)', color: 'var(--on-accent)', border: '1px solid var(--gold)' },
    ghost:   { background: 'transparent', color: 'var(--text)', border: '1px solid var(--rule)' },
    danger:  { background: 'transparent', color: 'var(--neg)', border: '1px solid var(--neg)' },
    purple:  { background: 'transparent', color: 'var(--purple)', border: '1px solid var(--purple)' },
    link:    { background: 'transparent', color: 'var(--accent)', border: '1px solid transparent' },
  }[kind];
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        ...styles, minHeight: small ? 36 : 'var(--tap)', padding: small ? '0 10px' : '0 14px',
        borderRadius: 'var(--radius)', fontSize: 'var(--fs-label)', fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap',
      }}>{children}</button>
  );
}

function SectionHead({ title, count, tone }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 9px' }}>
      {tone === 'live' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--neg)' }} />}
      <h2 style={{ margin: 0, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--text)' }}>{title}</h2>
      {count > 0 && (
        <span className="num" style={{ fontSize: 'var(--fs-micro)', fontWeight: 700, padding: '1px 8px', borderRadius: 100, background: 'var(--gbg)', color: 'var(--gold-text)' }}>{count}</span>
      )}
    </div>
  );
}

function Empty({ children }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '14px 16px', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
      {children}
    </div>
  );
}

function nameIndex(name) {
  let h = 0;
  for (const ch of name ?? '?') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function Faces({ names }) {
  return (
    <div style={{ display: 'flex', flexShrink: 0 }}>
      {names.slice(0, 2).map((n, i) => (
        <div key={i} style={{ marginLeft: i ? -8 : 0, borderRadius: '50%', boxShadow: '0 0 0 2px var(--card)' }}>
          <MemberAvatar username={n} index={nameIndex(n)} size={30} />
        </div>
      ))}
    </div>
  );
}

function Tag({ tone, children }) {
  const t = {
    won:      { background: 'var(--pbg)', color: 'var(--pos)' },
    lost:     { background: 'var(--nbg)', color: 'var(--neg)' },
    returned: { background: 'var(--elev)', color: 'var(--mute)' },
    disputed: { background: 'rgba(140,73,201,.10)', color: 'var(--purple)' },
  }[tone] ?? { background: 'var(--elev)', color: 'var(--mute)' };
  return <span style={{ ...t, fontSize: 'var(--fs-micro)', fontWeight: 700, padding: '2px 8px', borderRadius: 100, whiteSpace: 'nowrap' }}>{children}</span>;
}

function DeadlineBar({ from, to }) {
  if (!to) return null;
  const start = new Date(from ?? Date.now()).getTime();
  const end = new Date(to).getTime();
  const left = Math.max(0, Math.min(1, (end - Date.now()) / Math.max(1, end - start)));
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--elev)', overflow: 'hidden' }}>
        <div style={{ width: `${left * 100}%`, height: '100%', background: left < 0.2 ? 'var(--neg)' : 'var(--gold)' }} />
      </div>
      <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', whiteSpace: 'nowrap' }}>{timeUntil(to)}</span>
    </div>
  );
}

function ScoreLine({ totals, myName = 'You', theirName }) {
  if (!totals) return null;
  const diff = (totals.mine ?? 0) - (totals.theirs ?? 0);
  const total = Math.max(1, (totals.mine ?? 0) + (totals.theirs ?? 0));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 'var(--fs-label)' }}>
        <span style={{ color: diff >= 0 ? 'var(--pos)' : 'var(--text)', fontWeight: 700 }}>{myName} <span className="num">{totals.mine ?? 0}</span></span>
        <span style={{ color: 'var(--mute)' }}>vs</span>
        <span style={{ color: diff < 0 ? 'var(--neg)' : 'var(--text)', fontWeight: 700 }}><span className="num">{totals.theirs ?? 0}</span> {theirName}</span>
        <span style={{ marginLeft: 'auto', fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{totals.final ? 'final' : 'live'}</span>
      </div>
      <div style={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', background: 'var(--elev)' }}>
        <div style={{ width: `${((totals.mine ?? 0) / total) * 100}%`, background: 'var(--pos)' }} />
        <div style={{ flex: 1, background: 'var(--rule)' }} />
      </div>
    </div>
  );
}

// One bet in a list. `entry` is built by buildEntries below.
function BetRow({ entry, circleName, showCircle, selected, onOpen }) {
  return (
    <div style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px',
      borderTop: '1px solid var(--rule)', background: selected ? 'var(--gbg)' : 'transparent',
    }}>
      <Faces names={entry.faces} />
      <button type="button" onClick={onOpen} aria-label={`Open the conversation about: ${entry.sentence}`}
        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}>
        <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{entry.sentence}</div>
        <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <CoinAmt amount={entry.stake} size="sm" color="var(--gold-text)" />
          <span>· {entry.sub}</span>
          {showCircle && circleName && <span>· {circleName}</span>}
        </div>
        {entry.totals && <ScoreLine totals={entry.totals} theirName={entry.other} />}
      </button>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '45%' }}>
        {entry.tag && <Tag tone={entry.tag.tone}>{entry.tag.label}</Tag>}
        {entry.amount != null && (
          <span className="num" style={{ ...HEAD, fontSize: 'var(--fs-label)', color: entry.amount > 0 ? 'var(--pos)' : entry.amount < 0 ? 'var(--neg)' : 'var(--mute)' }}>
            {entry.amount > 0 ? '+' : ''}{entry.amount}
          </span>
        )}
        {entry.actions?.map(a => <Btn key={a.label} kind={a.kind} small onClick={a.run} disabled={a.disabled}>{a.label}</Btn>)}
      </div>
    </div>
  );
}

function MoveCard({ entry, circleName, showCircle, onTalk }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--rule)', borderLeft: '3px solid var(--gold)',
      borderRadius: 'var(--radius)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10,
      minWidth: 0, scrollSnapAlign: 'start',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <Faces names={entry.faces} />
        <div style={{ flex: 1, minWidth: 0, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
          {entry.lead}{showCircle && circleName ? ` · ${circleName}` : ''}
        </div>
        <CoinAmt amount={entry.stake} size="sm" color="var(--gold-text)" />
      </div>
      <div style={{ fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--text)', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{entry.sentence}</div>
      {entry.note && <div style={{ fontSize: 'var(--fs-label)', color: 'var(--text2)' }}>{entry.note}</div>}
      <DeadlineBar from={entry.from} to={entry.deadline} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {entry.actions.map(a => <Btn key={a.label} kind={a.kind} onClick={a.run} disabled={a.disabled}>{a.label}</Btn>)}
        <Btn kind="link" onClick={onTalk}>Talk</Btn>
      </div>
    </div>
  );
}

// ── Composer ──────────────────────────────────────────────────────────────────

function BetComposer({ circles, defaultCircleId, userId, balance, onPut, onTemplate, busy, inputRef }) {
  const [circleId, setCircleId] = useState(() => (circles.some(c => c.id === defaultCircleId) ? defaultCircleId : circles[0]?.id ?? null));
  const [members, setMembers] = useState([]);
  const [opponentId, setOpponentId] = useState('');
  const [stake, setStake] = useState(50);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!circleId) return undefined;
    let alive = true;
    supabase.from('circle_members').select('user_id, role, users(username)').eq('circle_id', circleId)
      .then(({ data }) => {
        if (!alive) return;
        const list = (data ?? []).filter(m => m.user_id !== userId)
          .map(m => ({ user_id: m.user_id, role: m.role, username: m.users?.username ?? '?' }))
          .sort((a, b) => a.username.localeCompare(b.username));
        setMembers(list);
        setOpponentId(prev => (list.some(m => m.user_id === prev) ? prev : list[0]?.user_id ?? ''));
      });
    return () => { alive = false; };
  }, [circleId, userId]);

  const circle = circles.find(c => c.id === circleId);
  const opponent = members.find(m => m.user_id === opponentId);
  const stakeNum = Number(stake) || 0;
  const question = text.trim();

  function check(open) {
    if (!circleId) return 'Pick a clubhouse';
    if (!open && !opponentId) return 'Pick who you are betting';
    if (!question) return 'Say what the bet is';
    if (question.length > MAX_QUESTION) return 'Keep it to 140 characters';
    if (stakeNum < MIN_STAKE || stakeNum > MAX_STAKE) return `Stake between ${MIN_STAKE} and ${MAX_STAKE} coins`;
    if (stakeNum > balance) return 'Not enough coins';
    return '';
  }

  async function put(open) {
    const problem = check(open);
    setError(problem);
    if (problem) return;
    const ok = await onPut({ circleId, opponentId: open ? null : opponentId, stakeCoins: stakeNum, question });
    if (ok) setText('');
  }

  const sel = {
    minHeight: 36, padding: '0 8px', borderRadius: 'var(--radius)', border: '1px solid var(--rule)',
    background: 'var(--elev)', color: 'var(--text)', fontSize: 'var(--fs-body)', fontWeight: 600, maxWidth: '100%',
  };

  return (
    <section aria-label="New bet" style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--text)' }}>New bet</span>
        {circles.length > 1 ? (
          <select aria-label="Clubhouse" value={circleId ?? ''} onChange={e => setCircleId(e.target.value)} style={{ ...sel, fontSize: 'var(--fs-label)' }}>
            {circles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        ) : (
          <span style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>in {circle?.name}</span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 'var(--fs-body)', color: 'var(--text)' }}>
        <span>I bet</span>
        <select aria-label="Who you are betting" value={opponentId} onChange={e => setOpponentId(e.target.value)} style={sel}>
          {members.length === 0 && <option value="">nobody yet</option>}
          {members.map(m => <option key={m.user_id} value={m.user_id}>{m.username}</option>)}
        </select>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, ...sel, padding: '0 8px' }}>
          <Ci size="sm" />
          <input aria-label="Stake in coins" type="number" inputMode="numeric" min={MIN_STAKE} max={MAX_STAKE} value={stake}
            onChange={e => setStake(e.target.value)}
            style={{ width: 52, border: 'none', background: 'transparent', color: 'var(--gold-text)', fontWeight: 700, fontSize: 'var(--fs-body)', outline: 'none' }} />
        </span>
        <span>that</span>
      </div>
      <textarea ref={inputRef} aria-label="What the bet is" value={text} maxLength={MAX_QUESTION} rows={2}
        onChange={e => setText(e.target.value)} placeholder="Spurs drop points at home on Saturday"
        style={{ width: '100%', boxSizing: 'border-box', resize: 'none', padding: '9px 11px', borderRadius: 'var(--radius)', border: '1px solid var(--rule)', background: 'var(--elev)', color: 'var(--text)', fontSize: 'var(--fs-body)', fontFamily: 'inherit', outline: 'none' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 'var(--fs-micro)', color: 'var(--mute)', flexWrap: 'wrap' }}>
        <span className="num">{question.length} / {MAX_QUESTION}</span>
        <span>You settle it · {opponent?.username ?? 'they'} can dispute</span>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {TEMPLATES.filter(t => t.key !== 'group' || circle?.p2p_betting_enabled).map(t => (
          <button key={t.key} type="button"
            onClick={() => (t.key === 'round' ? setText(prev => (prev ? prev : 'the loser buys the round')) : onTemplate(t.key, { circleId, opponentId, stakeCoins: stakeNum }))}
            style={{ minHeight: 32, padding: '0 11px', borderRadius: 100, border: '1px solid var(--rule)', background: 'var(--elev)', color: 'var(--text2)', fontSize: 'var(--fs-micro)', fontWeight: 600, cursor: 'pointer' }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div role="alert" style={{ fontSize: 'var(--fs-label)', color: 'var(--neg)' }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn kind="gold" onClick={() => put(false)} disabled={busy}>Put it to {opponent?.username ?? '…'}</Btn>
        <Btn kind="ghost" onClick={() => put(true)} disabled={busy}>Open it to anyone</Btn>
      </div>
    </section>
  );
}

// ── Coins card ────────────────────────────────────────────────────────────────

function CoinsCard({ wallet, onHistory }) {
  const balance = wallet?.balance ?? 0;
  const escrow = wallet?.escrow ?? 0;
  const txs = (wallet?.transactions ?? []).slice(0, 4);
  return (
    <section aria-label="Your coins" style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
      <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Your coins</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <Ci size="lg" />
        <span className="num" style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: 'var(--gold-text)' }}>{balance.toLocaleString()}</span>
      </div>
      <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2 }}>
        <span className="num">{escrow.toLocaleString()}</span> on the table · <span className="num">{balance.toLocaleString()}</span> free
      </div>
      {txs.length > 0 && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--rule)' }}>
          {txs.map((tx, i) => {
            const meta = TX_META[tx.type] ?? { label: tx.type, color: 'var(--mute)' };
            const credit = ['purchase', 'win', 'refund', 'admin'].includes(tx.type);
            return (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--rule)', fontSize: 'var(--fs-label)' }}>
                <span style={{ color: 'var(--text2)' }}>{meta.label} <span style={{ color: 'var(--mute)' }}>· {timeAgo(tx.created_at)}</span></span>
                <span className="num" style={{ fontWeight: 700, color: credit ? 'var(--pos)' : 'var(--neg)' }}>{credit ? '+' : '-'}{tx.amount}</span>
              </div>
            );
          })}
        </div>
      )}
      <div style={{ marginTop: 6 }}><Btn kind="link" small onClick={onHistory}>History →</Btn></div>
    </section>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BetsScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { myCircles = [], activeCircleId } = useClubhouseContext();
  const { wallet, refetch: refetchWallet } = useWallet(userId);

  const circles = useMemo(() => (myCircles ?? []).filter(c => !c.archived), [myCircles]);
  const circleIds = useMemo(() => circles.map(c => c.id), [circles]);
  const bettingIds = useMemo(() => circles.filter(c => c.p2p_betting_enabled).map(c => c.id), [circles]);
  const ownerKey = circles.filter(c => c.role === 'owner').map(c => c.id).join(',');
  const isOwnerOf = useCallback(id => ownerKey.split(',').includes(id), [ownerKey]);
  const circleById = useMemo(() => new Map(circles.map(c => [c.id, c])), [circles]);

  const ch = useChallenges(userId, null, { openCircleIds: circleIds });
  const gb = useGroupBets(userId, bettingIds);
  const all = useAllBets(
    { incoming: ch.incoming, outgoing: ch.outgoing, active: ch.active, disputed: ch.disputed, history: ch.history, openChallenges: ch.openChallenges, loading: ch.loading },
    { openInvited: gb.openInvited, myOpenJoined: gb.myOpenJoined, closedAwaitingDeclare: gb.closedAwaitingDeclare, closedAwaitingResolution: gb.closedAwaitingResolution, disputed: gb.disputed, history: gb.history, loading: gb.loading },
    { isOwner: isOwnerOf, userId },
  );
  const { totals } = useChallengeLiveTotals(ch.challenges, userId);

  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectedKey, setSelectedKey] = useState(null);
  const [threadOpen, setThreadOpen] = useState(false); // phone: full-screen thread
  const [declaringChallenge, setDeclaringChallenge] = useState(null);
  const [arbitratingChallenge, setArbitratingChallenge] = useState(null);
  const [answeringBet, setAnsweringBet] = useState(null);
  const [declaringBet, setDeclaringBet] = useState(null);
  const [arbitratingBet, setArbitratingBet] = useState(null);
  const [cancellingBet, setCancellingBet] = useState(null);
  const [disputingBet, setDisputingBet] = useState(null);
  const [gwSeed, setGwSeed] = useState(null);       // { circleId, opponentId, stakeCoins, leagues, members }
  const [groupSeed, setGroupSeed] = useState(null); // { circleId, members }
  const composerRef = useRef(null);

  const showToast = useCallback((msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const run = useCallback(async (fn, ok, mapError = m => m) => {
    setBusy(true);
    try { await fn(); if (ok) showToast(ok); refetchWallet?.(); }
    catch (e) { showToast(mapError(e.message), true); }
    setBusy(false);
  }, [showToast, refetchWallet]);

  // ── Turn every challenge and group bet into a list entry ────────────────────
  const sections = useMemo(() => {
    const waiting = [];
    const live = [];
    const result = [];
    const settled = [];
    const otherOf = c => (c.challenger_id === userId ? c.opponent_username : c.challenger_username) ?? 'Someone';
    const sentenceOf = c => (c.bet_type === 'freeform' ? c.question : `Who scores more in ${gwLabel(c.matchday_id)}`);
    const cBase = (c, kind = 'challenge') => ({
      key: `c-${c.id}`, kind, item: c, circleId: c.circle_id, stake: c.stake_coins,
      sentence: sentenceOf(c), other: otherOf(c), faces: [otherOf(c), user?.user_metadata?.username ?? 'You'],
      thread: { ref_kind: 'challenge', ref_id: c.id, question: sentenceOf(c), stake_coins: c.stake_coins },
    });
    const bBase = b => ({
      key: `b-${b.id}`, kind: 'bet', item: b, circleId: b.circle_id, stake: b.stake_coins,
      sentence: b.question, other: null, faces: [circleById.get(b.circle_id)?.name ?? 'Clubhouse'],
      thread: { ref_kind: 'bet', ref_id: b.id, question: b.question, stake_coins: b.stake_coins },
    });

    for (const it of all.incoming) {
      if (it.kind === 'challenge') {
        waiting.push({ ...cBase(it), lead: `${otherOf(it)} bet you`, from: it.created_at, deadline: it.expires_at,
          actions: [
            { label: 'Take it', kind: 'gold', run: () => run(() => ch.acceptChallenge(it.id), 'Bet taken — your coins are on the table.') },
            { label: 'Pass', kind: 'ghost', run: () => run(() => ch.declineChallenge(it.id), 'Passed.') },
          ] });
      } else if (it.kind === 'open_challenge') {
        waiting.push({ ...cBase(it, 'open_challenge'), faces: [it.challenger_username ?? '?'], lead: `${it.challenger_username ?? 'Someone'} opened it to anyone`,
          from: it.created_at, deadline: it.expires_at,
          actions: [{ label: 'Take it', kind: 'gold', run: () => run(() => ch.claimChallenge(it.id), 'Yours — now accept it to put your coins down.', m => CLAIM_ERRORS[m] ?? m) }] });
      } else {
        waiting.push({ ...bBase(it), lead: `${it.participant_count ?? 0} in · whole clubhouse`, from: it.created_at, deadline: it.ends_at,
          actions: [
            { label: 'Join', kind: 'gold', run: () => run(() => gb.joinBet(it.id), 'Joined — your coins are on the table.', friendlyBetError) },
            { label: 'Pass', kind: 'ghost', run: () => run(() => gb.declineBet(it.id), 'Passed.', friendlyBetError) },
          ] });
      }
    }

    for (const it of all.live) {
      if (it.kind === 'challenge' && it.status === 'disputed') {
        result.push({ ...cBase(it), sub: `vs ${otherOf(it)}`, tag: { tone: 'disputed', label: 'Disputed' } });
      } else if (it.kind === 'challenge' && it.bet_type === 'gw_total') {
        live.push({ ...cBase(it), sub: `vs ${otherOf(it)} · ${gwLabel(it.matchday_id)}`, totals: totals.get(it.id) ?? null });
      } else if (it.kind === 'challenge') {
        if (!it.proposed_by) {
          live.push({ ...cBase(it), sub: `vs ${otherOf(it)}`, actions: [{ label: 'Declare result', kind: 'ghost', run: () => setDeclaringChallenge(it) }] });
        } else if (it.proposed_by === userId) {
          result.push({ ...cBase(it), sub: `waiting for ${otherOf(it)} to confirm` });
        } else {
          const said = it.proposed_winner_id == null ? 'a draw, stakes back' : it.proposed_winner_id === userId ? 'you won' : `${it.proposed_winner_username ?? otherOf(it)} won`;
          waiting.push({ ...cBase(it), lead: `${otherOf(it)} says ${said}`, deadline: it.dispute_deadline, from: it.proposed_at,
            actions: [
              { label: 'Confirm', kind: 'gold', run: () => run(() => ch.confirmResult(it.id), 'Confirmed — coins settled.') },
              { label: 'Dispute', kind: 'danger', run: () => run(() => ch.disputeResult(it.id), 'Disputed — the Clubhouse owner will decide.') },
            ] });
        }
      } else {
        const mine = it.creator_id === userId;
        live.push({ ...bBase(it), sub: `${it.participant_count ?? 0} in${it.ends_at ? ` · ${timeUntil(it.ends_at)}` : ''}`,
          actions: [
            { label: 'Answer', kind: 'ghost', run: () => setAnsweringBet(it) },
            ...(mine ? [
              { label: 'Close', kind: 'ghost', run: () => run(() => gb.closeBet(it.id), 'Betting closed — now declare the result.', friendlyBetError) },
              { label: 'Cancel', kind: 'danger', run: () => setCancellingBet(it) },
            ] : []),
          ] });
      }
    }

    for (const it of all.sent) {
      result.push({ ...cBase(it), sub: it.opponent_id ? `waiting for ${otherOf(it)} to take it` : 'open to anyone',
        actions: [{ label: 'Cancel', kind: 'ghost', run: () => run(() => ch.cancelChallenge(it.id), 'Cancelled — coins returned.') }] });
    }
    for (const it of all.awaitingOutcome) {
      const mine = it.creator_id === userId;
      const actions = it.declared_at
        ? (!mine ? [{ label: 'Dispute', kind: 'danger', run: () => setDisputingBet(it) }] : [])
        : (mine ? [{ label: 'Declare result', kind: 'gold', run: () => setDeclaringBet(it) }] : []);
      result.push({ ...bBase(it), sub: it.declared_at ? 'result declared · open to objections' : mine ? 'betting closed' : 'the creator declares the result', actions });
    }
    for (const it of all.disputedBets) {
      const owner = isOwnerOf(it.circle_id);
      (owner ? waiting : result).push({
        ...bBase(it), sub: 'disputed', lead: 'Disputed — you decide', tag: owner ? null : { tone: 'disputed', label: 'Disputed' },
        actions: owner ? [{ label: 'Decide', kind: 'purple', run: () => setArbitratingBet(it) }] : [],
      });
    }
    for (const it of all.ownerArbitration) {
      waiting.push({ ...cBase(it), faces: [it.challenger_username ?? '?', it.opponent_username ?? '?'],
        lead: `${it.challenger_username} and ${it.opponent_username} disagree — you decide`,
        actions: [{ label: 'Decide', kind: 'purple', run: () => setArbitratingChallenge(it) }] });
    }

    const when = x => new Date(x.resolved_at ?? x.updated_at ?? x.created_at).getTime();
    for (const it of [...all.history].sort((a, b) => when(b) - when(a))) {
      if (it.kind === 'challenge') {
        const won = it.winner_id === userId;
        const lost = it.status === 'resolved' && it.winner_id && !won;
        settled.push({ ...cBase(it), sub: `vs ${otherOf(it)} · ${new Date(when(it)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}`,
          tag: won ? { tone: 'won', label: 'Won' } : lost ? { tone: 'lost', label: 'Lost' } : { tone: 'returned', label: it.status === 'resolved' ? 'Returned' : it.status === 'declined' ? 'Passed' : 'Returned' },
          amount: won ? winnerTakes(it.stake_coins) - it.stake_coins : lost ? -it.stake_coins : null,
          totals: it.bet_type === 'gw_total' ? totals.get(it.id) ?? null : null });
      } else {
        settled.push({ ...bBase(it), sub: new Date(when(it)).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
          tag: it.status === 'cancelled' ? { tone: 'returned', label: 'Returned' } : { tone: 'returned', label: 'Settled' } });
      }
    }
    return { waiting, live, result, settled };
  }, [all, ch, gb, run, totals, userId, user, isOwnerOf, circleById]);

  const netWL = all.history.reduce((sum, c) => {
    if (c.kind !== 'challenge') return sum;
    if (c.winner_id === userId) return sum + winnerTakes(c.stake_coins) - c.stake_coins;
    if (c.status === 'resolved' && c.winner_id) return sum - c.stake_coins;
    return sum;
  }, 0);

  const inFilter = e => filter === 'all' || e.circleId === filter;
  const shown = {
    waiting: sections.waiting.filter(inFilter),
    live: sections.live.filter(inFilter),
    result: sections.result.filter(inFilter),
    settled: sections.settled.filter(inFilter).slice(0, 6),
  };
  const everyEntry = [...sections.waiting, ...sections.live, ...sections.result, ...sections.settled];
  const countFor = id => everyEntry.filter(e => e.circleId === id && !e.tag?.tone?.match(/won|lost|returned/)).length;

  // Desktop shows a thread beside the lists; pick the first open bet until the user picks one.
  const fallbackKey = !isMobile ? (shown.waiting[0] ?? shown.live[0] ?? shown.result[0])?.key ?? null : null;
  const activeKey = selectedKey && everyEntry.some(e => e.key === selectedKey) ? selectedKey : fallbackKey;
  const selected = everyEntry.find(e => e.key === activeKey) ?? null;
  const showCircle = circles.length > 1 && filter === 'all';

  function openThread(entry) {
    setSelectedKey(entry.key);
    if (isMobile) setThreadOpen(true);
  }

  async function handlePut({ circleId, opponentId, stakeCoins, question }) {
    setBusy(true);
    try {
      await ch.createChallenge({ circleId, betType: 'freeform', opponentId, stakeCoins, question });
      showToast(opponentId ? 'Bet sent.' : 'Bet opened to the whole clubhouse.');
      refetchWallet?.();
      setBusy(false);
      return true;
    } catch (e) {
      showToast(CREATE_ERRORS[e.message] ?? e.message, true);
      setBusy(false);
      return false;
    }
  }

  async function handleTemplate(key, { circleId, opponentId, stakeCoins }) {
    const [{ data: mem }, comp] = await Promise.all([
      supabase.from('circle_members').select('user_id, role, joined_at, users(username)').eq('circle_id', circleId),
      key === 'gw' ? supabase.rpc('get_clubhouse_competitions', { p_circle_id: circleId }) : Promise.resolve({ data: null }),
    ]);
    const members = (mem ?? []).map(m => ({ user_id: m.user_id, role: m.role, joined_at: m.joined_at, username: m.users?.username ?? '?' }));
    if (key === 'gw') {
      const leagues = comp?.data && !comp.data.error ? comp.data.football ?? [] : [];
      setGwSeed({ circleId, opponentId, stakeCoins, members, leagues });
    } else {
      setGroupSeed({ circleId, members });
    }
  }

  function focusComposer() {
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    composerRef.current?.focus({ preventScroll: true });
  }

  if (circles.length === 0 && !ch.loading) {
    return (
      <div style={{ padding: isMobile ? 16 : 26, background: 'var(--bg)', minHeight: '100%' }}>
        <div style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: 'var(--paper)', marginBottom: 8 }}>Bets</div>
        <Empty>
          Bets happen inside a clubhouse. Join one or start your own, then bet your friends from here.
          <div style={{ marginTop: 10 }}><Btn kind="gold" onClick={() => navigate('/clubhouse')}>Find a clubhouse</Btn></div>
        </Empty>
      </div>
    );
  }

  const loading = ch.loading || gb.loading;
  const waitingCount = sections.waiting.length;

  const threadHeader = selected?.item?.bet_type === 'gw_total' ? (
    <>
      <ScoreLine totals={selected.totals ?? totals.get(selected.item.id)} theirName={selected.other} />
      <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 6 }}>
        {selected.stake} from {selected.other} · {selected.stake} from you · winner gets {winnerTakes(selected.stake)}
      </div>
    </>
  ) : selected?.kind === 'challenge' ? (
    <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 4 }}>
      {selected.stake} from {selected.other} · {selected.stake} from you · winner gets {winnerTakes(selected.stake)}
    </div>
  ) : null;
  const threadActions = selected?.actions?.length
    ? selected.actions.map(a => <Btn key={a.label} kind={a.kind} onClick={a.run} disabled={busy || a.disabled}>{a.label}</Btn>)
    : null;

  const list = (entries, empty) => (entries.length === 0 ? <Empty>{empty}</Empty> : (
    <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <div style={{ marginTop: -1 }}>
        {entries.map(e => (
          <BetRow key={e.key} entry={e} circleName={circleById.get(e.circleId)?.name} showCircle={showCircle}
            selected={!isMobile && e.key === activeKey} onOpen={() => openThread(e)} />
        ))}
      </div>
    </div>
  ));

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100%', padding: isMobile ? '14px 16px 96px' : '22px 26px 40px', boxSizing: 'border-box' }}>
      {toast && createPortal(
        <div role="status" style={{
          position: 'fixed', bottom: isMobile ? 96 : 24, left: '50%', transform: 'translateX(-50%)', maxWidth: 'calc(100vw - 32px)',
          background: toast.isError ? 'var(--neg)' : 'var(--paper)', color: toast.isError ? 'var(--on-accent)' : 'var(--bg)',
          padding: '12px 20px', borderRadius: 'var(--radius)', fontSize: 'var(--fs-label)', zIndex: 999, boxShadow: '0 8px 28px rgba(0,0,0,.25)',
        }}>{toast.msg}</div>,
        document.body,
      )}

      {/* Header */}
      <header style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>Bets · {circles.length} {circles.length === 1 ? 'clubhouse' : 'clubhouses'}</div>
          {isMobile && (
            <button type="button" onClick={() => navigate('/wallet')} aria-label="Your coins"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 10px', borderRadius: 100, border: '1px solid var(--rule)', background: 'var(--card)', cursor: 'pointer' }}>
              <Ci size="sm" /><span className="num" style={{ fontWeight: 700, fontSize: 'var(--fs-label)', color: 'var(--gold-text)' }}>{(wallet?.balance ?? 0).toLocaleString()}</span>
            </button>
          )}
        </div>
        <h1 style={{ ...HEAD, margin: '4px 0 10px', fontSize: isMobile ? 'var(--fs-heading)' : 'var(--fs-title)', color: 'var(--paper)', lineHeight: 1.1 }}>
          {waitingCount > 0
            ? <><span style={{ color: 'var(--gold-text)' }}>{waitingCount} {waitingCount === 1 ? 'bet' : 'bets'}</span> {waitingCount === 1 ? 'is' : 'are'} waiting on you.</>
            : 'Nothing is waiting on you.'}
        </h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['In play', sections.live.length],
            ['On the table', (wallet?.escrow ?? 0).toLocaleString()],
            ['Net, last 30 days', `${netWL > 0 ? '+' : ''}${netWL.toLocaleString()}`],
          ].map(([label, value]) => (
            <span key={label} style={{ display: 'inline-flex', gap: 6, alignItems: 'baseline', padding: '5px 11px', borderRadius: 100, background: 'var(--card)', border: '1px solid var(--rule)', fontSize: 'var(--fs-label)' }}>
              <span style={{ color: 'var(--mute)' }}>{label}</span>
              <span className="num" style={{ fontWeight: 700, color: 'var(--text)' }}>{value}</span>
            </span>
          ))}
        </div>
        {circles.length > 1 && (
          <div role="tablist" aria-label="Clubhouse" style={{ display: 'flex', gap: 6, marginTop: 12, overflowX: 'auto', paddingBottom: 2 }}>
            {[{ id: 'all', name: 'All' }, ...circles].map(c => {
              const on = filter === c.id;
              const n = c.id === 'all' ? null : countFor(c.id);
              return (
                <button key={c.id} role="tab" aria-selected={on} type="button" onClick={() => setFilter(c.id)}
                  style={{ flexShrink: 0, minHeight: 34, padding: '0 12px', borderRadius: 100, cursor: 'pointer', fontSize: 'var(--fs-label)', fontWeight: 600,
                    border: `1px solid ${on ? 'var(--paper)' : 'var(--rule)'}`, background: on ? 'var(--paper)' : 'var(--card)', color: on ? 'var(--bg)' : 'var(--text)' }}>
                  {c.name}{n ? <span className="num" style={{ marginLeft: 6, opacity: 0.7 }}>{n}</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 340px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <BetComposer circles={circles} defaultCircleId={filter !== 'all' ? filter : activeCircleId} userId={userId}
            balance={wallet?.balance ?? 0} onPut={handlePut} onTemplate={handleTemplate} busy={busy} inputRef={composerRef} />

          {loading ? <LoadingRows rows={4} /> : (
            <>
              <section aria-label="Waiting on you">
                <SectionHead title="Waiting on you" count={shown.waiting.length} />
                {shown.waiting.length === 0 ? <Empty>Nothing needs you right now.</Empty> : (
                  <div style={isMobile
                    ? { display: 'grid', gridAutoFlow: 'column', gridAutoColumns: shown.waiting.length > 1 ? '86%' : '100%', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', paddingBottom: 4 }
                    : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
                    {shown.waiting.map(e => (
                      <MoveCard key={e.key} entry={{ ...e, actions: e.actions.map(a => ({ ...a, disabled: busy })) }}
                        circleName={circleById.get(e.circleId)?.name} showCircle={showCircle} onTalk={() => openThread(e)} />
                    ))}
                  </div>
                )}
              </section>

              <section aria-label="Live now">
                <SectionHead title="Live now" count={shown.live.length} tone="live" />
                {list(shown.live, 'Nothing in play.')}
              </section>

              <section aria-label="Waiting for a result">
                <SectionHead title="Waiting for a result" count={shown.result.length} />
                {list(shown.result, 'Nothing waiting for a result.')}
              </section>

              <section aria-label="Settled">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <SectionHead title="Settled" />
                  <Btn kind="link" small onClick={() => navigate('/my-bets')}>All history →</Btn>
                </div>
                {list(shown.settled, 'Nothing settled yet.')}
              </section>

              <div style={{ border: '1px dashed var(--rule)', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: 'var(--fs-label)', color: 'var(--text2)', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ flex: 1, minWidth: 200 }}>League bets stay inside each league until the season ends. You'll find them on the league's Bets tab.</span>
                <Btn kind="link" small onClick={() => navigate('/league')}>Open it →</Btn>
              </div>
            </>
          )}
        </div>

        {!isMobile && (
          <aside style={{ position: 'sticky', top: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {selected ? (
              <div style={{ height: 460 }}>
                <BetThread key={selected.key} variant="panel" circleId={selected.circleId} userId={userId}
                  betRef={selected.thread} header={threadHeader} actions={threadActions} />
              </div>
            ) : (
              <Empty>Pick a bet to talk about it.</Empty>
            )}
            <CoinsCard wallet={wallet} onHistory={() => navigate('/wallet')} />
          </aside>
        )}
      </div>

      {isMobile && (
        <button type="button" onClick={focusComposer}
          style={{ position: 'fixed', right: 16, bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))', zIndex: 40, minHeight: 48, padding: '0 18px', borderRadius: 100, border: 'none', background: 'var(--gold)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 'var(--fs-body)', boxShadow: '0 6px 20px rgba(0,0,0,.18)', cursor: 'pointer' }}>
          + New bet
        </button>
      )}

      {isMobile && threadOpen && selected && (
        <BetThread key={selected.key} circleId={selected.circleId} userId={userId} betRef={selected.thread}
          header={threadHeader} actions={threadActions} onClose={() => setThreadOpen(false)} />
      )}

      {gwSeed && (
        <CreateChallengeModal
          onClose={() => setGwSeed(null)}
          onCreate={async args => { await ch.createChallenge(args); refetchWallet?.(); }}
          wallet={wallet} circleId={gwSeed.circleId} circleName={circleById.get(gwSeed.circleId)?.name}
          currentUserId={userId} members={gwSeed.members} footballLeagues={gwSeed.leagues}
          forcedBetType="gw_total" initialOpponentId={gwSeed.opponentId} initialStakeCoins={gwSeed.stakeCoins}
        />
      )}
      {groupSeed && (
        <CreateGroupBetModal
          onClose={() => setGroupSeed(null)}
          onCreate={async args => { await gb.createBet(args); refetchWallet?.(); }}
          wallet={wallet} circleId={groupSeed.circleId} circleName={circleById.get(groupSeed.circleId)?.name}
          members={groupSeed.members} currentUserId={userId}
          initialTargetMode="whole_clubhouse"
        />
      )}
      {declaringChallenge && (
        <DeclareResultModal challenge={declaringChallenge} userId={userId} onClose={() => setDeclaringChallenge(null)}
          onSubmit={async winnerId => { await ch.declareResult(declaringChallenge.id, winnerId); showToast('Result declared — waiting for them to confirm.'); }} />
      )}
      {arbitratingChallenge && (
        <ArbitrationModal challenge={arbitratingChallenge} onClose={() => setArbitratingChallenge(null)}
          onSubmit={async winnerId => { await ch.arbitrateResult(arbitratingChallenge.id, winnerId); showToast(winnerId ? 'Decided — coins settled.' : 'Called off — both stakes returned.'); }} />
      )}
      {answeringBet && (
        <SubmitAnswerModal bet={answeringBet} userId={userId} fetchAnswers={gb.fetchAnswers} onClose={() => setAnsweringBet(null)}
          onSubmit={async (betId, payload) => { await gb.submitAnswer(betId, payload); showToast('Answer in.'); }} />
      )}
      {declaringBet && (
        <DeclareOutcomeModal bet={declaringBet} fetchParticipants={gb.fetchParticipants} fetchAnswers={gb.fetchAnswers} onClose={() => setDeclaringBet(null)}
          onSubmit={async (betId, payload) => { await gb.declareOutcome(betId, payload); showToast('Result declared — everyone has 24 hours to object.'); }} />
      )}
      {arbitratingBet && (
        <ArbitrateOutcomeModal bet={arbitratingBet} fetchParticipants={gb.fetchParticipants} fetchAnswers={gb.fetchAnswers} onClose={() => setArbitratingBet(null)}
          onSubmit={async (betId, payload) => { await gb.arbitrateOutcome(betId, payload); showToast('Decided — coins settled.'); refetchWallet?.(); }} />
      )}
      {cancellingBet && (
        <ConfirmModal title="Cancel this bet?" body="Everyone who joined gets their coins back." confirmLabel="Cancel bet" cancelLabel="Keep it" danger
          onConfirm={async () => { const b = cancellingBet; setCancellingBet(null); await run(() => gb.cancelBet(b.id), 'Cancelled — coins returned.', friendlyBetError); }}
          onCancel={() => setCancellingBet(null)} />
      )}
      {disputingBet && (
        <ConfirmModal title="Dispute this result?" body="The Clubhouse owner will look at it and make the final call." confirmLabel="Dispute" cancelLabel="Never mind" danger
          onConfirm={async () => { const b = disputingBet; setDisputingBet(null); await run(() => gb.disputeOutcome(b.id), 'Disputed — the Clubhouse owner will decide.', friendlyBetError); }}
          onCancel={() => setDisputingBet(null)} />
      )}
    </div>
  );
}
