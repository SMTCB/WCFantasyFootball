import { useState } from 'react';

function timeAgoFT(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Emoji reaction strip ───────────────────────────────────────────────────────
export function ReactionStrip({
  sectionKey, toggleReaction, getReactionCounts, isMyReaction, EMOJIS,
  ftInk, ftRule, ftMute, ftMono,
}) {
  const counts = getReactionCounts(sectionKey);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap',
      paddingTop: 10, marginTop: 12,
      borderTop: `1px solid ${ftRule}`,
    }}>
      {EMOJIS.map(emoji => {
        const count = counts[emoji] ?? 0;
        const mine  = isMyReaction(sectionKey, emoji);
        return (
          <button
            key={emoji}
            onClick={() => toggleReaction(sectionKey, emoji)}
            title={mine ? `Remove ${emoji}` : `React ${emoji}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3,
              padding: '2px 8px',
              border: mine ? `1.5px solid ${ftInk}` : `1px solid ${ftRule}`,
              background: mine ? '#E4DFCE' : 'transparent',
              cursor: 'pointer',
              transition: 'border-color .1s, background .1s',
            }}
          >
            <span style={{ fontSize: 13, lineHeight: 1 }}>{emoji}</span>
            {count > 0 && (
              <span style={{ fontFamily: ftMono, fontSize: 9, color: mine ? ftInk : ftMute }}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Letters to the Editor panel ────────────────────────────────────────────────
export function LettersPanel({
  sectionKey, addComment, getComments, deleteComment,
  members, currentUserId, isCommissioner,
  ftInk, ftRule, ftMute, ftMono, ftSerif,
}) {
  const [open,    setOpen]    = useState(false);
  const [draft,   setDraft]   = useState('');
  const [sending, setSending] = useState(false);
  const letters = getComments(sectionKey);

  const usernameFor = (userId) => {
    const m = members?.find(mem => mem.user_id === userId);
    return m?.users?.username ?? '—';
  };

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    await addComment(sectionKey, draft.trim());
    setSending(false);
    setDraft('');
  };

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', padding: 0, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontFamily: ftMono, fontSize: 9, letterSpacing: '.16em', color: ftMute,
        }}
      >
        <span>✉</span>
        <span>
          {letters.length > 0
            ? `${letters.length} LETTER${letters.length !== 1 ? 'S' : ''}`
            : 'WRITE A LETTER'}
        </span>
        <span style={{ fontSize: 7 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ marginTop: 10 }}>
          {/* Existing letters */}
          {letters.length > 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14,
              paddingLeft: 12, borderLeft: `3px solid ${ftRule}`,
            }}>
              {letters.map(l => (
                <div key={l.id}>
                  <span style={{ fontFamily: ftSerif, fontStyle: 'italic', fontSize: 12.5, color: ftInk, lineHeight: 1.4 }}>
                    "{l.text}"
                  </span>
                  <span style={{ fontFamily: ftMono, fontSize: 9, color: ftMute, marginLeft: 8 }}>
                    — {usernameFor(l.user_id)} · {timeAgoFT(l.created_at)}
                  </span>
                  {(l.user_id === currentUserId || isCommissioner) && (
                    <button
                      onClick={() => deleteComment(l.id)}
                      title="Delete"
                      style={{
                        marginLeft: 6, background: 'none', border: 'none',
                        cursor: 'pointer', color: ftMute, fontSize: 9, padding: 0,
                        lineHeight: 1, verticalAlign: 'middle',
                      }}
                    >✕</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Compose */}
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="text"
              placeholder="Your letter to the editor… (140 chars)"
              value={draft}
              onChange={e => setDraft(e.target.value.slice(0, 140))}
              maxLength={140}
              onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
              style={{
                flex: 1, minWidth: 0,
                fontFamily: ftSerif, fontSize: 12,
                border: `1px solid ${ftRule}`, background: 'transparent',
                padding: '5px 8px', color: ftInk, outline: 'none',
              }}
            />
            <button
              onClick={handleSend}
              disabled={!draft.trim() || sending}
              style={{
                flexShrink: 0,
                fontFamily: ftMono, fontSize: 9, letterSpacing: '.14em',
                padding: '0 10px',
                background: !draft.trim() ? 'transparent' : ftInk,
                color: !draft.trim() ? ftMute : '#F2EEE5',
                border: `1px solid ${!draft.trim() ? ftRule : ftInk}`,
                cursor: !draft.trim() ? 'not-allowed' : 'pointer',
              }}
            >
              {sending ? '…' : 'SEND →'}
            </button>
          </div>
          <div style={{ fontFamily: ftMono, fontSize: 8, color: ftMute, marginTop: 3 }}>
            {140 - draft.length} chars remaining
          </div>
        </div>
      )}
    </div>
  );
}
