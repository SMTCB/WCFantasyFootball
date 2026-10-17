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
    { key: 'my',     label: 'My paddocks' },
    { key: 'create', label: 'Create' },
    { key: 'join',   label: 'Join' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background: 'var(--card)', padding: '24px 20px 20px' }}>
        <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 6 }}>
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
              fontFamily: 'Archivo, sans-serif',
              fontSize: 'var(--fs-label)',
              fontWeight: 700,
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
              <div style={{ color: 'var(--mute)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', textAlign: 'center', padding: 40 }}>
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
                  style={{ marginTop: 16, padding: '10px 24px', background: 'var(--f1)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer' }}
                >
                  Create your first paddock
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
                          <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
                            {p.member_count} {p.member_count === 1 ? 'member' : 'members'}
                          </span>
                          {p.role === 'owner' && (
                            <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--f1)', fontWeight: 700 }}>
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
                            style={{ padding: '8px 10px', background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', cursor: 'pointer', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}
                          >
                            ⚙
                          </button>
                        )}
                        <button
                          onClick={() => enterPaddock(p.paddock_id)}
                          style={{ padding: '8px 16px', background: 'var(--f1)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          Enter →
                        </button>
                      </div>
                    </div>
                    {/* Invite code strip */}
                    <div role="button" tabIndex={0} onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); (() => copyCode(p.invite_code))(e); } }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 10px', background: 'var(--elev)', borderRadius: 'var(--radius)', cursor: 'pointer' }}
                      onClick={() => copyCode(p.invite_code)}
                    >
                      <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--paper)', flex: 1 }}>
                        {p.invite_code}
                      </span>
                      <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: copied === p.invite_code ? 'var(--positive)' : 'var(--mute)' }}>
                        {copied === p.invite_code ? 'Copied ✓' : 'Copy code'}
                      </span>
                    </div>
                  </div>
                ))}
                {archivedCount > 0 && (
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    style={{ padding: '10px', border: 'none', background: 'transparent', color: 'var(--mute)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', cursor: 'pointer' }}
                  >
                    {showArchived ? '▾ HIDE ARCHIVED' : `▸ SHOW ARCHIVED (${archivedCount})`}
                  </button>
                )}
                <button
                  onClick={() => setTab('create')}
                  style={{ marginTop: 4, padding: '12px', border: '1px dashed var(--rule)', borderRadius: 8, background: 'transparent', color: 'var(--mute)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', cursor: 'pointer' }}
                >
                  + Create another paddock
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
                <label style={{ display: 'block', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 8 }}>
                  Clubhouse (optional)
                </label>
                <select
                  value={selectedCircleId ?? ''}
                  onChange={e => setSelectedCircleId(e.target.value || null)}
                  style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
                >
                  <option value="">No clubhouse</option>
                  {myCircles.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label style={{ display: 'block', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 8 }}>
                Paddock Name
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. The Tifosi Garage"
                maxLength={40}
                style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {err && <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--danger)' }}>{err}</div>}
            <button
              type="submit"
              disabled={busy || !name.trim()}
              style={{ padding: '13px', background: busy || !name.trim() ? 'var(--mute)' : 'var(--f1)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', fontWeight: 700, cursor: busy || !name.trim() ? 'default' : 'pointer' }}
            >
              {busy ? 'Creating…' : 'Create paddock →'}
            </button>
          </form>
        )}

        {/* JOIN */}
        {tab === 'join' && (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 8 }}>
                Invite Code
              </label>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="8-CHARACTER CODE"
                maxLength={8}
                style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-heading)', fontWeight: 700, color: 'var(--paper)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {err && <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', color: 'var(--danger)' }}>{err}</div>}
            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              style={{ padding: '13px', background: busy || code.trim().length < 6 ? 'var(--mute)' : 'var(--f1)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', fontWeight: 700, cursor: busy || code.trim().length < 6 ? 'default' : 'pointer' }}
            >
              {busy ? 'Joining…' : 'Join paddock →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
