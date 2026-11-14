import { LoadingRows } from './Skeleton';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClubhouseChat } from '../hooks/useClubhouseChat';
import { IconCheckCircle, IconDice, IconClose } from './UiIcons';

const BODY = { fontFamily: 'Archivo, sans-serif' };

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)    return `${Math.max(0, Math.floor(diff))}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// Bet activity card: system message for bet/challenge create + resolve
function BetActivityCard({ msg }) {
  const navigate = useNavigate();
  const ref = msg.betRef ?? {};
  const isResolved = ref.event === 'resolved';

  return (
    <button
      onClick={() => navigate('/challenges?tab=bets')}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        padding: '9px 12px', margin: '4px 0', borderRadius: 8, cursor: 'pointer',
        background: 'var(--card)', border: '1px solid var(--rule)',
      }}
    >
      <span style={{ flexShrink: 0, display: 'flex', color: isResolved ? 'var(--positive)' : 'var(--accent)' }}>
        {isResolved ? <IconCheckCircle size={18} /> : <IconDice size={18} />}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {ref.question ?? msg.content}
        </span>
        {ref.stake_coins != null && (
          <span style={{ ...BODY, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
            {ref.stake_coins} coins · {isResolved ? 'resolved' : 'new bet'}
          </span>
        )}
      </span>
      <span style={{ ...BODY, fontSize: 'var(--fs-micro)', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>VIEW</span>
    </button>
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
function MessageBubble({ msg, prevMsg, canDelete, selected, onSelect, onDelete, deleting }) {
  const showMeta = !prevMsg || prevMsg.kind === 'activity' || prevMsg.userId !== msg.userId;

  if (msg.kind === 'bet_activity') return <BetActivityCard msg={msg} />;

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
export default function ClubhouseChat({ circleId, members, activeCircle, feed = [], onEnterLeague, layout = 'full', onExpand }) {
  const navigate = useNavigate();
  const [channelId, setChannelId] = useState(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const isOwner = activeCircle?.role === 'owner';

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
  useEffect(() => { scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [stream.length, scrollEndRef]);

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
      className={isRail ? undefined : 'room-full'}
      style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', ...(isRail ? { height: '100%' } : {}) }}
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
          <MessageBubble
            key={item.id}
            msg={item}
            prevMsg={stream[i - 1] ?? null}
            canDelete={item.kind !== 'bet_activity' && (isOwner || item.isOwn)}
            selected={selectedId === item.id}
            onSelect={() => setSelectedId(selectedId === item.id ? null : item.id)}
            onDelete={() => handleDelete(item.id)}
            deleting={deletingId === item.id}
          />
        ))}
        <div ref={scrollEndRef} />
      </div>

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
          onClick={() => navigate('/challenges?tab=bets&new=1')}
          title="Make a bet"
          aria-label="Make a bet"
          style={{ flexShrink: 0, minWidth: 'var(--tap)', minHeight: 'var(--tap)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--accent)', cursor: 'pointer' }}
        >
          <IconDice size={20} />
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
    </div>
  );
}
