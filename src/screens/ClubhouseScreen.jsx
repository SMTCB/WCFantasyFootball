import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useClubhouseContext } from '../context/ClubhouseContext';
import { useSport } from '../context/SportContext';
import { useAuth } from '../hooks/useAuth';
import { useWallet } from '../hooks/useWallet';
import { useChallenges } from '../hooks/useChallenges';
import { useClubhouseFrontpage } from '../hooks/useClubhouseFrontpage';
import ClubhouseChat from '../components/ClubhouseChat';
import ClubhouseFrontpage from '../components/ClubhouseFrontpage';
import TabStrip from '../components/shared/TabStrip';
import { ArchivedBadge } from '../components/league/LeagueBadges';

const MONO = { fontFamily: 'JetBrains Mono, monospace' };
const HEAD = { fontFamily: 'Archivo Black, sans-serif' };
const BODY = { fontFamily: 'Archivo, sans-serif' };
const AVATAR_COLORS = ['var(--accent)', 'var(--f1)', 'var(--ten)', 'var(--gold)', '#7C3AED', '#4B5568'];
const SPORT_META = {
  football: { label: 'Football', emoji: '⚽', color: 'var(--accent)' },
  f1:       { label: 'F1',       emoji: '🏁', color: 'var(--f1)'    },
  tennis:   { label: 'Tennis',   emoji: '🎾', color: 'var(--ten)'   },
};

function timeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString)) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Empty / no-circles state ──────────────────────────────────────────────────
function ClubhouseLobby({ createCircle, joinCircleByCode }) {
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
        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.14em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 14 }}>
          Welcome to Frontrow
        </div>
        <h1 style={{ ...HEAD, fontSize: 'var(--fs-title)', color: 'var(--paper)', letterSpacing: '-0.02em', lineHeight: 1.15, margin: '0 0 14px' }}>
          Every game you play lives in one room.
        </h1>
        <p style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--mute)', lineHeight: 1.6, margin: '0 0 28px' }}>
          Create a Clubhouse for your group, or join one with an invite code — football leagues, F1 paddocks and tennis boxes all show up inside it.
        </p>

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', textAlign: 'left' }}>
          {/* Create — primary, dark shell fill */}
          <div style={{ flex: '1 1 240px', background: 'var(--shell)', border: '1px solid var(--shell)', borderRadius: 8, padding: '20px 18px', color: '#fff' }}>
            <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--on-shell-dim)', marginBottom: 8 }}>
              Start fresh
            </div>
            <div style={{ ...HEAD, fontSize: 'var(--fs-body)', marginBottom: 6 }}>Create a Clubhouse</div>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--on-shell-dim)', marginBottom: 14 }}>
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
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--shell-rule-emphasis)', borderRadius: 6, ...BODY, fontSize: 'var(--fs-body)', color: '#fff', background: 'var(--shell-fill-strong)', outline: 'none', boxSizing: 'border-box' }}
                />
                {createErr && <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: '#FF8A8A' }}>{createErr}</div>}
                <button
                  type="submit"
                  disabled={busy === 'create' || !name.trim()}
                  style={{ display: 'block', textAlign: 'center', padding: 11, background: '#fff', color: 'var(--shell)', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: busy === 'create' || !name.trim() ? 'default' : 'pointer', opacity: busy === 'create' || !name.trim() ? 0.6 : 1 }}
                >
                  {busy === 'create' ? 'Creating…' : 'Create Clubhouse'}
                </button>
              </form>
            ) : (
              <button
                onClick={() => setCreating(true)}
                style={{ display: 'block', width: '100%', textAlign: 'center', padding: 11, background: '#fff', color: 'var(--shell)', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                Create Clubhouse
              </button>
            )}
          </div>

          {/* Join — secondary, always-visible code input */}
          <div style={{ flex: '1 1 240px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8, padding: '20px 18px' }}>
            <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 8 }}>
              Have a code?
            </div>
            <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', marginBottom: 6 }}>Join with an invite</div>
            <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="FK-XXXXX"
                maxLength={8}
                style={{ width: '100%', padding: '10px 12px', background: 'var(--elev)', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-body)', fontWeight: 600, letterSpacing: '0.1em', color: 'var(--paper)', outline: 'none', boxSizing: 'border-box' }}
              />
              {joinErr && <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--danger)' }}>{joinErr}</div>}
              <button
                type="submit"
                disabled={busy === 'join' || code.trim().length < 6}
                style={{ display: 'block', textAlign: 'center', padding: 11, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: busy === 'join' || code.trim().length < 6 ? 'default' : 'pointer', opacity: busy === 'join' || code.trim().length < 6 ? 0.6 : 1 }}
              >
                {busy === 'join' ? 'Joining…' : 'Join Clubhouse'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Quick-access shortcut card ────────────────────────────────────────────────
function ShortcutCard({ eyebrow, value, sublabel, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: '1 1 160px', minWidth: 150, textAlign: 'left', cursor: 'pointer',
        background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 8,
        padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 4,
      }}
    >
      <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.14em', color: 'var(--mute)', textTransform: 'uppercase' }}>
        {eyebrow}
      </div>
      <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.1 }}>
        {value}
      </div>
      {sublabel && (
        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>{sublabel}</div>
      )}
    </button>
  );
}

