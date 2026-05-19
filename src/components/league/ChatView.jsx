import { useState, useEffect, useCallback } from 'react';
import { MgrTag, HubSectionLabel, MONO, DISPLAY, miniBtnStyle, mgrHue, mgrMono } from './HubShared';
import { useHashtags } from '../../hooks/useHashtags';

/**
 * League chat view — responsive layout.
 *
 * Desktop (≥768px): two columns — main chat + members rail (280px).
 * Mobile (<768px): single column. Channel header pill bar at top,
 *   composer pinned at bottom. Members rail hidden.
 *
 * CHANNELS and DIRECT rails removed (low ROI — preserved below in comments
 * for future reinstatement). The `#` prefix in the header is now a hashtag
 * searcher: clicking any #word in a message filters to messages containing
 * that hashtag.
 */

function useIsDesktop() {
  const [desktop, setDesktop] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768);
  useEffect(() => {
    const handler = () => setDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return desktop;
}

/** Render message text — highlights @mentions and #hashtags as clickable spans. */
function MessageBody({ text, onHashtagClick }) {
  const parts = [];
  const re = /(@\w+|#\w+)/g;
  let last = 0, i = 0, match;
  while ((match = re.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('#')) {
      parts.push(
        <span
          key={`h${i++}`}
          onClick={() => onHashtagClick(token)}
          style={{ color: 'var(--cyan)', fontFamily: MONO, fontSize: 12, padding: '0 2px', background: 'rgba(0,180,216,.08)', cursor: 'pointer' }}
        >{token}</span>
      );
    } else {
      parts.push(
        <span key={`m${i++}`} style={{ color: 'var(--cyan)', fontFamily: MONO, fontSize: 12, padding: '0 2px', background: 'rgba(0,180,216,.08)' }}>{token}</span>
      );
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export default function ChatView({
  members, currentUser,
  // useChatMessages results
  messages, chatLoading, unreadCount, typingUsers,
  sendMessage, editMessage, deleteMessage, broadcastTyping, scrollEndRef,
  // useMentions results
  mentionSearch, mentionMatches, selectedMention, mentionedUserIds,
  parseMentionPattern, insertMention, handleMentionNavigate, resetMentions,
  // useMessageSearch results
  searchTerm, setSearchTerm, filteredMessages, clearSearch, resultCount,
}) {
  const [chatInput,        setChatInput]        = useState('');
  const [chatSending,      setChatSending]      = useState(false);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText,      setEditingText]      = useState('');
  const isDesktop = useIsDesktop();
  const trendingHashtags = useHashtags(messages);

  const handleHashtagClick = useCallback((tag) => {
    setSearchTerm(tag);
  }, [setSearchTerm]);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!chatInput.trim() || chatSending) return;
    setChatSending(true);
    const result = await sendMessage(chatInput, mentionedUserIds);
    if (result.ok) { setChatInput(''); resetMentions(); }
    else console.error('Failed to send message:', result.error);
    setChatSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (mentionMatches.length > 0 && selectedMention) {
        e.preventDefault();
        setChatInput(insertMention(chatInput, selectedMention));
        return;
      }
      // Explicit submit — guarantees Enter sends on all browsers/devices
      e.preventDefault();
      handleSubmit();
    } else if (mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); handleMentionNavigate(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); handleMentionNavigate(-1); }
    }
  };

  const pinnedMessage = messages.find(m => m.pinned);

  // ── Desktop layout ──────────────────────────────────────────────────────────
  if (isDesktop) {
    return (
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 280px', minHeight: 0, background: 'var(--ink)' }}>

        {/* Main chat */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <HubSectionLabel
            label="#LEAGUE-CHAT"
            tone="var(--cyan)"
            sub={`${members.length} MEMBERS`}
            right={
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {searchTerm && searchTerm.startsWith('#') && (
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--cyan)', letterSpacing: '.14em' }}>
                    HASHTAG · {searchTerm}
                  </span>
                )}
                {searchTerm && !searchTerm.startsWith('#') && (
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em' }}>
                    {resultCount} RESULT{resultCount !== 1 ? 'S' : ''}
                  </span>
                )}
                <div style={{ display: 'flex', gap: 0, alignItems: 'center', background: 'var(--ink)', border: '1px solid var(--rule)' }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', padding: '4px 8px', letterSpacing: '.18em' }}>#</span>
                  <input
                    type="text"
                    placeholder="search hashtag or text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--paper)', padding: '4px 10px 4px 0', fontFamily: "'Archivo', sans-serif", fontSize: 11, outline: 'none', width: 180 }}
                  />
                  {searchTerm && (
                    <button onClick={clearSearch} style={{ ...miniBtnStyle('var(--mute)'), padding: '2px 8px', fontSize: 9, border: 'none', borderLeft: '1px solid var(--rule)' }}>✕</button>
                  )}
                </div>
              </div>
            }
          />

          {/* Pinned banner */}
          {pinnedMessage && (
            <div style={{ padding: '10px 20px', background: 'rgba(224,168,0,.06)', borderBottom: '1px solid rgba(224,168,0,.27)', display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontFamily: 'Archivo Black', fontSize: 10, color: 'var(--gold)', padding: '2px 6px', background: 'rgba(224,168,0,.18)', letterSpacing: '.18em', flexShrink: 0 }}>PINNED</span>
              <span style={{ fontFamily: 'Archivo,sans-serif', fontSize: 12, color: 'var(--paper)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                "{pinnedMessage.message}"
              </span>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.16em', flexShrink: 0 }}>
                — @{pinnedMessage.userName} · {new Date(pinnedMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          )}

          {/* Message list */}
          <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {chatLoading && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 80 }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.18em' }}>LOADING MESSAGES…</span>
              </div>
            )}
            {!chatLoading && messages.length === 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 80 }}>
                <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)' }}>No messages yet. Start the conversation!</span>
              </div>
            )}
            {!chatLoading && messages.length > 0 && searchTerm && filteredMessages.length === 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 80 }}>
                <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)' }}>No messages match "{searchTerm}"</span>
              </div>
            )}
            {filteredMessages.map((msg) => {
              const msgHue = mgrHue(msg.userName || '');
              return (
                <div key={msg.id} style={{ display: 'grid', gridTemplateColumns: '38px 1fr', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ paddingTop: 2 }}>
                    <MgrTag mono={mgrMono(msg.isOwnMessage ? 'You' : (msg.userName || ''))} hue={msg.isOwnMessage ? 'var(--cyan)' : msgHue} size={22} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontFamily: DISPLAY, fontSize: 13, color: msg.isOwnMessage ? 'var(--cyan)' : msgHue, letterSpacing: '-0.01em' }}>{msg.isOwnMessage ? 'You' : msg.userName}</span>
                      <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.16em' }}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {editingMessageId === msg.id ? (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          style={{ flex: 1, background: 'var(--ink-2)', border: '1px solid var(--cyan)', color: 'var(--paper)', padding: '4px 8px', fontFamily: "'Archivo', sans-serif", fontSize: 12, outline: 'none' }}
                          autoFocus
                        />
                        <button onClick={async () => { const r = await editMessage(msg.id, editingText); if (r.ok) setEditingMessageId(null); }} style={{ ...miniBtnStyle('var(--cyan)'), padding: '4px 10px' }}>SAVE</button>
                        <button onClick={() => setEditingMessageId(null)} style={{ ...miniBtnStyle('var(--mute)'), padding: '4px 10px' }}>CANCEL</button>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 13, color: 'var(--paper)', lineHeight: 1.45 }}>
                          {msg.isDeleted ? (
                            <span style={{ fontStyle: 'italic', color: 'var(--mute)' }}>[deleted]</span>
                          ) : (
                            <MessageBody text={msg.message} onHashtagClick={handleHashtagClick} />
                          )}
                        </div>
                        {msg.editedAt && !msg.isDeleted && (
                          <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', marginTop: 2 }}>(edited)</div>
                        )}
                        {msg.isOwnMessage && !msg.isDeleted && (
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <button onClick={() => { setEditingMessageId(msg.id); setEditingText(msg.message); }} style={miniBtnStyle('var(--mute)')}>EDIT</button>
                            <button onClick={() => deleteMessage(msg.id)} style={miniBtnStyle('var(--danger)')}>DEL</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={scrollEndRef} />
          </div>

          {/* Composer */}
          <div style={{ borderTop: '1px solid var(--rule)', padding: '14px 20px', background: 'var(--ink-2)', flexShrink: 0 }}>
            {Object.values(typingUsers).length > 0 && (
              <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', marginBottom: 8, fontStyle: 'italic' }}>
                {Object.values(typingUsers).map(t => t.name).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing…
              </div>
            )}
            <div style={{ width: '100%', position: 'relative' }}>
              <div style={{ background: 'var(--ink)', border: '1px solid var(--rule)', display: 'flex', alignItems: 'center', padding: '0 14px' }}>
                <input
                  type="text"
                  placeholder="Roast your rivals… (try @username · #hashtag · /bet · /trade)"
                  value={chatInput}
                  onChange={(e) => { const v = e.target.value; setChatInput(v); parseMentionPattern(v); broadcastTyping(); }}
                  onKeyDown={handleKeyDown}
                  disabled={chatSending}
                  style={{ flex: 1, background: 'transparent', padding: '12px 0', fontFamily: "'Archivo', sans-serif", fontSize: 13, color: 'var(--paper)', outline: 'none', opacity: chatSending ? 0.5 : 1 }}
                />
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!chatInput.trim() || chatSending}
                  style={{ background: 'var(--cyan)', color: 'var(--ink)', border: 'none', padding: '8px 14px', fontFamily: DISPLAY, fontSize: 12, letterSpacing: '.18em', cursor: 'pointer', opacity: (!chatInput.trim() || chatSending) ? 0.5 : 1 }}
                >
                  {chatSending ? '…' : 'SEND ↵'}
                </button>
              </div>
              {mentionMatches.length > 0 && mentionSearch && (
                <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'var(--ink-3)', border: '1px solid var(--rule)', zIndex: 50, maxHeight: 192, overflow: 'auto' }}>
                  {mentionMatches.map((member) => (
                    <button key={member.id} type="button" onClick={() => setChatInput(insertMention(chatInput, member))} style={{ width: '100%', textAlign: 'left', padding: '8px 16px', fontFamily: "'Archivo', sans-serif", fontSize: 12, color: selectedMention?.id === member.id ? 'var(--ink)' : 'var(--paper)', background: selectedMention?.id === member.id ? 'var(--cyan)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                      <span style={{ fontWeight: 700 }}>@{member.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Members + Hashtags rail */}
        <aside style={{ borderLeft: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', background: 'var(--ink-2)', minWidth: 0 }}>
          {/* Trending Hashtags Section */}
          <div style={{ borderBottom: '1px solid var(--rule)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <HubSectionLabel label={`TRENDING · ${trendingHashtags.length}`} tone="var(--cyan)" />
            <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflow: 'auto' }}>
              {trendingHashtags.length === 0 ? (
                <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', padding: '8px' }}>No hashtags yet</span>
              ) : (
                trendingHashtags.slice(0, 10).map(({ tag, count }) => (
                  <button
                    key={tag}
                    onClick={() => handleHashtagClick(tag)}
                    style={{
                      textAlign: 'left',
                      padding: '6px 8px',
                      background: searchTerm === tag ? 'rgba(0,180,216,.15)' : 'transparent',
                      border: `1px solid ${searchTerm === tag ? 'var(--cyan)' : 'var(--rule)'}`,
                      borderRadius: 3,
                      color: searchTerm === tag ? 'var(--cyan)' : 'var(--paper)',
                      fontFamily: MONO,
                      fontSize: 10,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span>{tag}</span>
                    <span style={{ color: 'var(--mute)', fontSize: 9 }}>{count}</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Members Section */}
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
            <HubSectionLabel label={`MEMBERS · ${members.length}`} tone="var(--positive)" />
            <div style={{ overflow: 'auto' }}>
              {/* Current user first */}
              {currentUser && members.filter(m => m.user_id === currentUser.id).map(m => (
                <div key={m.user_id} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--rule)' }}>
                  <div style={{ position: 'relative' }}>
                    <MgrTag mono="YOU" hue="var(--cyan)" size={22} />
                    <span style={{ position: 'absolute', bottom: -2, right: -2, width: 7, height: 7, borderRadius: '50%', background: 'var(--positive)', border: '2px solid var(--ink-2)' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: DISPLAY, fontSize: 12, letterSpacing: '-0.01em' }}>You</div>
                    <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', marginTop: 2 }}>@{m.users?.username || 'you'}</div>
                  </div>
                </div>
              ))}
              {members.filter(m => !(currentUser && m.user_id === currentUser.id)).map(m => {
                const mName = m.users?.username || 'Unknown';
                const hue = mgrHue(mName);
                return (
                  <div key={m.user_id} style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--rule)' }}>
                    <div style={{ position: 'relative' }}>
                      <MgrTag mono={mgrMono(mName)} hue={hue} size={22} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: DISPLAY, fontSize: 12, letterSpacing: '-0.01em' }}>{mName}</div>
                      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.14em', marginTop: 2 }}>@{mName.toLowerCase()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

      </div>
    );
  }

  // ── Mobile layout ───────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--ink)' }}>

      {/* Channel header pill — single pill since channels feature is removed */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 16px', borderBottom: '1px solid var(--rule)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <span style={{ flex: '0 0 auto', padding: '6px 10px', background: 'rgba(0,180,216,.08)', border: '1px solid var(--cyan)', color: 'var(--cyan)', fontFamily: DISPLAY, fontSize: 11, letterSpacing: '-0.01em', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          #league-chat
          {(unreadCount || 0) > 0 && <span style={{ background: 'var(--danger)', color: '#fff', fontFamily: MONO, fontSize: 8, padding: '0 4px', letterSpacing: '.1em' }}>{unreadCount}</span>}
        </span>
        {/* Hashtag search pill */}
        <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', background: searchTerm ? 'rgba(0,180,216,.08)' : 'transparent', border: `1px solid ${searchTerm ? 'var(--cyan)' : 'var(--rule)'}`, padding: '0 10px', gap: 4 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: searchTerm ? 'var(--cyan)' : 'var(--mute)', letterSpacing: '.18em' }}>#</span>
          <input
            type="text"
            placeholder="search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--paper)', fontFamily: "'Archivo', sans-serif", fontSize: 11, width: searchTerm ? 90 : 52 }}
          />
          {searchTerm && (
            <button onClick={clearSearch} style={{ background: 'none', border: 'none', color: 'var(--mute)', fontFamily: MONO, fontSize: 9, cursor: 'pointer', padding: 0 }}>✕</button>
          )}
        </div>
        {/* Mobile trending hashtags */}
        {trendingHashtags.length > 0 && (
          <div style={{ display: 'flex', gap: 4, padding: '0 16px 8px', overflowX: 'auto', scrollbarWidth: 'none', flex: '0 0 auto' }}>
            {trendingHashtags.slice(0, 6).map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => handleHashtagClick(tag)}
                style={{
                  flex: '0 0 auto',
                  padding: '4px 8px',
                  background: searchTerm === tag ? 'rgba(0,180,216,.15)' : 'transparent',
                  border: `1px solid ${searchTerm === tag ? 'var(--cyan)' : 'var(--rule)'}`,
                  borderRadius: 3,
                  color: searchTerm === tag ? 'var(--cyan)' : 'var(--paper)',
                  fontFamily: MONO,
                  fontSize: 9,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {tag} <span style={{ fontSize: 8, color: 'var(--mute)' }}>({count})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Pinned banner */}
      {pinnedMessage && (
        <div style={{ padding: '8px 16px', background: 'rgba(224,168,0,.06)', borderBottom: '1px solid rgba(224,168,0,.27)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <span style={{ fontFamily: 'Archivo Black', fontSize: 8, color: 'var(--gold)', padding: '2px 5px', background: 'rgba(224,168,0,.18)', letterSpacing: '.18em', flexShrink: 0 }}>PINNED</span>
          <span style={{ fontFamily: 'Archivo,sans-serif', fontSize: 11, color: 'var(--paper)', lineHeight: 1.4, flex: 1, overflow: 'hidden' }}>
            "{pinnedMessage.message}"
            <span style={{ fontFamily: MONO, color: 'var(--mute)', fontSize: 9, marginLeft: 4, letterSpacing: '.16em' }}>— @{pinnedMessage.userName}</span>
          </span>
        </div>
      )}

      {/* Date divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px 4px' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '.22em' }}>TODAY</span>
        <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {chatLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--mute)', letterSpacing: '.18em' }}>LOADING…</span>
          </div>
        )}
        {!chatLoading && messages.length === 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)' }}>No messages yet.</span>
          </div>
        )}
        {filteredMessages.map((msg) => {
          const msgHue = mgrHue(msg.userName || '');
          return (
            <div key={msg.id} style={{ padding: '6px 16px', display: 'grid', gridTemplateColumns: '30px 1fr', gap: 8, alignItems: 'flex-start' }}>
              <div style={{ paddingTop: 2 }}>
                <MgrTag mono={mgrMono(msg.isOwnMessage ? 'You' : (msg.userName || ''))} hue={msg.isOwnMessage ? 'var(--cyan)' : msgHue} size={20} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 12, color: msg.isOwnMessage ? 'var(--cyan)' : msgHue, letterSpacing: '-0.01em' }}>{msg.isOwnMessage ? 'You' : msg.userName}</span>
                  <span style={{ fontFamily: MONO, fontSize: 8, color: 'var(--mute)', letterSpacing: '.16em' }}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <div style={{ fontFamily: 'Archivo,sans-serif', fontSize: 12, color: 'var(--paper)', lineHeight: 1.4 }}>
                  {msg.isDeleted ? (
                    <span style={{ fontStyle: 'italic', color: 'var(--mute)' }}>[deleted]</span>
                  ) : (
                    <MessageBody text={msg.message} onHashtagClick={handleHashtagClick} />
                  )}
                </div>
                {msg.isOwnMessage && !msg.isDeleted && (
                  <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                    <button onClick={() => { setEditingMessageId(msg.id); setEditingText(msg.message); }} style={{ ...miniBtnStyle('var(--mute)'), fontSize: 8, padding: '1px 5px' }}>EDIT</button>
                    <button onClick={() => deleteMessage(msg.id)} style={{ ...miniBtnStyle('var(--danger)'), fontSize: 8, padding: '1px 5px' }}>DEL</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div ref={scrollEndRef} style={{ height: 14 }} />
      </div>

      {/* Composer — pinned at bottom */}
      <div style={{ borderTop: '1px solid var(--rule)', padding: '10px 14px', background: 'var(--ink-2)', flexShrink: 0 }}>
        {Object.values(typingUsers).length > 0 && (
          <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', marginBottom: 6, fontStyle: 'italic' }}>
            {Object.values(typingUsers).map(t => t.name).join(', ')} typing…
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
          <MgrTag
            mono={mgrMono(currentUser?.username || 'You')}
            hue="var(--cyan)"
            size={20}
          />
          <div style={{ flex: 1, background: 'var(--ink)', border: '1px solid var(--rule)', display: 'flex', alignItems: 'center', padding: '0 10px' }}>
            <input
              type="text"
              placeholder="Roast your rivals…"
              value={chatInput}
              onChange={(e) => { const v = e.target.value; setChatInput(v); parseMentionPattern(v); broadcastTyping(); }}
              onKeyDown={handleKeyDown}
              disabled={chatSending}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '8px 0', fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--paper)', opacity: chatSending ? 0.5 : 1 }}
            />
          </div>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!chatInput.trim() || chatSending}
            style={{ padding: '8px 12px', background: 'var(--cyan)', color: 'var(--ink)', border: 0, fontFamily: 'Archivo Black,sans-serif', fontSize: 11, letterSpacing: '.16em', cursor: 'pointer', opacity: (!chatInput.trim() || chatSending) ? 0.5 : 1, flexShrink: 0 }}
          >↵</button>
          {mentionMatches.length > 0 && mentionSearch && (
            <div style={{ position: 'absolute', bottom: '100%', left: 30, right: 0, background: 'var(--ink-3)', border: '1px solid var(--rule)', zIndex: 50, maxHeight: 160, overflow: 'auto' }}>
              {mentionMatches.map((member) => (
                <button key={member.id} type="button" onClick={() => setChatInput(insertMention(chatInput, member))} style={{ width: '100%', textAlign: 'left', padding: '8px 12px', fontFamily: "'Archivo', sans-serif", fontSize: 12, color: selectedMention?.id === member.id ? 'var(--ink)' : 'var(--paper)', background: selectedMention?.id === member.id ? 'var(--cyan)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                  @{member.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

/*
 * ── REMOVED FEATURES (preserved for future reinstatement) ───────────────────
 *
 * CHANNELS rail (desktop left aside, mobile top pill bar):
 *   Channels: #league-chat, #trash-talk, #auction-house, #bets-and-bonus, #tactics-notes
 *   Requires: channel routing, per-channel message storage, per-channel unread counts
 *   Reason removed: high implementation cost, low ROI for current user base
 *
 * DIRECT messaging:
 *   Private 1-to-1 messages between managers within a league
 *   Requires: separate message table scoped by (sender, recipient, league_id), inbox UI
 *   Reason removed: adds complexity without meaningfully improving the league experience
 *
 * To reinstate either feature, restore the rail JSX from git history and wire up
 * the corresponding hooks (useChannels, useDirectMessages).
 * ─────────────────────────────────────────────────────────────────────────────
 */
