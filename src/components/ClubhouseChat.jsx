import { LoadingRows } from './Skeleton';
import { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';
import { scrollInside } from '../lib/scrollInside';
import { useClubhouseChat } from '../hooks/useClubhouseChat';
import { useRoomReactions, REACTION_EMOJI } from '../hooks/useRoomReactions';
import { IconCheckCircle, IconClose, Icon } from './UiIcons';
import BetThread from './BetThread';
import { useAuth } from '../hooks/useAuth';
import { useWallet } from '../hooks/useWallet';
import { useChallenges } from '../hooks/useChallenges';
import { useGroupBets } from '../hooks/useGroupBets';
import { useClubhouseContext } from '../context/ClubhouseContext';

// The create-a-bet sheet lives in the shared bet kit; load it only when someone taps the dice.
const NewBetModal = lazy(() => import('./bets/BetKit').then(m => ({ default: m.NewBetModal })));

const BODY = { fontFamily: 'Archivo, sans-serif' };

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)    return `${Math.max(0, Math.floor(diff))}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Bet activity card: system message for bet/challenge create + resolve
function BetActivityCard({ msg, actionable, onTake, onPass, busy, onOpen }) {
  const ref = msg.betRef ?? {};
  const isResolved = ref.event === 'resolved';

  return (
    <div style={{ margin: '4px 0', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--rule)' }}>
    <button
      onClick={() => onOpen?.(ref)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
        background: 'transparent', border: 'none',
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', color: isResolved ? 'var(--positive)' : 'var(--accent)' }}>
        {isResolved ? <IconCheckCircle size={18} /> : <Icon name="swords" size={18} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ref.question ?? msg.content}
        </span>
        {ref.stake_coins != null && (
          <span style={{ ...BODY, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
            {ref.stake_coins} coins · {isResolved ? 'resolved' : ref.event === 'taken' ? `${msg.username} took it` : 'new bet'}
          </span>
        )}
      </span>
      <span style={{ ...BODY, fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>VIEW</span>
    </button>
    {actionable && (
      <div style={{ display: 'flex', gap: 8, padding: '0 12px 10px' }}>
        <button
          onClick={onTake} disabled={busy}
          style={{ flex: 1, minHeight: 'var(--tap)', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', opacity: busy ? 0.6 : 1 }}
        >Take it · {ref.stake_coins} coins</button>
        <button
          onClick={onPass} disabled={busy}
          style={{ minHeight: 'var(--tap)', padding: '0 16px', background: 'transparent', color: 'var(--mute)', border: '1px solid var(--rule)', borderRadius: 6, ...BODY, fontSize: 'var(--fs-label)', cursor: 'pointer' }}
        >Pass</button>
      </div>
    )}
    </div>
  );
}

// Reactions under a message: chips for what is there, one button to add more.
function ReactionBar({ reactions = [], open, onToggleOpen, onReact }) {
  const chip = (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 32, padding: '0 10px',
    borderRadius: 16, cursor: 'pointer', ...BODY, fontSize: 'var(--fs-label)',
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--mute)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
  });
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 4 }}>
      {reactions.map(r => (
        <button key={r.emoji} onClick={() => onReact(r.emoji)} aria-pressed={r.mine}
          aria-label={`${r.emoji} ${r.count}${r.mine ? ', yours' : ''}`} style={chip(r.mine)}>
          <span aria-hidden="true">{r.emoji}</span><span>{r.count}</span>
        </button>
      ))}
      {open && REACTION_EMOJI.filter(e => !reactions.some(r => r.emoji === e)).map(e => (
        <button key={e} onClick={() => onReact(e)} aria-label={`React ${e}`} style={chip(false)}>
          <span aria-hidden="true">{e}</span>
        </button>
      ))}
      <button onClick={onToggleOpen} aria-label={open ? 'Close reactions' : 'Add a reaction'} aria-expanded={open}
        style={{ ...chip(false), color: 'var(--mute)' }}>{open ? 'Close' : 'React'}</button>
    </div>
  );
}

// A person-event in the Room: someone joined, a new edition is out.
function MemberActivityRow({ msg }) {
  const edition = msg.betRef?.event === 'edition';
  return (
    <div style={{ margin: '6px 0', padding: '8px 12px', borderLeft: '3px solid var(--rule)', background: 'var(--card)', borderRadius: 'var(--radius)' }}>
      <div style={{ display: 'flex', gap: 8, ...BODY, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{edition ? 'The paper' : 'New face'}</span>
        <span style={{ marginLeft: 'auto' }}>{timeAgo(msg.createdAt)}</span>
      </div>
      <div style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.4, marginTop: 2 }}>
        {edition ? msg.content : `${msg.username} ${msg.content}`}
      </div>
    </div>
  );
}

// Activity row (match results, auctions, news) shown inside the stream
const FEED_LABEL = {
  activity: 'GW result', breaking_news: 'News', auction_result: 'Auction',
  trade_result: 'Trade', draft_report: 'Draft', classified: 'Classified',
};

function ActivityRow({ entry, onEnter }) {
  const label = FEED_LABEL[entry.entry_type] ?? (entry.entry_type ?? '').replace(/_/g, ' ');
  const clickable = !!(onEnter && entry.league_id);
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onEnter({ id: entry.league_id }) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onEnter({ id: entry.league_id }); } : undefined}
      style={{
        margin: '6px 0', padding: '8px 12px', borderLeft: '3px solid var(--accent)', background: 'var(--card)',
        borderRadius: 'var(--radius)', cursor: clickable ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', gap: 8, ...BODY, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
        <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{label}</span>
        {entry.league_name && <span>{entry.league_name}</span>}
        <span style={{ marginLeft: 'auto' }}>{timeAgo(entry.createdAt)}</span>
      </div>
      <div style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.4, marginTop: 2 }}>{entry.headline}</div>
    </div>
  );
}

// Message bubble. Tap a message you can delete to reveal a Delete button
// (works on touch; the old hover-only delete did not).
function MessageBubble({ msg, prevMsg, canDelete, selected, onSelect, onDelete, deleting, betAction, onOpenBet, reactions, pickerOpen, onTogglePicker, onReact }) {
  const showMeta = !prevMsg || prevMsg.kind === 'activity' || prevMsg.userId !== msg.userId;

  const bar = <ReactionBar reactions={reactions} open={pickerOpen} onToggleOpen={onTogglePicker} onReact={onReact} />;
  if (msg.kind === 'bet_activity') return <><BetActivityCard msg={msg} onOpen={onOpenBet} {...(betAction ?? {})} />{bar}</>;
  if (msg.kind === 'member_activity') return <><MemberActivityRow msg={msg} />{bar}</>;

  return (
    <div style={{ padding: showMeta ? '8px 0 2px' : '1px 0' }}>
      {showMeta && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
          <span style={{ ...BODY, fontSize: 'var(--fs-micro)', fontWeight: 700, color: msg.isOwn ? 'var(--accent)' : 'var(--paper)' }}>
            {msg.username}
          </span>
          <span style={{ ...BODY, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{timeAgo(msg.createdAt)}</span>
        </div>
      )}
      <div
        role={canDelete ? 'button' : undefined}
        tabIndex={canDelete ? 0 : undefined}
        onClick={canDelete ? onSelect : undefined}
        onKeyDown={canDelete ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } } : undefined}
        style={{ cursor: canDelete ? 'pointer' : 'default', borderRadius: 6, background: selected ? 'var(--accent-soft)' : 'transparent', padding: selected ? '2px 6px' : 0 }}
      >
        <p style={{ margin: 0, ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.45, wordBreak: 'break-word' }}>
          {msg.content}
        </p>
      </div>
      {bar}
      {selected && canDelete && (
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            onClick={onDelete}
            disabled={deleting}
            style={{ minHeight: 'var(--tap)', padding: '0 14px', background: 'var(--danger)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer' }}
          >
            {deleting ? 'Deleting…' : 'Delete message'}
          </button>
          <button
            onClick={onSelect}
            style={{ minHeight: 'var(--tap)', padding: '0 14px', background: 'transparent', color: 'var(--mute)', border: '1px solid var(--rule)', borderRadius: 6, ...BODY, fontSize: 'var(--fs-label)', cursor: 'pointer' }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// The Room: one stream of chat, bets and activity.
// layout 'rail' = desktop side panel on Home; 'full' = the whole Room view.
export default function ClubhouseChat({ circleId, members, activeCircle, feed = [], onEnterLeague, layout = 'full', anchorRef = null, onExpand, focusMessageId = null, onFocusDone }) {
  const [channelId, setChannelId] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [pickerId, setPickerId] = useState(null);
  const [flashId, setFlashId] = useState(null);

  const isOwner = activeCircle?.role === 'owner';

  // Bets in the Room: create from the message box, take or pass on a card (C-08).
  const { user } = useAuth();
  const { wallet } = useWallet(user?.id);
  const { competitions } = useClubhouseContext();
  const { incoming, acceptChallenge, declineChallenge, createChallenge } = useChallenges(user?.id, circleId);
  const { openInvited, joinBet, declineBet, createBet } = useGroupBets(user?.id, circleId);
  const [showBet, setShowBet] = useState(false);
  const [threadRef, setThreadRef] = useState(null);
  const [betBusy, setBetBusy] = useState(false);
  const betsEnabled = !!activeCircle?.p2p_betting_enabled;

  // A card is actionable only while the bet still waits for this person's answer.
  function betActionFor(msg) {
    const ref = msg.betRef;
    if (msg.kind !== 'bet_activity' || !ref || ref.event !== 'created') return null;
    const isBet = ref.ref_kind === 'bet';
    const open = isBet
      ? openInvited.some(b => b.id === ref.ref_id)
      : incoming.some(c => c.id === ref.ref_id);
    if (!open) return null;
    const run = async (fn) => {
      setBetBusy(true); setError('');
      try { await fn(ref.ref_id); } catch (err) { setError(err.message ?? 'That did not work. Try again.'); }
      finally { setBetBusy(false); }
    };
    return {
      actionable: true, busy: betBusy,
      onTake: () => run(isBet ? joinBet : acceptChallenge),
      onPass: () => run(isBet ? declineBet : declineChallenge),
    };
  }

  // The Room is the default channel; other channels are no longer shown (C-07).
  useEffect(() => {
    if (!circleId) return;
    let cancelled = false;
    setChannelId(null);
    supabase
      .from('clubhouse_channels')
      .select('id, is_default, created_at')
      .eq('circle_id', circleId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled || !data?.length) return;
        setChannelId((data.find(c => c.is_default) ?? data[0]).id);
      });
    return () => { cancelled = true; };
  }, [circleId]);

  const { messages, loading, sendMessage, deleteMessage, scrollEndRef } = useClubhouseChat(channelId);

  // Full layout: the page lines up with the tabs (anchorRef) once, instantly, and the Room
  // fills exactly the rest of the screen, so the composer sits on the bottom edge
  // (owner 2026-11-21: it used to land mid-screen). Re-measured when anything above it
  // changes height (the parent grows) or the viewport resizes.
  const rootRef = useRef(null);
  const [fillH, setFillH] = useState(null);
  const alignTop = useRef(null);   // page offset that puts the tabs at the top
  const userMoved = useRef(false); // stop lining up once the manager scrolls the page
  useEffect(() => {
    if (layout === 'rail') return;
    const el = rootRef.current;
    const main = document.getElementById('main-content');
    if (!el || !main) return;
    const yIn = (node) => node.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
    const anchor = anchorRef?.current;
    userMoved.current = false;
    const moved = () => { userMoved.current = true; };
    main.addEventListener('wheel', moved, { passive: true });
    main.addEventListener('touchmove', moved, { passive: true });
    const measure = () => {
      // #main-content keeps room for the phone bottom nav; desktop (lg) has none
      const padB = window.matchMedia('(min-width: 1024px)').matches ? 0 : (parseFloat(getComputedStyle(main).paddingBottom) || 0);
      // Mobile top bar is sticky inside #main-content and covers the top of it
      const bar = main.querySelector(':scope > .sticky');
      const barH = bar && bar.offsetHeight && getComputedStyle(bar).display !== 'none' ? bar.offsetHeight : 0;
      const top = anchor ? yIn(anchor) - barH : 0;
      alignTop.current = anchor ? top : null;
      setFillH(Math.max(360, Math.floor(main.clientHeight - padB - (yIn(el) - top) - 8)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (el.parentElement) ro.observe(el.parentElement);
    ro.observe(main);
    return () => { ro.disconnect(); main.removeEventListener('wheel', moved); main.removeEventListener('touchmove', moved); };
  }, [layout, anchorRef]);
  // After the new height is on screen the page is tall enough to line up (instant, no glide)
  useEffect(() => {
    if (fillH == null || alignTop.current == null || userMoved.current) return;
    document.getElementById('main-content')?.scrollTo({ top: alignTop.current });
  }, [fillH]);
  const { byMessage: reactionsByMessage, toggle: toggleReaction } = useRoomReactions(channelId, user?.id);

  async function react(messageId, emoji) {
    setError('');
    try { await toggleReaction(messageId, emoji); setPickerId(null); }
    catch { setError('Could not add that reaction. Try again.'); }
  }

  const nameById = useMemo(() => new Map((members ?? []).map(m => [m.user_id, m.username])), [members]);

  // Chat messages and activity entries in one list, oldest first.
  const stream = useMemo(() => {
    const chat = messages.map(m => ({
      ...m,
      username: nameById.get(m.userId) ?? (m.username && m.username !== '?' ? m.username : 'Member'),
    }));
    const act = (feed ?? []).map(e => ({ ...e, kind: 'activity', createdAt: e.created_at }));
    return [...chat, ...act].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }, [messages, feed, nameById]);

  // The hook only scrolls on new chat; also scroll when activity items arrive.
  useEffect(() => {
    if (focusMessageId) return;
    scrollInside(scrollEndRef.current);
  }, [stream.length, scrollEndRef, focusMessageId]);

  // A notice opens the Room on the exact item: scroll to it and light it up briefly.
  useEffect(() => {
    if (!focusMessageId || loading || !channelId) return;
    const found = stream.some(i => i.id === focusMessageId);
    if (found) {
      scrollInside(document.getElementById(`msg-${focusMessageId}`), { block: 'center' });
      setFlashId(focusMessageId);
    }
    onFocusDone?.();
  }, [focusMessageId, loading, channelId, stream, onFocusDone]);

  useEffect(() => {
    if (!flashId) return;
    const t = setTimeout(() => setFlashId(null), 2500);
    return () => clearTimeout(t);
  }, [flashId]);

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    setError('');
    try {
      await sendMessage(text.trim());
      setText('');
    } catch (err) {
      console.error('send failed', err);
      setError('Message not sent. Check your connection and tap Send to try again.');
    } finally {
      setSending(false);
    }
  }

  async function handleDelete(id) {
    setDeletingId(id);
    setError('');
    try {
      await deleteMessage(id);
      setSelectedId(null);
    } catch (err) {
      console.error('delete failed', err);
      setError('Could not delete that message. Try again.');
    } finally {
      setDeletingId(null);
    }
  }

  const isRail = layout === 'rail';
  const empty = !loading && stream.length === 0;

  return (
    <div
      ref={rootRef}
      className={isRail ? undefined : 'room-full'}
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', ...(isRail ? { height: '100%' } : fillH ? { height: fillH } : {}) }}
    >
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>The Room</div>
        {onExpand && (
          <button className="hit-44" onClick={onExpand}
            style={{ background: 'transparent', border: 'none', color: 'var(--accent)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', padding: '2px 4px' }}>
            Open
          </button>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {loading && <LoadingRows rows={3} />}
        {empty && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', ...BODY, fontSize: 'var(--fs-body)', color: 'var(--mute)', textAlign: 'center', padding: '32px 0' }}>
            Nothing here yet. Say hello to start the Room.
          </div>
        )}
        {stream.map((item, i) => item.kind === 'activity' ? (
          <ActivityRow key={`a-${item.id}`} entry={item} onEnter={onEnterLeague} />
        ) : (
          <div key={item.id} id={`msg-${item.id}`} style={{ borderRadius: 8, background: flashId === item.id ? 'var(--accent-soft)' : 'transparent', transition: 'background 0.6s' }}>
          <MessageBubble
            msg={item}
            prevMsg={stream[i - 1] ?? null}
            canDelete={item.kind !== 'bet_activity' && (isOwner || item.isOwn)}
            selected={selectedId === item.id}
            onSelect={() => setSelectedId(selectedId === item.id ? null : item.id)}
            onDelete={() => handleDelete(item.id)}
            deleting={deletingId === item.id}
            betAction={betActionFor(item)}
            onOpenBet={setThreadRef}
            reactions={reactionsByMessage.get(item.id)}
            pickerOpen={pickerId === item.id}
            onTogglePicker={() => setPickerId(pickerId === item.id ? null : item.id)}
            onReact={(emoji) => react(item.id, emoji)}
          />
          </div>
        ))}
        <div ref={scrollEndRef} />
      </div>

      {(openInvited.length > 0 || incoming.length > 0) && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--rule)', background: 'var(--card)', flexShrink: 0 }}>
          <div style={{ ...BODY, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--mute)', marginBottom: 6 }}>
            OPEN BETS · {openInvited.length + incoming.length}
          </div>
          {[...openInvited.map(b => ({ id: b.id, kind: 'bet', question: b.question, stake: b.stake_coins })),
            ...incoming.map(c => ({ id: c.id, kind: 'challenge', question: c.question ?? c.message, stake: c.stake_coins }))]
            .slice(0, 3).map(b => (
              <div key={`${b.kind}-${b.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--paper)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.question}</span>
                <span style={{ ...BODY, fontSize: 'var(--fs-micro)', color: 'var(--mute)', flexShrink: 0 }}>{b.stake} coins</span>
                <button
                  disabled={betBusy}
                  onClick={async () => {
                    setBetBusy(true); setError('');
                    try { await (b.kind === 'bet' ? joinBet(b.id) : acceptChallenge(b.id)); }
                    catch (err) { setError(err.message ?? 'That did not work. Try again.'); }
                    finally { setBetBusy(false); }
                  }}
                  style={{ minHeight: 'var(--tap)', padding: '0 12px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer' }}
                >Take</button>
              </div>
            ))}
        </div>
      )}

      {error && (
        <div role="alert" style={{ padding: '8px 16px', background: 'var(--card)', borderTop: '1px solid var(--rule)', ...BODY, fontSize: 'var(--fs-label)', color: 'var(--danger)', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span>{error}</span>
          <button className="hit-44" onClick={() => setError('')} aria-label="Dismiss"
            style={{ background: 'transparent', border: 'none', color: 'var(--mute)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <IconClose size={14} />
          </button>
        </div>
      )}

      <form onSubmit={handleSend} style={{ padding: '10px 16px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          onClick={() => setShowBet(true)}
          title="Make a bet"
          aria-label="Make a bet"
          style={{ flexShrink: 0, minWidth: 'var(--tap)', minHeight: 'var(--tap)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer' }}
        >
          <Icon name="swords" size={20} />
        </button>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
          placeholder="Message the Room…"
          aria-label="Message the Room"
          maxLength={2000}
          style={{ flex: 1, padding: '9px 12px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--paper)', ...BODY, fontSize: 'var(--fs-body)', outline: 'none', minWidth: 0 }}
        />
        <button
          type="submit"
          disabled={!text.trim() || sending || !channelId}
          style={{ padding: '9px 14px', minHeight: 'var(--tap)', background: !text.trim() || sending ? 'var(--mute)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, ...BODY, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', cursor: !text.trim() || sending ? 'default' : 'pointer', flexShrink: 0 }}
        >
          {sending ? '…' : 'SEND'}
        </button>
      </form>
      {threadRef && (
        <BetThread channelId={channelId} userId={user?.id} betRef={threadRef} onClose={() => setThreadRef(null)} />
      )}
      {showBet && (
        <Suspense fallback={null}>
          <NewBetModal
            onClose={() => setShowBet(false)}
            onCreateChallenge={createChallenge}
            onCreateBet={createBet}
            wallet={wallet}
            circleId={circleId}
            circleName={activeCircle?.name}
            currentUserId={user?.id}
            members={members}
            footballLeagues={competitions?.football}
            betsEnabled={betsEnabled}
          />
        </Suspense>
      )}
    </div>
  );
}
