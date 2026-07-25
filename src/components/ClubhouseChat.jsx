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

// ── Compact list row (rail layout) ────────────────────────────────────────────
function RailListItem({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 6,
        background: active ? 'var(--accent-bg)' : 'transparent',
        border: 'none', cursor: 'pointer',
        ...MONO, fontSize: 12.5, fontWeight: active ? 600 : 400,
        color: active ? 'var(--accent)' : '#4B5568',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function ClubhouseChat({ circleId, members, activeCircle, layout = 'full', onExpand }) {
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

  if (layout === 'rail') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Header + mode toggle */}
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)' }}>Chat</div>
            {onExpand && (
              <button
                onClick={onExpand}
                title="Expand chat"
                style={{ background: 'transparent', border: 'none', color: 'var(--mute)', fontSize: 13, cursor: 'pointer', padding: '2px 4px', lineHeight: 1 }}
              >
                ⤢
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {['channel', 'dm'].map(mode => (
              <button
                key={mode}
                onClick={() => switchMode(mode)}
                style={{
                  padding: '4px 10px', borderRadius: 100,
                  background: chatMode === mode ? 'var(--accent-bg)' : 'transparent',
                  border: 'none', cursor: 'pointer',
                  ...MONO, fontSize: 10, fontWeight: chatMode === mode ? 700 : 400,
                  letterSpacing: '0.06em',
                  color: chatMode === mode ? 'var(--accent)' : 'var(--mute)',
                }}
              >
                {mode === 'channel' ? 'Channels' : 'DMs'}
              </button>
            ))}
          </div>
        </div>

        {/* Compact always-visible list */}
        <div style={{ padding: '8px 8px', borderBottom: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', gap: 1, maxHeight: 150, overflowY: 'auto', flexShrink: 0 }}>
          {chatMode === 'channel' && channels.map(ch => (
            <RailListItem key={ch.id} label={`# ${ch.name}`} active={selectedChannelId === ch.id} onClick={() => setSelectedChannelId(ch.id)} />
          ))}
          {chatMode === 'dm' && otherMembers.length === 0 && (
            <div style={{ padding: '6px 8px', ...MONO, fontSize: 10, color: 'var(--mute)' }}>No other members yet.</div>
          )}
          {chatMode === 'dm' && otherMembers.map(m => (
            <RailListItem key={m.user_id} label={m.username} active={selectedDmUserId === m.user_id} onClick={() => setSelectedDmUserId(m.user_id)} />
          ))}
        </div>

        {/* Thread */}
        {!hasSelection ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
            <span style={{ ...MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '0.1em' }}>
              {chatMode === 'channel' ? 'SELECT A CHANNEL' : 'SELECT A MEMBER'}
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
            isDm={chatMode === 'dm'}
          />
        )}
      </div>
    );
  }

  // layout === 'full' — the S-06 full-width screen: the S-01 rail's markup, expanded
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 220px)', minHeight: 400, overflow: 'hidden' }}>

      {/* ── Left column: channel/DM list ─────────────────────────── */}
      {showList && (
        <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--rule)', background: 'var(--card)', overflow: 'hidden' }}>

          {/* Header + mode toggle */}
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', marginBottom: 10 }}>Chat</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['channel', 'dm'].map(mode => (
                <button
                  key={mode}
                  onClick={() => switchMode(mode)}
                  style={{
                    padding: '4px 10px', borderRadius: 100,
                    background: chatMode === mode ? 'var(--accent-bg)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    ...MONO, fontSize: 10, fontWeight: chatMode === mode ? 700 : 400,
                    letterSpacing: '0.06em',
                    color: chatMode === mode ? 'var(--accent)' : 'var(--mute)',
                  }}
                >
                  {mode === 'channel' ? 'Channels' : 'DMs'}
                </button>
              ))}
            </div>
          </div>

          {/* List items */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>

            {chatMode === 'channel' && (
              <>
                {channels.map(ch => (
                  <RailListItem key={ch.id} label={`# ${ch.name}`} active={selectedChannelId === ch.id} onClick={() => setSelectedChannelId(ch.id)} />
                ))}

                {isOwner && !showNewChannel && (
                  <RailListItem label="+ NEW CHANNEL" onClick={() => setShowNewChannel(true)} />
                )}

                {showNewChannel && (
                  <div style={{ padding: '8px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
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
              <div style={{ padding: '6px 8px', ...MONO, fontSize: 10, color: 'var(--mute)' }}>No other members yet.</div>
            )}

            {chatMode === 'dm' && otherMembers.map(m => (
              <RailListItem key={m.user_id} label={m.username} active={selectedDmUserId === m.user_id} onClick={() => setSelectedDmUserId(m.user_id)} />
            ))}
          </div>
        </div>
      )}

      {/* ── Right pane: message thread ─────────────────────────── */}
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
