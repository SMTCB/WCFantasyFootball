import { useState, useEffect, useRef } from 'react';
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
import { useShowArchived } from '../hooks/useShowArchived';
import NotificationBell from '../components/NotificationBell';
import ClubhouseInviteModal from '../components/ClubhouseInviteModal';

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
                    <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.25, minWidth: 0, overflowWrap: 'anywhere' }}>{item.name}</div>
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
  const enter = () => onEnter({ id: entry.league_id });

  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? enter : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') enter(); } : undefined}
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
  const [archived,    setArchived]    = useState(circle.archived);
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

  async function toggleArchived() {
    const next = !archived;
    if (next && !window.confirm('Archive this Clubhouse? It will be hidden from your switcher and Home dashboard until you reactivate. Nothing is deleted.')) return;
    setArchived(next);
    try { await onUpdateSettings({ archived: next }); }
    catch { setArchived(!next); }
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
      {archived && (
        <div style={{ padding: '10px 14px', marginBottom: 16, background: 'var(--shell-fill)', border: '1px solid var(--rule)', borderRadius: 8, ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--mute)', letterSpacing: '0.06em' }}>
          ARCHIVED{circle.archived_at ? ` · SINCE ${new Date(circle.archived_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}. Hidden from your switcher and Home dashboard.
        </div>
      )}

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
        {toggle('Group Bets', 'On by default. Turn off to restrict betting to 1:1 challenges only.', p2pEnabled, toggleP2p)}
      </div>

      {sectionLabel('Archive')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toggle('Archive this Clubhouse', 'Hides it from your switcher and Home dashboard. Nothing is deleted — reactivate any time.', archived, toggleArchived)}
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

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ClubhouseScreen() {
  const { circleId: routeCircleId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { setActivePaddockId, setActivePlayerBoxId } = useSport();
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
    updateSettings,
    kickMember,
    linkLeague,
    getOwnerLinkableLeagues,
    getCircleCompetitionAdmins,
    setCompetitionAdmin,
    removeCompetitionAdmin,
    markRead,
    markAllRead,
    openNewCompetitionFlow,
  } = useClubhouseContext();

  const { wallet } = useWallet(user?.id);
  const { active: activeChallenges, incoming: incomingChallenges, outgoing: outgoingChallenges } = useChallenges(user?.id, activeCircleId);
  const frontpage = useClubhouseFrontpage(activeCircleId);

  const [tab, setTab] = useState(() => searchParams.get('tab') ?? 'home');
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true);
  const [showInvite, setShowInvite] = useState(false);
  const [joinCodeStatus, setJoinCodeStatus] = useState(null); // 'joining' | { error } | null
  const handledCircleCode = useRef(null);

  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Auto-join via ?circleCode= — set by JoinClubhouseRoute (App.jsx) after a
  // /join-clubhouse?code=X share link (WhatsApp invite, copied link, etc).
  // Runs regardless of how many Clubhouses the user already belongs to.
  useEffect(() => {
    const circleCode = searchParams.get('circleCode');
    if (!circleCode || handledCircleCode.current === circleCode) return;
    handledCircleCode.current = circleCode;
    setJoinCodeStatus('joining');
    joinCircleByCode(circleCode)
      .then((circleId) => {
        setJoinCodeStatus(null);
        navigate(`/clubhouse/${circleId}`, { replace: true });
      })
      .catch((err) => {
        setJoinCodeStatus({ error: err.message === 'INVALID_CODE' ? 'That invite code was not found — check and try again.' : err.message });
        navigate('/clubhouse', { replace: true });
      });
  }, [searchParams, joinCircleByCode, navigate]);

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

  function enterLeague(league) {
    navigate(`/league/${league.id}`);
  }

  function enterPaddock(paddock) {
    setActivePaddockId(paddock.id);
    navigate(`/f1/${paddock.id}`);
  }

  function enterPlayerBox(box) {
    // get_clubhouse_competitions returns player_boxes.id for tennis entries — a Player Box
    // is a container of tournaments, not a single tournament, so it routes through /tennis
    // (which reads the active box from SportContext), never directly to /tennis/tournament/:id.
    setActivePlayerBoxId(box.id);
    navigate('/tennis');
  }

  const isOwner = activeCircle?.role === 'owner';
  const [showArchivedClubhouses] = useShowArchived('ffl_show_archived_clubhouses');
  const switcherCircles = showArchivedClubhouses ? myCircles : myCircles.filter(c => !c.archived);
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
            <h1 style={{ ...HEAD, fontSize: 'var(--fs-title)', color: 'var(--on-shell)', margin: 0, lineHeight: 1.1, overflowWrap: 'anywhere' }}>
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
          <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
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
                  onClick={() => setShowInvite(true)}
                  title="Invite people to this Clubhouse"
                  style={{ padding: '8px 14px', background: 'var(--accent)', border: 'none', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <span style={{ fontSize: 'var(--fs-label)' }}>💬</span>
                  <span style={{ ...MONO, fontSize: 'var(--fs-label)', fontWeight: 700, letterSpacing: '0.1em', color: '#0a0e14' }}>
                    INVITE
                  </span>
                </button>
              )}
            </div>
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={markRead}
              onMarkAll={() => markAllRead(activeCircleId)}
              isDesktop={isDesktop}
              onNavigate={(n) => navigate((n.source_type === 'p2p_bet' || n.source_type === 'p2p_challenge') ? '/challenges' : `/league/${n.source_id}`)}
            />
          </div>
        </div>
      </div>

      {joinCodeStatus === 'joining' && (
        <div style={{ padding: '10px 16px', background: 'var(--accent-bg)', borderBottom: '1px solid var(--rule)', ...MONO, fontSize: 'var(--fs-micro)', color: 'var(--accent)', textAlign: 'center' }}>
          Joining Clubhouse…
        </div>
      )}
      {joinCodeStatus?.error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 16px', background: 'rgba(220,60,60,0.1)', borderBottom: '1px solid rgba(220,60,60,0.3)', ...MONO, fontSize: 'var(--fs-micro)', color: '#e05a5a' }}>
          <span>{joinCodeStatus.error}</span>
          <button onClick={() => setJoinCodeStatus(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', ...MONO, fontSize: 'var(--fs-micro)' }}>✕</button>
        </div>
      )}

      {/* Clubhouse switcher (multi-clubhouse, mobile only — desktop uses the sidebar switcher) */}
      {!isDesktop && switcherCircles.length > 1 && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', borderBottom: '1px solid var(--rule)', scrollbarWidth: 'none' }}>
          {switcherCircles.map(c => (
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
                    value={`${activeChallenges.length + incomingChallenges.length + outgoingChallenges.length} open`}
                    sublabel={
                      incomingChallenges.length > 0 ? `${incomingChallenges.length} awaiting your move`
                        : outgoingChallenges.length > 0 ? `${outgoingChallenges.length} awaiting response`
                        : 'No pending requests'
                    }
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
                    else enterPlayerBox(item);
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
                      onClick={openNewCompetitionFlow}
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
          {(tab === 'members' || (tab === 'settings' && isOwner)) && (
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

      {showInvite && activeCircle && (
        <ClubhouseInviteModal circle={activeCircle} onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
}
