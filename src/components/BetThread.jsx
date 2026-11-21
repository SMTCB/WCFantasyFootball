/**
 * BetThread — one bet as its own conversation (C-19). Header shows the bet and
 * who is in; below it, a chat that only carries messages tied to this bet.
 *
 * channelId, or circleId to look up that clubhouse's Room. `header` and `actions`
 * are optional slots (live totals, Take it / Pass). variant="panel" sits in a page
 * column instead of covering the screen.
 */
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { scrollInside } from '../lib/scrollInside';
import { IconClose } from './UiIcons';

const BODY = { fontFamily: 'var(--font-body)' };

export default function BetThread({ channelId: givenChannelId, circleId, userId, betRef, onClose, header, actions, variant = 'overlay' }) {
  const [foundChannelId, setFoundChannelId] = useState(null);
  const channelId = givenChannelId ?? foundChannelId;
  const [messages, setMessages] = useState([]);
  const [players, setPlayers] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [names, setNames] = useState({});
  const known = useRef({});
  const endRef = useRef(null);
  const kind = betRef.ref_kind;
  const id = betRef.ref_id;

  async function nameFor(ids) {
    const missing = [...new Set(ids)].filter(u => u && !known.current[u]);
    if (missing.length) {
      const { data } = await supabase.from('users').select('id, username').in('id', missing);
      (data ?? []).forEach(u => { known.current[u.id] = u.username ?? '?'; });
      setNames({ ...known.current });
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('clubhouse_messages')
        .select('id, user_id, content, created_at')
        .eq('thread_kind', kind).eq('thread_id', id)
        .order('created_at', { ascending: true }).limit(200);
      await nameFor((data ?? []).map(m => m.user_id));
      if (alive) setMessages(data ?? []);
    })();
    if (kind === 'bet') {
      supabase.from('p2p_bet_participants').select('user_id').eq('bet_id', id).then(async ({ data }) => {
        await nameFor((data ?? []).map(p => p.user_id));
        if (alive) setPlayers((data ?? []).map(p => known.current[p.user_id] ?? '?'));
      });
    }
    const ch = supabase.channel(`bet-thread-${kind}-${id}:${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'clubhouse_messages',
        filter: `thread_id=eq.${id}`,
      }, async ({ new: m }) => {
        await nameFor([m.user_id]);
        setMessages(prev => (prev.some(x => x.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [kind, id]);

  useEffect(() => {
    if (givenChannelId || !circleId) return undefined;
    let alive = true;
    supabase.from('clubhouse_channels').select('id, is_default, created_at')
      .eq('circle_id', circleId).order('created_at', { ascending: true })
      .then(({ data }) => {
        const rows = data ?? [];
        if (alive) setFoundChannelId((rows.find(r => r.is_default) ?? rows[0])?.id ?? null);
      });
    return () => { alive = false; };
  }, [givenChannelId, circleId]);

  useEffect(() => { scrollInside(endRef.current, { block: 'nearest' }); }, [messages.length]);

  async function send(e) {
    e.preventDefault();
    const content = text.trim();
    if (!content || !channelId) return;
    setText(''); setError('');
    const { error: err } = await supabase.from('clubhouse_messages').insert({
      channel_id: channelId, user_id: userId, content, thread_kind: kind, thread_id: id,
    });
    if (err) { setText(content); setError('Message not sent. Try again.'); }
  }

  return (
    <div role={variant === 'panel' ? 'region' : 'dialog'} aria-label="Bet conversation"
      style={variant === 'panel'
        ? { background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }
        : { position: 'fixed', inset: 0, zIndex: 60, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--rule)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...BODY, fontSize: 'var(--fs-body)', fontWeight: 600, color: 'var(--paper)' }}>{betRef.question}</div>
          <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2 }}>
            {betRef.stake_coins} coins on the table{players.length ? ` · ${players.join(', ')}` : ''}
          </div>
          {header}
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="hit-44"
            style={{ background: 'transparent', border: 'none', color: 'var(--mute)', cursor: 'pointer', display: 'flex' }}>
            <IconClose size={18} />
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 16px' }}>
        {messages.length === 0 && (
          <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>No messages about this bet yet.</div>
        )}
        {messages.map(m => (
          <div key={m.id} style={{ padding: '4px 0' }}>
            <span style={{ ...BODY, fontSize: 'var(--fs-micro)', fontWeight: 700, color: m.user_id === userId ? 'var(--accent)' : 'var(--mute)' }}>
              {m.user_id === userId ? 'You' : names[m.user_id] ?? '?'}
            </span>
            <div style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', wordBreak: 'break-word' }}>{m.content}</div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {actions && <div style={{ padding: '10px 16px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>{actions}</div>}
      {error && <div role="alert" style={{ padding: '6px 16px', ...BODY, fontSize: 'var(--fs-label)', color: 'var(--danger)' }}>{error}</div>}
      <form onSubmit={send} style={{ padding: '10px 16px', borderTop: '1px solid var(--rule)', display: 'flex', gap: 8 }}>
        <input value={text} onChange={e => setText(e.target.value)} placeholder="Say something about this bet…"
          aria-label="Message about this bet" maxLength={2000}
          style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, color: 'var(--paper)', ...BODY, fontSize: 'var(--fs-body)', outline: 'none' }} />
        <button type="submit" disabled={!text.trim()}
          style={{ minHeight: 'var(--tap)', padding: '0 14px', background: text.trim() ? 'var(--accent)' : 'var(--mute)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, ...BODY, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', cursor: text.trim() ? 'pointer' : 'default' }}>SEND</button>
      </form>
    </div>
  );
}
