import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePaddock } from '../../hooks/f1/usePaddock';
import { supabase } from '../../lib/supabase';
import { useShowArchived } from '../../hooks/useShowArchived';
import { ArchivedBadge } from '../../components/league/LeagueBadges';
import CompetitionSettingsModal from '../../components/shared/CompetitionSettingsModal';

export default function PaddockLobbyScreen() {
  const navigate = useNavigate();
  const { myPaddocks, loading, createPaddock, joinPaddockByCode, setActivePaddockId, refresh: refreshPaddocks } = usePaddock();

  const [tab, setTab] = useState('my');   // 'my' | 'create' | 'join'
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(null);
  const [myCircles, setMyCircles] = useState([]);
  const [selectedCircleId, setSelectedCircleId] = useState(null);
  const [showArchived, setShowArchived] = useShowArchived('ffl_show_archived_paddocks');
  const [settingsPaddock, setSettingsPaddock] = useState(null);

  const archivedCount = myPaddocks.filter(p => p.archived).length;
  const visiblePaddocks = showArchived ? myPaddocks : myPaddocks.filter(p => !p.archived);

  useEffect(() => {
    supabase.rpc('get_my_circles').then(({ data }) => {
      if (data?.length) setMyCircles(data);
    });
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try {
      const id = await createPaddock(name.trim(), selectedCircleId ?? undefined);
      navigate(`/f1/${id}`);
    } catch (e) {
      setErr(e.message === 'F1_SPORT_NOT_FOUND' ? 'F1 sport not configured — contact admin.' : e.message);
    } finally { setBusy(false); }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true); setErr('');
    try {
      const id = await joinPaddockByCode(code.trim());
      navigate(`/f1/${id}`);
    } catch (e) {
      setErr(e.message === 'PADDOCK_NOT_FOUND' ? 'Invite code not found — check the code and try again.' : e.message);
    } finally { setBusy(false); }
  }

  function enterPaddock(id) {
    setActivePaddockId(id);
    navigate(`/f1/${id}`);
  }

  function copyCode(code) {
    navigator.clipboard?.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  }

  const TABS = [
    { key: 'my',     label: 'MY PADDOCKS' },
    { key: 'create', label: 'CREATE' },
    { key: 'join',   label: 'JOIN' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background: 'var(--card)', padding: '24px 20px 20px' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 6 }}>
          🏎 Formula 1 · 2026
        </div>
        <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-title)', color: 'var(--paper)', margin: 0, lineHeight: 1.1 }}>
          PADDOCK
        </h1>
        <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--text-2)', margin: '6px 0 0' }}>
          Your private prediction group — create one or join a friend's.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', display: 'flex', gap: 0 }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setErr(''); }}
            style={{
              flex: 1,
              padding: '12px 0',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 'var(--fs-micro)',
              fontWeight: 700,
              letterSpacing: '0.14em',
              cursor: 'pointer',
              border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--f1)' : '2px solid transparent',
              background: 'transparent',
              color: tab === t.key ? 'var(--f1)' : 'var(--mute)',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

        {/* MY PADDOCKS */}
        {tab === 'my' && (
          <div>
            {loading ? (
              <div style={{ color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', textAlign: 'center', padding: 40 }}>
                Loading…
              </div>
            ) : myPaddocks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 'var(--fs-title)', marginBottom: 12 }}>🏁</div>
                <p style={{ fontFamily: 'Archivo, sans-serif', color: 'var(--mute)', fontSize: 'var(--fs-body)' }}>
                  You haven't joined any paddocks yet.
                </p>
                <button
                  onClick={() => setTab('create')}
                  style={{ marginTop: 16, padding: '10px 24px', background: 'var(--f1)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer' }}
                >
                  CREATE YOUR FIRST PADDOCK
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {visiblePaddocks.map(p => (
                  <div
                    key={p.paddock_id}
                    style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8, padding: '14px 16px', opacity: p.archived ? 0.7 : 1 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-body-lg)', color: 'var(--paper)' }}>
                            {p.name}
                          </div>
                          {p.archived && <ArchivedBadge />}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.1em' }}>
                            {p.member_count} {p.member_count === 1 ? 'member' : 'members'}
                          </span>
                          {p.role === 'owner' && (
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--f1)', letterSpacing: '0.12em', fontWeight: 700 }}>
                              OWNER
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {p.role === 'owner' && (
                          <button
                            onClick={() => setSettingsPaddock(p)}
                            aria-label="Paddock settings"
                            style={{ padding: '8px 10px', background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 6, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}
                          >
                            ⚙
                          </button>
                        )}
                        <button
                          onClick={() => enterPaddock(p.paddock_id)}
                          style={{ padding: '8px 16px', background: 'var(--f1)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          ENTER →
                        </button>
                      </div>
                    </div>
                    {/* Invite code strip */}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 10px', background: 'var(--elev)', borderRadius: 6, cursor: 'pointer' }}
                      onClick={() => copyCode(p.invite_code)}
                    >
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-label)', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--paper)', flex: 1 }}>
                        {p.invite_code}
                      </span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: copied === p.invite_code ? 'var(--positive)' : 'var(--mute)', letterSpacing: '0.1em' }}>
                        {copied === p.invite_code ? 'COPIED ✓' : 'COPY CODE'}
                      </span>
                    </div>
                  </div>
                ))}
                {archivedCount > 0 && (
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    style={{ padding: '10px', border: 'none', background: 'transparent', color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', cursor: 'pointer' }}
                  >
                    {showArchived ? '▾ HIDE ARCHIVED' : `▸ SHOW ARCHIVED (${archivedCount})`}
                  </button>
                )}
                <button
                  onClick={() => setTab('create')}
                  style={{ marginTop: 4, padding: '12px', border: '1px dashed var(--rule)', borderRadius: 8, background: 'transparent', color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', cursor: 'pointer' }}
                >
                  + CREATE ANOTHER PADDOCK
                </button>
              </div>
            )}
            {settingsPaddock && (
              <CompetitionSettingsModal
                competitionType="paddock"
                competitionId={settingsPaddock.paddock_id}
                name={settingsPaddock.name}
                archived={settingsPaddock.archived}
                archivedAt={settingsPaddock.archived_at}
                onUpdated={refreshPaddocks}
                onClose={() => setSettingsPaddock(null)}
              />
            )}
          </div>
        )}

        {/* CREATE */}
        {tab === 'create' && (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {myCircles.length > 0 && (
              <div>
                <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 8, textTransform: 'uppercase' }}>
                  Clubhouse (optional)
                </label>
                <select
                  value={selectedCircleId ?? ''}
                  onChange={e => setSelectedCircleId(e.target.value || null)}
                  style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
                >
                  <option value="">No clubhouse</option>
                  {myCircles.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 8, textTransform: 'uppercase' }}>
                Paddock Name
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. The Tifosi Garage"
                maxLength={40}
                style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {err && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--danger)' }}>{err}</div>}
            <button
              type="submit"
              disabled={busy || !name.trim()}
              style={{ padding: '13px', background: busy || !name.trim() ? 'var(--mute)' : 'var(--f1)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.14em', cursor: busy || !name.trim() ? 'default' : 'pointer' }}
            >
              {busy ? 'CREATING…' : 'CREATE PADDOCK →'}
            </button>
          </form>
        )}

        {/* JOIN */}
        {tab === 'join' && (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 8, textTransform: 'uppercase' }}>
                Invite Code
              </label>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="8-CHARACTER CODE"
                maxLength={8}
                style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-heading)', fontWeight: 700, letterSpacing: '0.25em', color: 'var(--paper)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase' }}
              />
            </div>
            {err && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--danger)' }}>{err}</div>}
            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              style={{ padding: '13px', background: busy || code.trim().length < 6 ? 'var(--mute)' : 'var(--f1)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.14em', cursor: busy || code.trim().length < 6 ? 'default' : 'pointer' }}
            >
              {busy ? 'JOINING…' : 'JOIN PADDOCK →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
