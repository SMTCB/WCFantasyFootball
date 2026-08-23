import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePlayerBox } from '../../hooks/tennis/usePlayerBox';
import { supabase } from '../../lib/supabase';
import { useShowArchived } from '../../hooks/useShowArchived';
import { ArchivedBadge } from '../../components/league/LeagueBadges';
import CompetitionSettingsModal from '../../components/shared/CompetitionSettingsModal';

const SURFACE_ICON = { hard: '🎾', clay: '🟫', grass: '🌿', hard_indoor: '🏟️' };

export default function PlayerBoxScreen() {
  const navigate = useNavigate();
  const { myBoxes, loading, createPlayerBox, joinByCode, setActivePlayerBoxId, refresh: refreshBoxes } = usePlayerBox();

  const [tab, setTab] = useState('my');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(null);
  const [myCircles, setMyCircles] = useState([]);
  const [selectedCircleId, setSelectedCircleId] = useState(null);
  const [showArchived, setShowArchived] = useShowArchived('ffl_show_archived_player_boxes');
  const [settingsBox, setSettingsBox] = useState(null);

  const archivedCount = myBoxes.filter(b => b.archived).length;
  const visibleBoxes = showArchived ? myBoxes : myBoxes.filter(b => !b.archived);

  useEffect(() => {
    supabase.rpc('get_my_circles').then(({ data }) => {
      if (data?.length) {
        setMyCircles(data);
        setSelectedCircleId(data[0].id);
      }
    });
  }, []);

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim() || !selectedCircleId) return;
    setBusy(true); setErr('');
    try {
      const id = await createPlayerBox(name.trim(), selectedCircleId);
      navigate(`/tennis?box=${id}`);
    } catch (e) {
      setErr(e.message === 'TENNIS_SPORT_NOT_FOUND' ? 'Tennis sport not configured — contact admin.' : e.message);
    } finally { setBusy(false); }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setBusy(true); setErr('');
    try {
      const id = await joinByCode(code.trim());
      navigate(`/tennis?box=${id}`);
    } catch (e) {
      setErr(e.message === 'PLAYER_BOX_NOT_FOUND' ? 'Invite code not found — check the code and try again.' : e.message);
    } finally { setBusy(false); }
  }

  function enterBox(id) {
    setActivePlayerBoxId(id);
    navigate('/tennis');
  }

  function copyCode(c) {
    navigator.clipboard?.writeText(c);
    setCopied(c);
    setTimeout(() => setCopied(null), 2000);
  }

  const TABS = [
    { key: 'my',     label: "My Boxes" },
    { key: 'create', label: 'Create' },
    { key: 'join',   label: 'Join' },
  ];

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', paddingBottom: 32 }}>
      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '24px 20px 20px' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--on-shell-dim)', textTransform: 'uppercase', marginBottom: 6 }}>
          🎾 Tennis · 2026
        </div>
        <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-title)', color: 'var(--on-shell)', margin: 0, lineHeight: 1.1 }}>
          The Player's Box
        </h1>
        <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--on-shell-dim)', margin: '6px 0 0' }}>
          Your private prediction group — create one or join a friend's.
        </p>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid var(--rule)', display: 'flex', background: 'var(--card)' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setErr(''); }}
            style={{
              flex: 1, padding: '12px 0',
              fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', fontWeight: 600,
              cursor: 'pointer', border: 'none',
              borderBottom: tab === t.key ? '2px solid var(--ten)' : '2px solid transparent',
              background: 'transparent',
              color: tab === t.key ? 'var(--ten)' : 'var(--mute)',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ padding: '20px 16px', maxWidth: 480, margin: '0 auto' }}>

        {/* MY BOXES */}
        {tab === 'my' && (
          <div>
            {loading ? (
              <div style={{ color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', textAlign: 'center', padding: 40 }}>
                Loading…
              </div>
            ) : myBoxes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 'var(--fs-display)', marginBottom: 12 }}>🎾</div>
                <p style={{ fontFamily: 'Archivo, sans-serif', color: 'var(--mute)', fontSize: 'var(--fs-body)', margin: '0 0 16px' }}>
                  You haven't joined any Player's Boxes yet.
                </p>
                <button
                  onClick={() => setTab('create')}
                  style={{ padding: '10px 24px', background: 'var(--ten)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', fontWeight: 600, cursor: 'pointer' }}
                >
                  Create your first box
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {visibleBoxes.map(b => (
                  <div key={b.player_box_id} style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '14px 16px', opacity: b.archived ? 0.7 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-body-lg)', color: 'var(--paper)' }}>
                            {b.name}
                          </div>
                          {b.archived && <ArchivedBadge />}
                        </div>
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.1em' }}>
                            {b.member_count} {b.member_count === 1 ? 'member' : 'members'}
                          </span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {b.is_owner && (
                          <button
                            onClick={() => setSettingsBox(b)}
                            aria-label="Player's Box settings"
                            style={{ padding: '8px 10px', background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 6, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-label)', color: 'var(--mute)' }}
                          >
                            ⚙
                          </button>
                        )}
                        <button
                          onClick={() => enterBox(b.player_box_id)}
                          style={{ padding: '8px 16px', background: 'var(--ten)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          Enter →
                        </button>
                      </div>
                    </div>
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '8px 10px', background: 'var(--elev)', borderRadius: 6, cursor: 'pointer' }}
                      onClick={() => copyCode(b.invite_code)}
                    >
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-label)', fontWeight: 700, letterSpacing: '0.2em', color: 'var(--paper)', flex: 1 }}>
                        {b.invite_code}
                      </span>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: copied === b.invite_code ? 'var(--pos)' : 'var(--mute)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        {copied === b.invite_code ? 'Copied ✓' : 'Copy code'}
                      </span>
                    </div>
                  </div>
                ))}
                {archivedCount > 0 && (
                  <button
                    onClick={() => setShowArchived(v => !v)}
                    style={{ padding: '10px', border: 'none', background: 'transparent', color: 'var(--mute)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-label)', cursor: 'pointer' }}
                  >
                    {showArchived ? 'Hide archived' : `Show archived (${archivedCount})`}
                  </button>
                )}
                <button
                  onClick={() => setTab('create')}
                  style={{ marginTop: 4, padding: '12px', border: '1px dashed var(--rule)', borderRadius: 6, background: 'transparent', color: 'var(--mute)', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', cursor: 'pointer' }}
                >
                  + Create another box
                </button>
              </div>
            )}
            {settingsBox && (
              <CompetitionSettingsModal
                competitionType="player_box"
                competitionId={settingsBox.player_box_id}
                name={settingsBox.name}
                archived={settingsBox.archived}
                archivedAt={settingsBox.archived_at}
                onUpdated={refreshBoxes}
                onClose={() => setSettingsBox(null)}
              />
            )}
          </div>
        )}

        {/* CREATE */}
        {tab === 'create' && (
          myCircles.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 0' }}>
              <p style={{ fontFamily: 'Archivo, sans-serif', color: 'var(--mute)', fontSize: 'var(--fs-body)', margin: 0 }}>
                You need a Clubhouse before creating a Player's Box. Create or join one from the Clubhouse tab first.
              </p>
            </div>
          ) : (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 8, textTransform: 'uppercase' }}>
                Clubhouse
              </label>
              <select
                value={selectedCircleId ?? ''}
                onChange={e => setSelectedCircleId(e.target.value || null)}
                style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box', cursor: 'pointer' }}
              >
                {myCircles.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 8, textTransform: 'uppercase' }}>
                Box Name
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. The Baseline Crew"
                maxLength={40}
                style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {err && <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--neg)' }}>{err}</div>}
            <button
              type="submit"
              disabled={busy || !name.trim() || !selectedCircleId}
              style={{ padding: '13px', background: busy || !name.trim() || !selectedCircleId ? 'var(--mute)' : 'var(--ten)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', fontWeight: 600, cursor: busy || !name.trim() || !selectedCircleId ? 'default' : 'pointer' }}
            >
              {busy ? 'Creating…' : 'Create Player\'s Box →'}
            </button>
          </form>
          )
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
            {err && <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--neg)' }}>{err}</div>}
            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              style={{ padding: '13px', background: busy || code.trim().length < 6 ? 'var(--mute)' : 'var(--ten)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', fontWeight: 600, cursor: busy || code.trim().length < 6 ? 'default' : 'pointer' }}
            >
              {busy ? 'Joining…' : 'Join Player\'s Box →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
