// The empty state for someone in no Clubhouse yet: create one or join with a code.
import { useState } from 'react';

const MONO = { fontFamily: 'Archivo, sans-serif' };
const HEAD = { fontFamily: 'Archivo Black, sans-serif' };
const BODY = { fontFamily: 'Archivo, sans-serif' };

// ── Empty / no-circles state ──────────────────────────────────────────────────
export default function ClubhouseLobby({ createCircle, joinCircleByCode }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(null); // 'create' | 'join' | null
  const [createErr, setCreateErr] = useState('');
  const [joinErr, setJoinErr] = useState('');

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy('create'); setCreateErr('');
    try { await createCircle(name.trim()); }
    catch (e) { setCreateErr(e.message === 'NAME_REQUIRED' ? 'Please enter a name.' : e.message); }
    finally { setBusy(null); }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setBusy('join'); setJoinErr('');
    try { await joinCircleByCode(code.trim()); }
    catch (e) {
      setJoinErr(e.message === 'INVALID_CODE' ? 'Code not found — check and try again.' : e.message);
    }
    finally { setBusy(null); }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', minHeight: '60vh' }}>
      <div style={{ maxWidth: 560, textAlign: 'center' }}>
        <div style={{ ...MONO, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--accent)', marginBottom: 14 }}>
          Welcome to Clubhouse
        </div>
        <h1 style={{ ...HEAD, fontSize: 'var(--fs-title)', color: 'var(--paper)', letterSpacing: '-0.02em', lineHeight: 1.15, margin: '0 0 14px' }}>
          Every game you play lives in one room.
        </h1>
        <p style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--mute)', lineHeight: 1.6, margin: '0 0 28px' }}>
          Create a Clubhouse for your group, or join one with an invite code — football leagues, F1 paddocks and tennis boxes all show up inside it.
        </p>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', textAlign: 'left' }}>
          {/* Create — primary */}
          <div style={{ flex: '1 1 240px', background: 'var(--card)', border: '1px solid var(--rule)', borderLeft: '4px solid var(--accent)', borderRadius: 'var(--radius)', padding: '20px 18px', color: 'var(--paper)' }}>
            <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 8 }}>
              Start fresh
            </div>
            <div style={{ ...HEAD, fontSize: 'var(--fs-body)', marginBottom: 6 }}>Create a Clubhouse</div>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 14 }}>
              Name it, invite your group, add competitions as you go
            </div>

            {creating ? (
              <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. The Friday Night Crew"
                  maxLength={40}
                  className="ffl-input"
                />
                {createErr && <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--danger)' }}>{createErr}</div>}
                <button className="ffl-btn ffl-btn--primary ffl-btn--md" data-full-width="true"
                  type="submit"
                  disabled={busy === 'create' || !name.trim()}>
                  {busy === 'create' ? 'Creating…' : 'Create Clubhouse'}
                </button>
              </form>
            ) : (
              <button className="ffl-btn ffl-btn--primary ffl-btn--md" data-full-width="true"
                type="button"
                onClick={() => setCreating(true)}>
                Create Clubhouse
              </button>
            )}
          </div>

          {/* Join — secondary, always-visible code input */}
          <div style={{ flex: '1 1 240px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8, padding: '20px 18px' }}>
            <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 8 }}>
              Have a code?
            </div>
            <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', marginBottom: 6 }}>Join with an invite</div>
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="FK-XXXXX"
                maxLength={8}
                className="ffl-input" style={{ ...MONO, fontWeight: 600 }}
              />
              {joinErr && <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--danger)' }}>{joinErr}</div>}
              <button className="ffl-btn ffl-btn--primary ffl-btn--md" data-full-width="true"
                type="submit"
                disabled={busy === 'join' || code.trim().length < 6}>
                {busy === 'join' ? 'Joining…' : 'Join Clubhouse'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
