import { useState } from 'react';
import { MgrTag, HubSectionLabel, MONO, DISPLAY, miniBtnStyle, mgrHue, mgrMono } from './HubShared';

/**
 * League chat view — self-contained UI for the chat tab.
 * All hook results (useChatMessages, useMentions, useMessageSearch) are passed
 * in as props so hooks remain in the LeagueScreen and can be re-used elsewhere.
 * Local input state lives here so LeagueScreen doesn't manage it.
 */
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

  return (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '240px 1fr 280px', minHeight: 0, background: 'var(--ink)' }}>
      {/* Left: channels rail */}
      <aside style={{ borderRight: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', background: 'var(--ink-2)', overflow: 'auto' }}>
        <div style={{ padding: '18px 18px 8px' }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>CHANNELS</div>
        </div>
        {[
          { id: 'lc', name: '#league-chat',    active: true,  unread: unreadCount || 0 },
          { id: 'tt', name: '#trash-talk',     active: false, unread: 0 },
          { id: 'ah', name: '#auction-house',  active: false, unread: 0 },
          { id: 'bb', name: '#bets-and-bonus', active: false, unread: 0 },
          { id: 'tn', name: '#tactics-notes',  active: false, unread: 0 },
        ].map(c => (
          <div key={c.id} style={{ padding: '10px 18px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', borderLeft: c.active ? '2px solid var(--cyan)' : '2px solid transparent', background: c.active ? 'rgba(0,180,216,.06)' : 'transparent', color: c.active ? 'var(--paper)' : 'var(--mute)' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 13, letterSpacing: '-0.01em', flex: 1 }}>{c.name}</span>
            {c.unread > 0 && <span style={{ background: 'var(--danger)', color: '#fff', fontFamily: MONO, fontSize: 9, padding: '1px 6px', letterSpacing: '.1em' }}>{c.unread}</span>}
          </div>
        ))}
        <div style={{ padding: '18px 18px 8px', marginTop: 8 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--mute)', letterSpacing: '.22em' }}>DIRECT</div>
        </div>
        {members.slice(0, 4).filter(m => !(currentUser && m.user_id === currentUser.id)).map(m => {
          const mName = m.users?.username || 'Unknown';
          const hue = mgrHue(mName);
          return (
            <div key={m.user_id} style={{ padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--mute)', cursor: 'pointer' }}>
              <MgrTag mono={mgrMono(mName)} hue={hue} size={16} />
              <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--paper)' }}>{mName}</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--positive)', marginLeft: 'auto' }} />
            </div>
          );
        })}
      </aside>

      {/* Middle: main chat */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <HubSectionLabel label="#LEAGUE-CHAT" tone="var(--cyan)" sub={`${members.length} MEMBERS`}
          right={
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>🔍 SEARCH</span>
              <input
                type="text"
                placeholder="Search…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ background: 'var(--ink)', border: '1px solid var(--rule)', color: 'var(--paper)', padding: '4px 10px', fontFamily: "'Archivo', sans-serif", fontSize: 11, outline: 'none', width: 160 }}
              />
              {searchTerm && (
                <>
                  <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>{resultCount}</span>
                  <button onClick={clearSearch} style={{ ...miniBtnStyle('var(--mute)'), padding: '2px 8px', fontSize: 9 }}>✕</button>
                </>
              )}
            </div>
          }
        />
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
              <span style={{ fontFamily: "'Archivo', sans-serif", fontSize: 12, color: 'var(--mute)' }}>No messages match &ldquo;{searchTerm}&rdquo;</span>
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
                    {msg.userRank && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--mute)' }}>· RANK {msg.userRank}</span>}
                  </div>
                  {editingMessageId === msg.id ? (
                    <div className="flex gap-2 items-center w-full">
                      <input
                        type="text"
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        className="flex-1 bg-[var(--ink-2)] border border-cyan rounded px-2 py-1 text-sm text-white"
                        autoFocus
                      />
                      <button
                        onClick={async () => { const result = await editMessage(msg.id, editingText); if (result.ok) setEditingMessageId(null); }}
                        className="px-2 py-1 bg-cyan text-black text-xs font-bold rounded"
                      >Save</button>
                      <button onClick={() => setEditingMessageId(null)} className="px-2 py-1 bg-[var(--rule)] text-white text-xs rounded">Cancel</button>
                    </div>
                  ) : (
                    <>
                      <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 13, color: 'var(--paper)', lineHeight: 1.45 }}>
                        {msg.isDeleted ? (
                          <span style={{ fontStyle: 'italic', color: 'var(--mute)' }}>[deleted]</span>
                        ) : (
                          msg.message.split(/(@\w+)/g).map((part, idx) =>
                            part.startsWith('@') ? (
                              <span key={idx} style={{ color: 'var(--cyan)', fontFamily: MONO, fontSize: 12, padding: '0 2px', background: 'rgba(0,180,216,.08)' }}>{part}</span>
                            ) : (
                              <span key={idx}>{part}</span>
                            )
                          )
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

        {/* Input bar */}
        <div style={{ borderTop: '1px solid var(--rule)', padding: '14px 20px', background: 'var(--ink-2)', flexShrink: 0 }}>
          {Object.values(typingUsers).length > 0 && (
            <div style={{ fontFamily: "'Archivo', sans-serif", fontSize: 11, color: 'var(--mute)', marginBottom: 8, fontStyle: 'italic' }}>
              {Object.values(typingUsers).map(t => t.name).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing…
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!chatInput.trim() || chatSending) return;
              setChatSending(true);
              const result = await sendMessage(chatInput, mentionedUserIds);
              if (result.ok) { setChatInput(''); resetMentions(); }
              else console.error('Failed to send message:', result.error);
              setChatSending(false);
            }}
            style={{ width: '100%', position: 'relative' }}
          >
            <div style={{ background: 'var(--ink)', border: '1px solid var(--rule)', display: 'flex', alignItems: 'center', padding: '0 14px' }}>
              <input
                type="text"
                placeholder="Roast your rivals… (try @username · /bet · /trade)"
                value={chatInput}
                onChange={(e) => { const v = e.target.value; setChatInput(v); parseMentionPattern(v); broadcastTyping(); }}
                onKeyDown={(e) => {
                  if (mentionMatches.length > 0) {
                    if (e.key === 'ArrowDown') { e.preventDefault(); handleMentionNavigate(1); }
                    else if (e.key === 'ArrowUp') { e.preventDefault(); handleMentionNavigate(-1); }
                    else if (e.key === 'Enter' && selectedMention) { e.preventDefault(); setChatInput(insertMention(chatInput, selectedMention)); }
                  }
                }}
                disabled={chatSending}
                style={{ flex: 1, background: 'transparent', padding: '12px 0', fontFamily: "'Archivo', sans-serif", fontSize: 13, color: 'var(--paper)', outline: 'none', opacity: chatSending ? 0.5 : 1 }}
              />
              <button type="submit" disabled={!chatInput.trim() || chatSending} style={{ background: 'var(--cyan)', color: 'var(--ink)', border: 'none', padding: '8px 14px', fontFamily: DISPLAY, fontSize: 12, letterSpacing: '.18em', cursor: 'pointer', opacity: (!chatInput.trim() || chatSending) ? 0.5 : 1 }}>
                {chatSending ? '…' : 'SEND ↵'}
              </button>
            </div>
            {mentionMatches.length > 0 && mentionSearch && (
              <div style={{ position: 'absolute', bottom: '100%', left: 0, right: 0, background: 'var(--ink-3)', border: '1px solid var(--rule)', zIndex: 50, maxHeight: 192, overflow: 'auto' }}>
                {mentionMatches.map((member) => (
                  <button key={member.id} type="button" onClick={() => setChatInput(insertMention(chatInput, member))} style={{ width: '100%', textAlign: 'left', padding: '8px 16px', fontFamily: "'Archivo', sans-serif", fontSize: 12, color: selectedMention?.id === member.id ? 'var(--ink)' : 'var(--paper)', background: selectedMention?.id === member.id ? 'var(--cyan)' : 'transparent', border: 'none', cursor: 'pointer' }}>
                    <span style={{ fontWeight: 700 }}>@{member.name}</span>
                    <span style={{ color: 'var(--mute)', fontSize: 10, marginLeft: 8 }}>{member.email}</span>
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Right: members rail */}
      <aside style={{ borderLeft: '1px solid var(--rule)', display: 'flex', flexDirection: 'column', background: 'var(--ink-2)', overflow: 'auto' }}>
        <HubSectionLabel label={`MEMBERS · ${members.length}`} tone="var(--positive)" />
        <div style={{ flex: 1, overflow: 'auto' }}>
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
      </aside>
    </div>
  );
}
