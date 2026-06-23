import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useClubhouseChat } from '../hooks/useClubhouseChat';
import { useDirectMessages } from '../hooks/useDirectMessages';

const MONO = { fontFamily: 'JetBrains Mono, monospace' };
const BODY = { fontFamily: 'Archivo, sans-serif' };

function timeAgo(iso) {
  const diff = (Date.now() - new Date(iso)) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Message bubble ────────────────────────────────────────────────────────────
function MessageBubble({ msg, prevMsg, onDelete }) {
  const [hovering, setHovering] = useState(false);
  const showMeta = !prevMsg || prevMsg.userId !== msg.userId;

  return (
    <div
      style={{ padding: showMeta ? '8px 0 2px' : '1px 0', position: 'relative' }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {showMeta && (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
          <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: msg.isOwn ? 'var(--accent)' : 'var(--paper)' }}>
            {msg.username ?? msg.isOwn ? (msg.username || 'You') : '?'}
          </span>
          <span style={{ ...MONO, fontSize: 9, color: 'var(--mute)' }}>{timeAgo(msg.createdAt)}</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <p style={{ margin: 0, ...BODY, fontSize: 14, color: 'var(--paper)', lineHeight: 1.45, flex: 1, wordBreak: 'break-word' }}>
          {msg.content}
        </p>
        {onDelete && hovering && (
          <button
            onClick={onDelete}
            title="Delete message"
            style={{ flexShrink: 0, background: 'transparent', border: 'none', color: 'var(--mute)', ...MONO, fontSize: 10, cursor: 'pointer', padding: '1px 4px', opacity: 0.6, lineHeight: 1 }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ── DM bubble (no username header — context is obvious) ───────────────────────
function DmBubble({ msg }) {
  return (
    <div style={{ display: 'flex', justifyContent: msg.isOwn ? 'flex-end' : 'flex-start', padding: '3px 0' }}>
      <div style={{
        maxWidth: '72%',
        padding: '8px 12px',
        borderRadius: msg.isOwn ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
        background: msg.isOwn ? 'var(--accent)' : 'var(--card)',
        border: msg.isOwn ? 'none' : '1px solid var(--rule)',
      }}>
        <p style={{ margin: 0, ...BODY, fontSize: 14, color: msg.isOwn ? '#fff' : 'var(--paper)', lineHeight: 1.4, wordBreak: 'break-word' }}>
          {msg.content}
        </p>
        <div style={{ ...MONO, fontSize: 8, color: msg.isOwn ? 'rgba(255,255,255,0.55)' : 'var(--mute)', marginTop: 4, textAlign: 'right' }}>
          {timeAgo(msg.createdAt)}
          {msg.isOwn && msg.readAt && <span style={{ marginLeft: 4 }}>· read</span>}
        </div>
      </div>
    </div>
  );
}

// ── Message thread (channel or DM) ────────────────────────────────────────────
function MessageThread({ title, titlePrefix, messages, loading, onSend, onDelete, scrollEndRef, isOwner, onBack, isDm }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      await onSend(text.trim());
      setText('');
    } catch (err) {
      console.error('send failed', err);
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Thread header */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--rule)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{ background: 'transparent', border: 'none', color: 'var(--mute)', ...MONO, fontSize: 12, cursor: 'pointer', padding: '2px 8px 2px 0', flexShrink: 0 }}
          >
            ←
          </button>
        )}
        <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: 'var(--paper)', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {titlePrefix}{title}
        </span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isDm ? '12px 16px' : '4px 16px', display: 'flex', flexDirection: 'column' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '32px 0', ...MONO, fontSize: 11, color: 'var(--mute)' }}>Loading…</div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', ...MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '0.08em', textAlign: 'center', padding: '32px 0' }}>
            {isDm ? 'Start a conversation' : 'No messages yet — say hello 👋'}
          </div>
        )}
        {!isDm && messages.map((msg, i) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            prevMsg={messages[i - 1] ?? null}
            onDelete={onDelete && (isOwner || msg.isOwn) ? () => onDelete(msg.id) : null}
          />
        ))}
        {isDm && messages.map(msg => (
          <DmBubble key={msg.id} msg={msg} />
        ))}
        <div ref={scrollEndRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        style={{ padding: '10px 16px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 8, flexShrink: 0 }}
      >
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
          placeholder={isDm ? `Message ${title}…` : `Message #${title}…`}
          maxLength={2000}
          style={{ flex: 1, padding: '9px 12px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--paper)', ...BODY, fontSize: 14, outline: 'none', minWidth: 0 }}
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          style={{ padding: '9px 14px', background: !text.trim() || sending ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: !text.trim() || sending ? 'default' : 'pointer', flexShrink: 0 }}
        >
          {sending ? '…' : 'SEND'}
        </button>
      </form>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClubhouseChat({ circleId, members, activeCircle }) {
  const { user } = useAuth();
  const [channels, setChannels] = useState([]);
  const [chatMode, setChatMode] = useState('channel');
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [selectedDmUserId, setSelectedDmUserId] = useState(null);
  const [newChannelName, setNewChannelName] = useState('');
  const [showNewChannel, setShowNewChannel] = useState(false);
  const [creatingChannel, setCreatingChannel] = useState(false);
  const [isWide, setIsWide] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);

  const isOwner = activeCircle?.role === 'owner';
  const hasSelection = chatMode === 'channel' ? !!selectedChannelId : !!selectedDmUserId;

  useEffect(() => {
    const handler = () => setIsWide(window.innerWidth >= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const fetchChannels = useCallback(async () => {
    if (!circleId) return;
    const { data, error } = await supabase
      .from('clubhouse_channels')
      .select('id, name, is_default, created_at')
      .eq('circle_id', circleId)
      .order('created_at', { ascending: true });
    if (!error) setChannels(data ?? []);
  }, [circleId]);

  useEffect(() => { fetchChannels(); }, [fetchChannels]);

  // Auto-select General channel once channels load
  useEffect(() => {
    if (chatMode !== 'channel' || selectedChannelId || channels.length === 0) return;
    const general = channels.find(c => c.is_default) ?? channels[0];
    setSelectedChannelId(general.id);
  }, [channels, chatMode, selectedChannelId]);

  const createChannel = useCallback(async () => {
    if (!newChannelName.trim() || !user?.id) return;
    setCreatingChannel(true);
    try {
      const { error } = await supabase
        .from('clubhouse_channels')
        .insert({ circle_id: circleId, name: newChannelName.trim(), is_default: false, created_by: user.id });
      if (error) throw error;
      setNewChannelName('');
      setShowNewChannel(false);
      await fetchChannels();
    } catch (err) {
      console.error('createChannel failed', err);
    } finally {
      setCreatingChannel(false);
    }
  }, [circleId, newChannelName, user?.id, fetchChannels]);

  // Both hooks always mounted; only the active one is passed a real ID
  const {
    messages: channelMessages,
    loading: channelLoading,
    sendMessage: sendChannelMessage,
    deleteMessage: deleteChannelMessage,
    scrollEndRef: channelScrollRef,
  } = useClubhouseChat(chatMode === 'channel' ? selectedChannelId : null);

  const {
    messages: dmMessages,
    loading: dmLoading,
    sendMessage: sendDmMessage,
    scrollEndRef: dmScrollRef,
  } = useDirectMessages(circleId, chatMode === 'dm' ? selectedDmUserId : null);

  const messages     = chatMode === 'channel' ? channelMessages : dmMessages;
  const loading      = chatMode === 'channel' ? channelLoading  : dmLoading;
  const sendMessage  = chatMode === 'channel' ? sendChannelMessage : sendDmMessage;
  const scrollEndRef = chatMode === 'channel' ? channelScrollRef  : dmScrollRef;
  const onDelete     = chatMode === 'channel' ? deleteChannelMessage : null;

  const selectedChannel   = channels.find(c => c.id === selectedChannelId);
  const selectedDmMember  = members.find(m => m.user_id === selectedDmUserId);
  const threadTitle       = chatMode === 'channel' ? (selectedChannel?.name ?? '') : (selectedDmMember?.username ?? '');
  const threadTitlePrefix = chatMode === 'channel' ? '# ' : '';

  const showList   = isWide || !hasSelection;
  const showThread = isWide || hasSelection;

  function switchMode(mode) {
    setChatMode(mode);
    if (mode === 'channel') setSelectedDmUserId(null);
    else setSelectedChannelId(null);
  }

  function goBack() {
    if (chatMode === 'channel') setSelectedChannelId(null);
    else setSelectedDmUserId(null);
  }

  const otherMembers = members.filter(m => m.user_id !== user?.id);

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 220px)', minHeight: 400, overflow: 'hidden' }}>

      {/* ── Left panel: channel/DM list ─────────────────────────── */}
      {showList && (
        <div style={{ width: 180, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--rule)', overflow: 'hidden' }}>

          {/* Mode tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
            {['channel', 'dm'].map(mode => (
              <button
                key={mode}
                onClick={() => switchMode(mode)}
                style={{
                  flex: 1,
                  padding: '10px 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: chatMode === mode ? '2px solid var(--accent)' : '2px solid transparent',
                  color: chatMode === mode ? 'var(--accent)' : 'var(--mute)',
                  ...MONO,
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  cursor: 'pointer',
                  marginBottom: -1,
                }}
              >
                {mode === 'channel' ? 'CHANNELS' : 'DMS'}
              </button>
            ))}
          </div>

          {/* List items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>

            {chatMode === 'channel' && (
              <>
                {channels.map(ch => (
                  <button
                    key={ch.id}
                    onClick={() => setSelectedChannelId(ch.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '7px 14px',
                      background: selectedChannelId === ch.id ? 'rgba(26,111,168,0.14)' : 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 5,
                      overflow: 'hidden',
                    }}
                  >
                    <span style={{ ...MONO, fontSize: 11, color: 'var(--mute)', flexShrink: 0 }}>#</span>
                    <span style={{ ...MONO, fontSize: 11, fontWeight: selectedChannelId === ch.id ? 700 : 400, color: selectedChannelId === ch.id ? 'var(--accent)' : 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ch.name}
                    </span>
                  </button>
                ))}

                {isOwner && !showNewChannel && (
                  <button
                    onClick={() => setShowNewChannel(true)}
                    style={{ width: '100%', textAlign: 'left', padding: '7px 14px', background: 'transparent', border: 'none', color: 'var(--mute)', ...MONO, fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                  >
                    <span>+</span>
                    <span style={{ letterSpacing: '0.08em' }}>NEW CHANNEL</span>
                  </button>
                )}

                {showNewChannel && (
                  <div style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <input
                      autoFocus
                      value={newChannelName}
                      onChange={e => setNewChannelName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') createChannel();
                        if (e.key === 'Escape') { setShowNewChannel(false); setNewChannelName(''); }
                      }}
                      placeholder="channel-name"
                      maxLength={30}
                      style={{ width: '100%', padding: '5px 8px', background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 4, color: 'var(--paper)', ...MONO, fontSize: 11, outline: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={createChannel}
                        disabled={creatingChannel || !newChannelName.trim()}
                        style={{ flex: 1, padding: '5px 0', background: creatingChannel || !newChannelName.trim() ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}
                      >
                        {creatingChannel ? '…' : 'CREATE'}
                      </button>
                      <button
                        onClick={() => { setShowNewChannel(false); setNewChannelName(''); }}
                        style={{ padding: '5px 8px', background: 'transparent', color: 'var(--mute)', border: '1px solid var(--rule)', borderRadius: 4, ...MONO, fontSize: 9, cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {chatMode === 'dm' && otherMembers.length === 0 && (
              <div style={{ padding: '20px 14px', ...MONO, fontSize: 10, color: 'var(--mute)', lineHeight: 1.6 }}>
                No other members yet.
              </div>
            )}

            {chatMode === 'dm' && otherMembers.map(m => (
              <button
                key={m.user_id}
                onClick={() => setSelectedDmUserId(m.user_id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '7px 12px',
                  background: selectedDmUserId === m.user_id ? 'rgba(26,111,168,0.14)' : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  overflow: 'hidden',
                }}
              >
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--elev)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: '#fff' }}>
                    {(m.username?.[0] ?? '?').toUpperCase()}
                  </span>
                </div>
                <span style={{ ...MONO, fontSize: 11, fontWeight: selectedDmUserId === m.user_id ? 700 : 400, color: selectedDmUserId === m.user_id ? 'var(--accent)' : 'var(--paper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.username}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Right panel: message thread ─────────────────────────── */}
      {showThread && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          {!hasSelection ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ ...MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '0.1em' }}>
                {chatMode === 'channel' ? 'SELECT A CHANNEL' : 'SELECT A MEMBER TO MESSAGE'}
              </span>
            </div>
          ) : (
            <MessageThread
              title={threadTitle}
              titlePrefix={threadTitlePrefix}
              messages={messages}
              loading={loading}
              onSend={sendMessage}
              onDelete={onDelete}
              scrollEndRef={scrollEndRef}
              isOwner={isOwner}
              onBack={!isWide ? goBack : null}
              isDm={chatMode === 'dm'}
            />
          )}
        </div>
      )}
    </div>
  );
}