// ── Unified competition cards (all sports, one grid) ─────────────────────────
function AllCompetitions({ competitions, onEnter }) {
  const allComps = [
    ...(competitions.football ?? []).map(c => ({ ...c, sport: 'football' })),
    ...(competitions.f1      ?? []).map(c => ({ ...c, sport: 'f1'       })),
    ...(competitions.tennis  ?? []).map(c => ({ ...c, sport: 'tennis'   })),
  ];
  if (allComps.length === 0) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 12 }}>
        COMPETITIONS
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {allComps.map(item => {
          const meta = SPORT_META[item.sport] ?? SPORT_META.football;
          return (
            <button
              key={`${item.sport}-${item.id}`}
              onClick={() => onEnter(item, item.sport)}
              style={{
                display: 'flex', flexDirection: 'column',
                background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8,
                overflow: 'hidden', cursor: 'pointer', textAlign: 'left', padding: 0,
              }}
            >
              {/* Sport-coloured accent bar */}
              <div style={{ height: 3, background: meta.color, flexShrink: 0 }} />
              <div style={{ padding: '13px 15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.25 }}>{item.name}</div>
                    {item.archived && <ArchivedBadge />}
                  </div>
                  <span style={{
                    flexShrink: 0,
                    ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em',
                    color: meta.color,
                    background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                    padding: '2px 8px', borderRadius: 100, textTransform: 'uppercase',
                  }}>
                    {meta.emoji} {meta.label}
                  </span>
                </div>
                {item.format && (
                  <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {item.format}
                  </div>
                )}
                <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.08em' }}>ENTER →</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────
function FeedEntry({ entry, onEnter }) {
  const typeLabel = {
    activity:      'GW RESULT',
    breaking_news: 'NEWS',
    auction_result:'AUCTION',
    trade_result:  'TRADE',
    draft_report:  'DRAFT',
    classified:    'CLASSIFIED',
  }[entry.entry_type] ?? entry.entry_type.toUpperCase();

  const typeColor = {
    activity:      'var(--cyan)',
    breaking_news: 'var(--accent)',
    auction_result:'var(--positive)',
    trade_result:  'var(--positive)',
    draft_report:  'var(--mute)',
    classified:    'var(--gold)',
  }[entry.entry_type] ?? 'var(--mute)';

  const ago = timeAgo(entry.created_at);
  const clickable = onEnter && entry.league_id;

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? () => onEnter(entry.league_id) : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') onEnter(entry.league_id); } : undefined}
      style={{ padding: '12px 0', borderBottom: '1px solid var(--rule)', cursor: clickable ? 'pointer' : 'default' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.12em', color: typeColor }}>{typeLabel}</span>
          {entry.league_name && (
            <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.08em' }}>{entry.league_name}</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', whiteSpace: 'nowrap', letterSpacing: '0.08em' }}>{ago}</span>
          {clickable && <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--accent)', letterSpacing: '0.08em' }}>→</span>}
        </div>
      </div>
      <div style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.4 }}>{entry.headline}</div>
    </div>
  );
}

// ── Members tab ───────────────────────────────────────────────────────────────
function formatJoinDate(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function MembersTab({ members, isOwner, currentUserId, onKick, metaStandings }) {
  const [kicking, setKicking] = useState(null);

  async function handleKick(userId) {
    setKicking(userId);
    try { await onKick(userId); }
    finally { setKicking(null); }
  }

  if (members.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
        No members yet.
      </div>
    );
  }
  const metaByUser = new Map((metaStandings ?? []).map(s => [s.user_id, s]));
  const owners  = members.filter(m => m.role === 'owner');
  const regular = members.filter(m => m.role !== 'owner');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[...owners, ...regular].map(m => {
        const meta = metaByUser.get(m.user_id);
        const joinDate = formatJoinDate(m.joined_at);
        return (
          <div
            key={m.user_id}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8, flexWrap: 'wrap' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.role === 'owner' ? 'var(--accent)' : 'var(--elev)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ ...MONO, fontSize: 'var(--fs-label)', fontWeight: 700, color: m.role === 'owner' ? 'var(--on-shell)' : 'var(--paper)' }}>
                {(m.username?.[0] ?? '?').toUpperCase()}
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 120 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ ...MONO, fontSize: 'var(--fs-label)', color: 'var(--paper)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.username}
                </span>
                {m.role === 'owner' && (
                  <span style={{
                    ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--gold)',
                    border: '1px solid var(--gold)', borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                  }}>
                    OWNER
                  </span>
                )}
              </div>
              {joinDate && (
                <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 2 }}>
                  Joined {joinDate}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
              {meta && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...MONO, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--paper)' }}>{meta.trophy_count}</div>
                  <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.06em' }}>TROPHIES</div>
                </div>
              )}
            </div>
            {isOwner && m.role !== 'owner' && m.user_id !== currentUserId && (
              <button
                onClick={() => handleKick(m.user_id)}
                disabled={kicking === m.user_id}
                style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--danger)', borderRadius: 4, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--danger)', cursor: 'pointer', flexShrink: 0 }}
              >
                {kicking === m.user_id ? '…' : 'KICK'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Settings tab (owner only) ─────────────────────────────────────────────────
function SettingsTab({ circle, activeCircleId, members, onUpdateSettings, onLinkLeague, getOwnerLinkableLeagues, getCircleCompetitionAdmins, onSetCompetitionAdmin, onRemoveCompetitionAdmin }) {
  const [name,        setName]        = useState(circle.name);
  const [isPublic,    setIsPublic]    = useState(circle.is_public);
  const [p2pEnabled,  setP2pEnabled]  = useState(circle.p2p_betting_enabled);
  const [savingName,  setSavingName]  = useState(false);
  const [nameMsg,     setNameMsg]     = useState('');
  const [linkableLeagues, setLinkableLeagues] = useState(null);
  const [loadingLeagues,  setLoadingLeagues]  = useState(false);
  const [linkingId,       setLinkingId]       = useState(null);
  const [linkMsg,         setLinkMsg]         = useState('');
  const [competitionAdmins, setCompetitionAdmins] = useState(null);
  const [loadingAdmins,     setLoadingAdmins]     = useState(false);
  const [adminMsg,          setAdminMsg]          = useState('');
  const [pendingKey,         setPendingKey]        = useState(null);
  const [assignPicks,       setAssignPicks]       = useState({});

  async function saveName(e) {
    e.preventDefault();
    if (!name.trim() || name.trim() === circle.name) return;
    setSavingName(true); setNameMsg('');
    try {
      await onUpdateSettings({ name: name.trim() });
      setNameMsg('Saved ✓');
      setTimeout(() => setNameMsg(''), 2000);
    } catch (err) {
      setNameMsg(err.message);
    } finally {
      setSavingName(false);
    }
  }

  async function togglePublic() {
    const next = !isPublic;
    setIsPublic(next);
    try { await onUpdateSettings({ isPublic: next }); }
    catch { setIsPublic(!next); }
  }

  async function toggleP2p() {
    const next = !p2pEnabled;
    setP2pEnabled(next);
    try { await onUpdateSettings({ p2pEnabled: next }); }
    catch { setP2pEnabled(!next); }
  }

  async function loadLinkableLeagues() {
    setLoadingLeagues(true); setLinkMsg('');
    try {
      const result = await getOwnerLinkableLeagues(activeCircleId);
      setLinkableLeagues(result);
    } catch (err) {
      setLinkMsg(err.message);
    } finally {
      setLoadingLeagues(false);
    }
  }

  async function handleLink(leagueId) {
    setLinkingId(leagueId); setLinkMsg('');
    try {
      await onLinkLeague(leagueId);
      setLinkableLeagues(prev => prev.filter(l => l.id !== leagueId));
      setLinkMsg('League linked ✓');
      setTimeout(() => setLinkMsg(''), 2000);
    } catch (err) {
      setLinkMsg(err.message === 'NOT_COMMISSIONER' ? 'You must be commissioner of that league.' : err.message);
    } finally {
      setLinkingId(null);
    }
  }

  async function loadCompetitionAdmins() {
    setLoadingAdmins(true); setAdminMsg('');
    try {
      const result = await getCircleCompetitionAdmins(activeCircleId);
      setCompetitionAdmins(result);
    } catch (err) {
      setAdminMsg(err.message);
    } finally {
      setLoadingAdmins(false);
    }
  }

  async function handleAssignAdmin(competitionType, competitionId) {
    const userId = assignPicks[competitionId];
    if (!userId) return;
    const key = `assign-${competitionId}`;
    setPendingKey(key); setAdminMsg('');
    try {
      await onSetCompetitionAdmin(competitionType, competitionId, userId);
      await loadCompetitionAdmins();
      setAssignPicks(prev => ({ ...prev, [competitionId]: '' }));
    } catch (err) {
      setAdminMsg(err.message);
    } finally {
      setPendingKey(null);
    }
  }

  async function handleRemoveAdmin(competitionType, competitionId, userId) {
    const key = `remove-${competitionId}-${userId}`;
    setPendingKey(key); setAdminMsg('');
    try {
      await onRemoveCompetitionAdmin(competitionType, competitionId, userId);
      await loadCompetitionAdmins();
    } catch (err) {
      setAdminMsg(err.message);
    } finally {
      setPendingKey(null);
    }
  }

  const sectionLabel = (text) => (
    <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.16em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 10, marginTop: 20 }}>
      {text}
    </div>
  );

  const toggle = (label, sublabel, value, onToggle) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8 }}>
      <div>
        <div style={{ ...MONO, fontSize: 'var(--fs-label)', color: 'var(--paper)', fontWeight: 600 }}>{label}</div>
        {sublabel && <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2 }}>{sublabel}</div>}
      </div>
      <button
        onClick={onToggle}
        style={{
          flexShrink: 0,
          width: 44, height: 24, borderRadius: 12,
          background: value ? 'var(--accent)' : 'var(--elev)',
          border: 'none', cursor: 'pointer', position: 'relative', transition: 'background 0.15s',
        }}
        aria-checked={value}
        role="switch"
      >
        <div style={{
          position: 'absolute', top: 3, left: value ? 23 : 3,
          width: 18, height: 18, borderRadius: '50%', background: '#fff',
          transition: 'left 0.15s',
        }} />
      </button>
    </div>
  );

  return (
    <div>
      {sectionLabel('Clubhouse Name')}
      <form onSubmit={saveName} style={{ display: 'flex', gap: 8 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={40}
          style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 6, ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', background: 'var(--card)', outline: 'none' }}
        />
        <button
          type="submit"
          disabled={savingName || !name.trim() || name.trim() === circle.name}
          style={{ padding: '10px 16px', background: savingName || !name.trim() || name.trim() === circle.name ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {savingName ? '…' : 'SAVE'}
        </button>
      </form>
      {nameMsg && <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: nameMsg.includes('✓') ? 'var(--positive)' : 'var(--danger)', marginTop: 6 }}>{nameMsg}</div>}

      {sectionLabel('Visibility & Features')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toggle('Public Clubhouse', 'Anyone can find and join via search.', isPublic, togglePublic)}
        {toggle('P2P Betting', 'Enable peer-to-peer bets across this Clubhouse.', p2pEnabled, toggleP2p)}
      </div>

      {sectionLabel('Linked Leagues')}
      {linkableLeagues === null ? (
        <button
          onClick={loadLinkableLeagues}
          disabled={loadingLeagues}
          style={{ width: '100%', padding: 12, border: '1px dashed var(--rule)', borderRadius: 8, background: 'transparent', color: loadingLeagues ? 'var(--mute)' : 'var(--accent)', ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.1em', cursor: 'pointer' }}
        >
          {loadingLeagues ? 'LOADING…' : '+ LINK AN EXISTING LEAGUE →'}
        </button>
      ) : linkableLeagues.length === 0 ? (
        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', textAlign: 'center', padding: '16px 0' }}>
          All your leagues are already linked — or you are not a commissioner of any unlinked league.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {linkableLeagues.map(l => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8 }}>
              <div>
                <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>{l.name}</div>
                {l.format && <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{l.format}</div>}
              </div>
              <button
                onClick={() => handleLink(l.id)}
                disabled={linkingId === l.id}
                style={{ padding: '7px 14px', background: linkingId === l.id ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {linkingId === l.id ? '…' : 'LINK'}
              </button>
            </div>
          ))}
        </div>
      )}
      {linkMsg && <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: linkMsg.includes('✓') ? 'var(--positive)' : 'var(--danger)', marginTop: 8 }}>{linkMsg}</div>}

      {sectionLabel('Competition Admins')}
      {competitionAdmins === null ? (
        <button
          onClick={loadCompetitionAdmins}
          disabled={loadingAdmins}
          style={{ width: '100%', padding: 12, border: '1px dashed var(--rule)', borderRadius: 8, background: 'transparent', color: loadingAdmins ? 'var(--mute)' : 'var(--accent)', ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.1em', cursor: 'pointer' }}
        >
          {loadingAdmins ? 'LOADING…' : '+ MANAGE COMPETITION ADMINS →'}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'Leagues',      type: 'league',     list: competitionAdmins.leagues ?? [] },
            { label: 'F1 Paddocks',  type: 'paddock',     list: competitionAdmins.f1 ?? [] },
            { label: 'Tennis Boxes', type: 'player_box',  list: competitionAdmins.tennis ?? [] },
          ].map(group => group.list.length === 0 ? null : (
            <div key={group.type}>
              <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.1em', marginBottom: 6, textTransform: 'uppercase' }}>{group.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.list.map(comp => (
                  <div key={comp.id} style={{ padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>{comp.name}</div>
                      <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', whiteSpace: 'nowrap' }}>Creator: {comp.creator_username ?? '—'}</div>
                    </div>
                    {comp.assigned_admins.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {comp.assigned_admins.map(a => (
                          <div key={a.user_id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--elev)', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--paper)' }}>
                            {a.username}
                            <button
                              onClick={() => handleRemoveAdmin(group.type, comp.id, a.user_id)}
                              disabled={pendingKey === `remove-${comp.id}-${a.user_id}`}
                              style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 0, fontSize: 'var(--fs-label)', lineHeight: 1 }}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <select
                        value={assignPicks[comp.id] ?? ''}
                        onChange={e => setAssignPicks(prev => ({ ...prev, [comp.id]: e.target.value }))}
                        style={{ flex: 1, padding: '6px 10px', border: '1px solid var(--rule)', borderRadius: 6, ...BODY, fontSize: 'var(--fs-label)', color: 'var(--paper)', background: 'var(--card)', outline: 'none' }}
                      >
                        <option value="">Assign admin…</option>
                        {(members ?? [])
                          .filter(m => !comp.assigned_admins.some(a => a.user_id === m.user_id))
                          .map(m => (
                            <option key={m.user_id} value={m.user_id}>{m.username}</option>
                          ))}
                      </select>
                      <button
                        onClick={() => handleAssignAdmin(group.type, comp.id)}
                        disabled={!assignPicks[comp.id] || pendingKey === `assign-${comp.id}`}
                        style={{ padding: '6px 12px', background: !assignPicks[comp.id] ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                      >
                        {pendingKey === `assign-${comp.id}` ? '…' : 'ADD'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {(competitionAdmins.leagues ?? []).length === 0 && (competitionAdmins.f1 ?? []).length === 0 && (competitionAdmins.tennis ?? []).length === 0 && (
            <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', textAlign: 'center', padding: '16px 0' }}>
              No competitions linked to this Clubhouse yet.
            </div>
          )}
        </div>
      )}
      {adminMsg && <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--danger)', marginTop: 8 }}>{adminMsg}</div>}
    </div>
  );
}

// ── Find (search public clubhouses) ──────────────────────────────────────────
function FindTab({ searchClubhouses, joinCircleByCode }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(null);
  const [err, setErr] = useState('');

  async function handleSearch(e) {
    e.preventDefault();
    if (query.trim().length < 2) return;
    setBusy(true); setErr('');
    try { setResults(await searchClubhouses(query)); }
    catch (e) { setErr(e.message === 'QUERY_TOO_SHORT' ? 'Enter at least 2 characters.' : e.message); }
    finally { setBusy(false); }
  }

  async function handleJoin(code) {
    setJoining(code); setErr('');
    try { await joinCircleByCode(code); }
    catch (e) {
      setErr(e.message === 'ALREADY_MEMBER' ? 'You are already a member.' : e.message);
    }
    finally { setJoining(null); }
  }

  return (
    <div>
      <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name…"
          style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 6, ...BODY, fontSize: 'var(--fs-body)', color: 'var(--paper)', background: 'var(--card)', outline: 'none' }}
        />
        <button
          type="submit"
          disabled={busy || query.trim().length < 2}
          style={{ padding: '10px 16px', background: busy || query.trim().length < 2 ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {busy ? '…' : 'SEARCH'}
        </button>
      </form>

      {err && <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--danger)', marginBottom: 12 }}>{err}</div>}

      {results !== null && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
          No public Clubhouses found for "{query}".
        </div>
      )}

      {results !== null && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8 }}>
              <div>
                <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>{r.name}</div>
                <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.08em', marginTop: 2 }}>
                  {r.member_count} {r.member_count === 1 ? 'member' : 'members'}
                </div>
              </div>
              {r.already_member ? (
                <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--positive)', fontWeight: 700, letterSpacing: '0.1em' }}>JOINED ✓</span>
              ) : (
                <button
                  onClick={() => handleJoin(r.invite_code)}
                  disabled={joining === r.invite_code}
                  style={{ padding: '8px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {joining === r.invite_code ? 'JOINING…' : 'JOIN'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {results === null && !busy && (
        <div style={{ textAlign: 'center', padding: '32px 0', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', lineHeight: 1.8 }}>
          Search for public Clubhouses by name.<br />
          Private Clubhouses are invite-code only.
        </div>
      )}
    </div>
  );
}

// ── Notification bell + dropdown (S-08) ───────────────────────────────────────
const NOTIF_TYPE_META = {
  frontpage_edition:  { badge: 'TIMES',     color: 'var(--accent)' },
  breaking_news:      { badge: 'NEWS',      color: 'var(--danger)' },
  direct_message:     { badge: 'DM',        color: 'var(--cyan)'   },
  arbitration_needed: { badge: 'ARBITRATE', color: 'var(--purple)' },
};

function NotifList({ notifications, onMarkRead, onNavigate, onNavigated }) {
  if (notifications.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '32px 0', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
        No notifications yet.
      </div>
    );
  }
  return notifications.map(n => {
    const meta   = NOTIF_TYPE_META[n.type] ?? { badge: n.type.toUpperCase(), color: 'var(--mute)' };
    const isNew  = !n.read_at;
    const canNav = (n.source_type === 'league' || n.source_type === 'p2p_challenge') && n.source_id;
    return (
      <div
        key={n.id}
        role={canNav ? 'button' : undefined}
        tabIndex={canNav ? 0 : undefined}
        onClick={() => {
          if (isNew) onMarkRead(n.id);
          if (canNav) { onNavigate(n); onNavigated?.(); }
        }}
        style={{
          display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 14px',
          borderBottom: '1px solid var(--rule)',
          background: isNew ? 'var(--accent-bg)' : 'transparent',
          cursor: canNav ? 'pointer' : 'default',
        }}
      >
        <div style={{ paddingTop: 5, flexShrink: 0, width: 6 }}>
          {isNew && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
            <span style={{ ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', color: meta.color }}>{meta.badge}</span>
            <span style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.07em' }}>{timeAgo(n.created_at)}</span>
          </div>
          <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--paper)', lineHeight: 1.4 }}>
            {n.payload?.headline ?? n.payload?.preview ?? n.type}
          </div>
        </div>
      </div>
    );
  });
}

function NotifBell({ notifications, unreadCount, onMarkRead, onMarkAll, onNavigate, isDesktop }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Notifications"
        style={{
          position: 'relative', width: 32, height: 32, borderRadius: 6,
          background: 'var(--shell-fill-strong)', border: '1px solid var(--shell-rule-strong)',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {/* Two-tone tray/inbox glyph — CSS-built, not an emoji */}
        <div style={{ width: 14, height: 11, border: '1.5px solid var(--shell-rule-emphasis)', borderTop: 'none', borderRadius: '0 0 2px 2px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: -1, left: -1.5, right: -1.5, height: 1.5, background: 'var(--shell-fill-active)' }} />
        </div>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: -4, right: -4, minWidth: 15, height: 15, borderRadius: 100,
            background: 'var(--danger)', color: '#fff', ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && !isDesktop && (
        // Mobile: dedicated full screen with a back button (S-08) — no room for a dropdown at this width
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'var(--card)', display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--rule)', flexShrink: 0 }}>
            <button
              onClick={() => setOpen(false)}
              style={{ background: 'transparent', border: 'none', color: 'var(--paper)', fontSize: 'var(--fs-heading)', cursor: 'pointer', padding: '2px 4px 2px 0', lineHeight: 1 }}
              aria-label="Back"
            >
              ←
            </button>
            <span style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', flex: 1 }}>Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAll}
                style={{ ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}
              >
                MARK ALL READ
              </button>
            )}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            <NotifList notifications={notifications} onMarkRead={onMarkRead} onNavigate={onNavigate} onNavigated={() => setOpen(false)} />
          </div>
        </div>
      )}

      {open && isDesktop && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{
            position: 'absolute', top: 40, right: 0, width: 360, maxWidth: '90vw', zIndex: 41,
            background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 10,
            boxShadow: '0 8px 28px rgba(0,0,0,0.18)', overflow: 'hidden',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', borderBottom: '1px solid var(--rule)' }}>
              <span style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAll}
                  style={{ ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                >
                  MARK ALL READ
                </button>
              )}
            </div>
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
              <NotifList notifications={notifications} onMarkRead={onMarkRead} onNavigate={onNavigate} onNavigated={() => setOpen(false)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ClubhouseScreen() {
  const { circleId: routeCircleId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { setActivePaddockId } = useSport();
  const {
    myCircles,
    activeCircle,
    activeCircleId,
    setActiveCircleId,
    competitions,
    feed,
    members,
    metaStandings,
    notifications,
    unreadCount,
    loading,
    createCircle,
    joinCircleByCode,
    searchClubhouses,
    updateSettings,
    kickMember,
    linkLeague,
    getOwnerLinkableLeagues,
    getCircleCompetitionAdmins,
    setCompetitionAdmin,
    removeCompetitionAdmin,
    markRead,
    markAllRead,
  } = useClubhouseContext();

  const { wallet } = useWallet(user?.id);
  const { active: activeChallenges, incoming: incomingChallenges } = useChallenges(user?.id);
  const frontpage = useClubhouseFrontpage(activeCircleId);

  const [tab, setTab] = useState(() => searchParams.get('tab') ?? 'home');
  const [copied, setCopied] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Honour explicit URL param
  useEffect(() => {
    if (routeCircleId && routeCircleId !== activeCircleId) {
      setActiveCircleId(routeCircleId);
    }
  }, [routeCircleId, activeCircleId, setActiveCircleId]);

  // Keep URL in sync when active circle changes
  useEffect(() => {
    if (activeCircleId && !routeCircleId) {
      navigate(`/clubhouse/${activeCircleId}`, { replace: true });
    }
  }, [activeCircleId, routeCircleId, navigate]);

  function copyCode() {
    if (!activeCircle?.invite_code) return;
    navigator.clipboard?.writeText(activeCircle.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function enterLeague(league) {
    navigate(`/league/${league.id}`);
  }

  function enterPaddock(paddock) {
    setActivePaddockId(paddock.id);
    navigate(`/f1/${paddock.id}`);
  }

  const isOwner = activeCircle?.role === 'owner';
  const totalComps  = (competitions.football?.length ?? 0) + (competitions.f1?.length ?? 0) + (competitions.tennis?.length ?? 0);
  const activeSports = [(competitions.football?.length ?? 0) > 0, (competitions.f1?.length ?? 0) > 0, (competitions.tennis?.length ?? 0) > 0].filter(Boolean).length;

  const myStandingIndex = metaStandings.findIndex(e => e.user_id === user?.id);
  const myStanding  = myStandingIndex >= 0 ? metaStandings[myStandingIndex] : null;
  const myRank      = myStanding ? (myStanding.rank ?? myStandingIndex + 1) : null;
  const leadPoints  = metaStandings[0]?.total_points;
  const pointsBehind = myStanding && leadPoints !== undefined ? leadPoints - (myStanding.total_points ?? 0) : null;

  // 5 tabs on desktop (chat lives in the persistent rail); 6 on mobile (chat gets its own tab, no rail)
  const MAIN_TABS = [
    { key: 'home',      label: 'HOME'           },
    { key: 'frontrow',  label: 'THE FRONTROW'   },
    ...(!isDesktop ? [{ key: 'chat', label: 'CHAT' }] : []),
    { key: 'members',   label: 'MEMBERS'        },
    { key: 'find',      label: 'FIND'           },
    ...(isOwner ? [{ key: 'settings', label: 'SETTINGS' }] : []),
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 32 }}>

      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '20px 20px 18px' }}>
        <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--on-shell-dim)', textTransform: 'uppercase', marginBottom: 8 }}>
          🏠 THE CLUBHOUSE
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          {/* Left: name + member avatars */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ ...HEAD, fontSize: 'var(--fs-title)', color: 'var(--on-shell)', margin: 0, lineHeight: 1.1 }}>
              {activeCircle ? activeCircle.name.toUpperCase() : 'CLUBHOUSE'}
            </h1>
            {activeCircle && (
              <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
                {members.slice(0, 5).map((m, i) => (
                  <div
                    key={m.user_id}
                    style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                      display: 'grid', placeItems: 'center',
                      fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-micro)', color: '#fff',
                      border: '2px solid var(--shell)',
                      marginRight: -6, position: 'relative', zIndex: 5 - i,
                      flexShrink: 0,
                    }}
                  >
                    {(m.username?.[0] ?? '?').toUpperCase()}
                  </div>
                ))}
                {members.length > 5 && (
                  <div style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: 'var(--shell-fill-active)',
                    display: 'grid', placeItems: 'center',
                    ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--on-shell-dim)',
                    border: '2px solid var(--shell)',
                    marginRight: -6, zIndex: 0, flexShrink: 0,
                  }}>
                    +{members.length - 5}
                  </div>
                )}
                <span style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.08em', color: 'var(--on-shell-dim)', marginLeft: 18, flexShrink: 0 }}>
                  {members.length} {members.length === 1 ? 'MEMBER' : 'MEMBERS'}
                  {activeCircle.is_public && <span style={{ color: 'var(--positive)', marginLeft: 6 }}>· PUBLIC</span>}
                </span>
              </div>
            )}
          </div>

          {/* Right: notif bell + stats + invite code */}
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10 }}>
              {activeCircle && totalComps > 0 && (
                <div style={{ display: 'flex', gap: 20 }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>{activeSports}</div>
                    <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--on-shell-faint)', marginTop: 2 }}>SPORTS</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...HEAD, fontSize: 'var(--fs-heading)', color: '#fff', letterSpacing: '-0.02em', lineHeight: 1 }}>{totalComps}</div>
                    <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--on-shell-faint)', marginTop: 2 }}>COMPETITIONS</div>
                  </div>
                </div>
              )}
              {activeCircle?.invite_code && (
                <button
                  onClick={copyCode}
                  title="Copy invite code"
                  style={{ padding: '6px 12px', background: 'var(--shell-fill-strong)', border: '1px solid var(--shell-rule-strong)', borderRadius: 6, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
                >
                  <span style={{ ...MONO, fontSize: 'var(--fs-label)', fontWeight: 700, letterSpacing: '0.2em', color: '#fff' }}>
                    {activeCircle.invite_code}
                  </span>
                  <span style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.1em', color: copied ? 'var(--positive)' : 'var(--on-shell-dim)' }}>
                    {copied ? 'COPIED ✓' : 'COPY CODE'}
                  </span>
                </button>
              )}
            </div>
            <NotifBell
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={markRead}
              onMarkAll={() => markAllRead(activeCircleId)}
              isDesktop={isDesktop}
              onNavigate={(n) => navigate(n.source_type === 'p2p_challenge' ? '/challenges' : `/league/${n.source_id}`)}
            />
          </div>
        </div>
      </div>

      {/* Clubhouse switcher (multi-clubhouse, mobile only — desktop uses the sidebar switcher) */}
      {!isDesktop && myCircles.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', borderBottom: '1px solid var(--rule)', scrollbarWidth: 'none' }}>
          {myCircles.map(c => (
            <button
              key={c.id}
              onClick={() => { setActiveCircleId(c.id); navigate(`/clubhouse/${c.id}`, { replace: true }); }}
              style={{
                flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: '1px solid',
                borderColor: c.id === activeCircleId ? 'var(--accent)' : 'var(--rule)',
                background: c.id === activeCircleId ? 'var(--accent-bg)' : 'transparent',
                color: c.id === activeCircleId ? 'var(--accent)' : 'var(--mute)',
                ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
          Loading…
        </div>
      ) : myCircles.length === 0 ? (
        <ClubhouseLobby createCircle={createCircle} joinCircleByCode={joinCircleByCode} />
      ) : (
        <>
          <TabStrip variant="underline" tabs={MAIN_TABS} active={tab} onTab={setTab} />

          {/* Full-width tabs — rendered outside the max-width container */}
          {tab === 'frontrow' && (
            <ClubhouseFrontpage
              circleId={activeCircleId}
              circleName={activeCircle?.name}
              isOwner={activeCircle?.role === 'owner'}
            />
          )}

          {/* Chat tab — mobile's only view of chat; desktop reaches it via the rail's expand button (S-06) */}
          {tab === 'chat' && (
            <ClubhouseChat
              circleId={activeCircleId}
              members={members}
              activeCircle={activeCircle}
              layout="full"
            />
          )}

          {/* HOME tab — main column + persistent chat rail (desktop) */}
          {tab === 'home' && (
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <div style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Quick-access shortcuts */}
                <div style={{ display: 'flex', gap: 10, overflowX: isDesktop ? 'visible' : 'auto', flexWrap: isDesktop ? 'wrap' : 'nowrap' }}>
                  <ShortcutCard
                    eyebrow="Coin Wallet"
                    value={`${(wallet?.balance ?? 0).toLocaleString()} coins`}
                    sublabel={(wallet?.escrow ?? 0) > 0 ? `${wallet.escrow.toLocaleString()} in escrow` : undefined}
                    onClick={() => navigate('/wallet')}
                  />
                  <ShortcutCard
                    eyebrow="P2P Challenges"
                    value={`${activeChallenges.length} active`}
                    sublabel={incomingChallenges.length > 0 ? `${incomingChallenges.length} awaiting your move` : 'No pending requests'}
                    onClick={() => navigate('/challenges')}
                  />
                  <ShortcutCard
                    eyebrow="Meta Rank"
                    value={myRank ? `#${myRank} of ${metaStandings.length}` : '—'}
                    sublabel={pointsBehind !== null ? (pointsBehind > 0 ? `${pointsBehind} pts behind` : 'In the lead') : undefined}
                    onClick={() => navigate('/trophy')}
                  />
                </div>

                {/* All competition cards — unified grid */}
                <AllCompetitions
                  competitions={competitions}
                  onEnter={(item, sport) => {
                    if (sport === 'football') enterLeague(item);
                    else if (sport === 'f1') enterPaddock(item);
                    else navigate(`/tennis/${item.id}`);
                  }}
                />

                {/* Empty state — no competitions yet */}
                {competitions.football.length === 0 && competitions.f1.length === 0 && competitions.tennis.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
                    <div style={{ fontSize: 'var(--fs-title)', marginBottom: 12 }}>🏟️</div>
                    <p style={{ ...HEAD, fontSize: 'var(--fs-body-lg)', color: 'var(--paper)', margin: '0 0 8px' }}>
                      No competitions yet
                    </p>
                    <p style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--mute)', margin: '0 0 20px' }}>
                      Create a Football league, F1 Paddock, or Tennis Player Box to get started.<br />
                      You can also chat and bet without playing.
                    </p>
                    <button
                      onClick={() => navigate('/league')}
                      style={{ padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer' }}
                    >
                      + CREATE A COMPETITION →
                    </button>
                  </div>
                )}

                {/* FrontRow teaser */}
                <button
                  onClick={() => setTab('frontrow')}
                  style={{
                    textAlign: 'left', cursor: 'pointer', border: '1px solid #E5DFC8', borderRadius: 8,
                    background: '#F2EEE5', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.14em', color: '#8A8368', textTransform: 'uppercase' }}>
                    THE FRONTROW{frontpage.edition ? ` · EDITION #${frontpage.edition.edition_number}` : ''}
                  </div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: 'var(--fs-body)', color: '#1A1A18', fontStyle: frontpage.edition ? 'normal' : 'italic' }}>
                    {frontpage.edition?.headline ?? 'No edition published yet today.'}
                  </div>
                  <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: '#8A8368', marginTop: 2 }}>READ THE FRONTROW →</div>
                </button>

                {/* Activity feed */}
                {feed.length > 0 && (
                  <div>
                    <div style={{ ...MONO, fontSize: 'var(--fs-micro)', letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 12 }}>
                      Activity
                    </div>
                    {feed.map(entry => (
                      <FeedEntry key={entry.id} entry={entry} onEnter={enterLeague} />
                    ))}
                  </div>
                )}

                {feed.length === 0 && totalComps > 0 && (
                  <div style={{ ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', textAlign: 'center', padding: '16px 0' }}>
                    Activity will appear here once competitions start.
                  </div>
                )}
              </div>

              {/* Persistent chat rail — desktop only; mobile uses the Chat tab */}
              {isDesktop && (
                <div style={{ width: 330, flexShrink: 0, borderLeft: '1px solid var(--rule)' }}>
                  <ClubhouseChat
                    circleId={activeCircleId}
                    members={members}
                    activeCircle={activeCircle}
                    layout="rail"
                    onExpand={() => setTab('chat')}
                  />
                </div>
              )}
            </div>
          )}

          {/* Remaining tabs share the max-width reading container */}
          {(tab === 'members' || tab === 'find' || (tab === 'settings' && isOwner)) && (
            <div style={{ padding: '20px 16px', maxWidth: 640, margin: '0 auto' }}>
              {tab === 'members' && (
                <MembersTab
                  members={members}
                  isOwner={isOwner}
                  currentUserId={user?.id}
                  onKick={(userId) => kickMember(activeCircleId, userId)}
                  metaStandings={metaStandings}
                />
              )}

              {tab === 'find' && (
                <FindTab searchClubhouses={searchClubhouses} joinCircleByCode={joinCircleByCode} />
              )}

              {tab === 'settings' && isOwner && activeCircle && (
                <SettingsTab
                  circle={activeCircle}
                  activeCircleId={activeCircleId}
                  members={members}
                  onUpdateSettings={(patch) => updateSettings(activeCircleId, patch)}
                  onLinkLeague={(leagueId) => linkLeague(activeCircleId, leagueId)}
                  getOwnerLinkableLeagues={getOwnerLinkableLeagues}
                  getCircleCompetitionAdmins={getCircleCompetitionAdmins}
                  onSetCompetitionAdmin={(type, competitionId, userId) => setCompetitionAdmin(activeCircleId, type, competitionId, userId)}
                  onRemoveCompetitionAdmin={(type, competitionId, userId) => removeCompetitionAdmin(activeCircleId, type, competitionId, userId)}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
