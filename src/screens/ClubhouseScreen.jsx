import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useClubhouseContext } from '../context/ClubhouseContext';
import { useSport } from '../context/SportContext';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useWallet } from '../hooks/useWallet';
import { useYourMove } from '../hooks/useYourMove';
import { YourMoveLine } from '../components/YourMove';
import { useClubhouseFrontpage } from '../hooks/useClubhouseFrontpage';
import ClubhouseChat from '../components/ClubhouseChat';
import ClubhouseFrontpage from '../components/ClubhouseFrontpage';
import TabStrip from '../components/shared/TabStrip';
import { ArchivedBadge, FinishedBadge } from '../components/league/LeagueBadges';
import NotificationBell from '../components/NotificationBell';
import ClubhouseInviteModal from '../components/ClubhouseInviteModal';
import useConfirmDialog from '../hooks/useConfirmDialog';
import MembersTable from '../components/clubhouse/MembersTable';
import ClubhouseLobby from '../components/clubhouse/ClubhouseLobby';
import { SportBanner } from '../components/shared/SportGround';
import { useHereNow } from '../hooks/useHereNow';
import { useRoomPulse } from '../hooks/useRoomPulse';
import { useMyLeaguePositions, summarisePositions } from '../hooks/useMyLeaguePositions';

const MONO = { fontFamily: 'Archivo, sans-serif' };
const HEAD = { fontFamily: 'Archivo Black, sans-serif' };
const BODY = { fontFamily: 'Archivo, sans-serif' };
const SPORT_META = {
  football: { label: 'Football', color: 'var(--accent)' },
  f1:       { label: 'F1',       color: 'var(--f1)'    },
  tennis:   { label: 'Tennis',   color: 'var(--ten)'   },
};

// ── Quick-access shortcut card ────────────────────────────────────────────────
// ── Unified competition cards (all sports, one grid) ─────────────────────────
function ordinal(n) {
  const v = n % 100;
  const s = (v >= 11 && v <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
  return `${n}${s}`;
}

// "3rd of 8 · 412 pts · 6 behind Sam" for a league card. Leaders show their lead.
function standingText(p) {
  const head = p.size > 1 ? `${ordinal(p.rank)} of ${p.size}` : 'Only entry';
  const parts = [head, `${p.total} pts`];
  if (p.rank === 1 && p.below) parts.push(`${p.total - p.below.total} clear of ${p.below.name}`);
  else if (p.above) parts.push(`${p.above.total - p.total} behind ${p.above.name}`);
  return parts.join(' · ');
}

// The line under a clubhouse name: how you are doing across its leagues.
function clubhouseLine(summary) {
  if (!summary.total) return null;
  const { leading, contested, closest, best } = summary;
  let line;
  if (leading > 0) line = `You lead ${leading} of ${contested} ${contested === 1 ? 'league' : 'leagues'}`;
  else if (best && best.size > 1) line = `You're ${ordinal(best.rank)} in ${best.leagueName}`;
  else return null;
  if (closest) line += closest.gap === 0 ? ` · level with ${closest.other}` : ` · ${closest.gap} pts ${closest.dir} ${closest.other}`;
  return line;
}

function AllCompetitions({ competitions, onEnter, positionFor }) {
  const allComps = [
    ...(competitions.football ?? []).map(c => ({ ...c, sport: 'football' })),
    ...(competitions.f1      ?? []).map(c => ({ ...c, sport: 'f1'       })),
    ...(competitions.tennis  ?? []).map(c => ({ ...c, sport: 'tennis'   })),
  ];
  if (allComps.length === 0) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 'var(--fs-body)', fontWeight: 700, color: 'var(--paper)' }}>Leagues</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
        {allComps.map(item => {
          return (
            <button
              key={`${item.sport}-${item.id}`}
              onClick={() => onEnter(item, item.sport)}
              style={{
                display: 'flex', flexDirection: 'column',
                background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)',
                overflow: 'hidden', cursor: 'pointer', textAlign: 'left', padding: 0,
              }}
            >
              <SportBanner sport={item.sport} />
              <div style={{ padding: '13px 15px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                  <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)', lineHeight: 1.25, minWidth: 0, flex: 1, overflowWrap: 'break-word' }}>{item.name}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  {item.format && <span style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>{item.format}</span>}
                  {item.finished && <FinishedBadge />}
                  {item.archived && <ArchivedBadge />}
                </div>
                {(() => {
                  const pos = positionFor?.(item.sport, item.id);
                  return (
                    <div style={{ marginTop: 'auto', paddingTop: 10, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
                      {pos ? (
                        <span className="num" style={{ fontSize: 'var(--fs-label)', fontWeight: 600, color: pos.rank === 1 && pos.size > 1 ? 'var(--gold-text)' : 'var(--text-2)', lineHeight: 1.35, minWidth: 0 }}>
                          {standingText(pos)}
                        </span>
                      ) : <span />}
                      <span style={{ fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>Enter →</span>
                    </div>
                  );
                })()}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Members tab ───────────────────────────────────────────────────────────────
function formatJoinDate(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function MembersTab({ members, isOwner, currentUserId, onKick, metaStandings, records, onChallenge }) {
  const [kicking, setKicking] = useState(null);

  async function handleKick(userId) {
    setKicking(userId);
    try { await onKick(userId); }
    finally { setKicking(null); }
  }

  if (members.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
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
        const rec = records?.get(m.user_id);
        return (
          <div
            key={m.user_id}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', minHeight: 'var(--tap)', flexWrap: 'wrap' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.role === 'owner' ? 'var(--accent)' : 'var(--elev)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ ...MONO, fontSize: 'var(--fs-label)', fontWeight: 700, color: m.role === 'owner' ? 'var(--on-accent)' : 'var(--paper)' }}>
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
                    ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--gold-text)',
                    border: '1px solid var(--gold)', borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                  }}>
                    OWNER
                  </span>
                )}
              </div>
              {joinDate && (
                <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2 }}>
                  Joined {joinDate}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 14, flexShrink: 0 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ ...MONO, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--paper)' }}>{rec ? `${rec.won}/${rec.played}` : '0/0'}</div>
                <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>BETS WON</div>
              </div>
              {meta && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...MONO, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--paper)' }}>{meta.trophy_count}</div>
                  <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>TROPHIES</div>
                </div>
              )}
            </div>
            {m.user_id !== currentUserId && onChallenge && (
              <button className="hit-44"
                onClick={() => onChallenge(m.user_id)}
                style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--gold)', borderRadius: 4, ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--gold-text)', cursor: 'pointer', flexShrink: 0 }}
              >Challenge</button>
            )}
            {isOwner && m.role !== 'owner' && m.user_id !== currentUserId && (
              <button className="hit-44"
                onClick={() => handleKick(m.user_id)}
                disabled={kicking === m.user_id}
                style={{ padding: '5px 10px', background: 'transparent', border: '1px solid var(--danger)', borderRadius: 4, ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--danger)', cursor: 'pointer', flexShrink: 0 }}
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
  const [askConfirm, confirmDialog] = useConfirmDialog();
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
      setNameMsg('Saved');
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

  function toggleArchived() {
    if (archived) { applyArchived(false); return; }
    askConfirm({
      title: 'Archive this Clubhouse?',
      body: 'It will be hidden from your switcher and Home dashboard until you reactivate. Nothing is deleted.',
      confirmLabel: 'Archive',
      onConfirm: () => applyArchived(true),
    });
  }

  async function applyArchived(next) {
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
      setLinkMsg('League linked');
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
    <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 10, marginTop: 20 }}>
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
          width: 18, height: 18, borderRadius: '50%', background: 'var(--on-accent)',
          transition: 'left 0.15s',
        }} />
      </button>
    </div>
  );

  return (
    <div>
      {confirmDialog}
      {archived && (
        <div style={{ padding: '10px 14px', marginBottom: 16, background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 'var(--radius)', ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)' }}>
          ARCHIVED{circle.archived_at ? ` · SINCE ${new Date(circle.archived_at).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}. Hidden from your switcher and Home dashboard.
        </div>
      )}

      {sectionLabel('Clubhouse Name')}
      <form onSubmit={saveName} style={{ display: 'flex', gap: 8 }}>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={40}
          className="ffl-input" style={{ flex: 1 }}
        />
        <button
          type="submit"
          disabled={savingName || !name.trim() || name.trim() === circle.name}
          style={{ padding: '10px 16px', background: savingName || !name.trim() || name.trim() === circle.name ? 'var(--mute)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {savingName ? '…' : 'SAVE'}
        </button>
      </form>
      {nameMsg && <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: nameMsg.includes('✓') ? 'var(--positive)' : 'var(--danger)', marginTop: 6 }}>{nameMsg}</div>}

      {sectionLabel('Visibility & Features')}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {toggle('Public Clubhouse', 'Anyone can find and join via search.', isPublic, togglePublic)}
        {toggle('Bets with the group', 'On by default. Turn off to allow only one-on-one bets.', p2pEnabled, toggleP2p)}
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
          style={{ width: '100%', padding: 12, border: '1px dashed var(--rule)', borderRadius: 8, background: 'transparent', color: loadingLeagues ? 'var(--mute)' : 'var(--accent)', ...BODY, fontSize: 'var(--fs-label)', cursor: 'pointer' }}
        >
          {loadingLeagues ? 'LOADING…' : '+ LINK AN EXISTING LEAGUE →'}
        </button>
      ) : linkableLeagues.length === 0 ? (
        <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', textAlign: 'center', padding: '16px 0' }}>
          All your leagues are already linked — or you are not a commissioner of any unlinked league.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {linkableLeagues.map(l => (
            <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8 }}>
              <div>
                <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>{l.name}</div>
                {l.format && <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', marginTop: 2 }}>{l.format}</div>}
              </div>
              <button
                onClick={() => handleLink(l.id)}
                disabled={linkingId === l.id}
                style={{ padding: '7px 14px', background: linkingId === l.id ? 'var(--mute)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {linkingId === l.id ? '…' : 'LINK'}
              </button>
            </div>
          ))}
        </div>
      )}
      {linkMsg && <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: linkMsg.includes('✓') ? 'var(--positive)' : 'var(--danger)', marginTop: 8 }}>{linkMsg}</div>}

      {sectionLabel('League admins')}
      {competitionAdmins === null ? (
        <button
          onClick={loadCompetitionAdmins}
          disabled={loadingAdmins}
          style={{ width: '100%', padding: 12, border: '1px dashed var(--rule)', borderRadius: 8, background: 'transparent', color: loadingAdmins ? 'var(--mute)' : 'var(--accent)', ...BODY, fontSize: 'var(--fs-label)', cursor: 'pointer' }}
        >
          {loadingAdmins ? 'LOADING…' : '+ MANAGE COMPETITION ADMINS →'}
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[
            { label: 'Leagues',      type: 'league',     list: competitionAdmins.leagues ?? [] },
            { label: 'F1 leagues',  type: 'paddock',     list: competitionAdmins.f1 ?? [] },
            { label: 'Tennis Boxes', type: 'player_box',  list: competitionAdmins.tennis ?? [] },
          ].map(group => group.list.length === 0 ? null : (
            <div key={group.type}>
              <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 6 }}>{group.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.list.map(comp => (
                  <div key={comp.id} style={{ padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                      <div style={{ ...HEAD, fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>{comp.name}</div>
                      <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', whiteSpace: 'nowrap' }}>Creator: {comp.creator_username ?? '—'}</div>
                    </div>
                    {comp.assigned_admins.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {comp.assigned_admins.map(a => (
                          <div key={a.user_id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--elev)', borderRadius: 6, ...BODY, fontSize: 'var(--fs-label)', color: 'var(--paper)' }}>
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
                        className="ffl-input ffl-input--sm" style={{ flex: 1 }}
                      >
                        <option value="">Assign admin…</option>
                        {(members ?? [])
                          .filter(m => !comp.assigned_admins.some(a => a.user_id === m.user_id))
                          .map(m => (
                            <option key={m.user_id} value={m.user_id}>{m.username}</option>
                          ))}
                      </select>
                      <button className="hit-44"
                        onClick={() => handleAssignAdmin(group.type, comp.id)}
                        disabled={!assignPicks[comp.id] || pendingKey === `assign-${comp.id}`}
                        style={{ padding: '6px 12px', background: !assignPicks[comp.id] ? 'var(--mute)' : 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 6, ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
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
            <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--mute)', textAlign: 'center', padding: '16px 0' }}>
              No competitions linked to this Clubhouse yet.
            </div>
          )}
        </div>
      )}
      {adminMsg && <div style={{ ...BODY, fontSize: 'var(--fs-label)', color: 'var(--danger)', marginTop: 8 }}>{adminMsg}</div>}
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
  const move = useYourMove(activeCircleId);
  const frontpage = useClubhouseFrontpage(activeCircleId);

  // MD-5: being on this screen marks you as here now; everyone's dot comes from the same channel.
  const presentIds = useHereNow(activeCircleId, { track: true });
  const hereIds = useMemo(() => {
    const ids = new Set(presentIds);
    if (user?.id) ids.add(user.id);
    return ids;
  }, [presentIds, user?.id]);
  // MD-4: the newest Room line (not a bet notice) pops up over its sender on the table.
  const pulse = useRoomPulse(activeCircleId, { limit: 4 });
  const latestLine = pulse.messages.find(m => m.kind !== 'bet_activity') ?? null;
  // Your standing in each league of this clubhouse, for the cards and the line under the name.
  const thisCircle = useMemo(() => (activeCircle ? [activeCircle] : []), [activeCircle]);
  const compsHere = useMemo(() => (activeCircleId ? { [activeCircleId]: competitions } : {}), [activeCircleId, competitions]);
  const { positions } = useMyLeaguePositions(thisCircle, compsHere);
  const standLine = useMemo(() => clubhouseLine(summarisePositions(positions)), [positions]);
  const positionFor = useCallback(
    (sport, id) => positions.find(p => p.sport === sport && String(p.leagueId) === String(id)) ?? null,
    [positions],
  );

  // Three tabs: room, leagues, people. Old links (home, chat, members) still land on the right tab;
  // 'frontrow' (The Paper) and 'settings' are reachable from Leagues and the gear, not the strip.
  const LEGACY_TABS = { home: 'leagues', chat: 'room', members: 'people' };
  const [tab, setTab] = useState(() => {
    const t = searchParams.get('tab');
    return LEGACY_TABS[t] ?? t ?? 'leagues';
  });
  const [betRecords, setBetRecords] = useState(new Map());
  // A notice about a friend opens the Room on that exact message.
  const [focusMsg, setFocusMsg] = useState(() => searchParams.get('msg'));
  const clearFocus = useCallback(() => setFocusMsg(null), []);
  // The Room lines up under these tabs when it opens (owner 2026-11-21)
  const tabsRef = useRef(null);
  const describeNotice = (n) => {
    if (n.source_type !== 'clubhouse') return null;
    const who = (members ?? []).find(m => m.user_id === n.payload?.actor_id)?.username ?? 'A member';
    if (n.type === 'friend_joined') return `${who} joined the Clubhouse`;
    if (n.type === 'friend_took_bet') return `${who} took your bet: ${n.payload?.question ?? ''}`;
    if (n.type === 'friend_reacted') return `${who} reacted ${n.payload?.emoji ?? ''} to your message`;
    return null;
  };
  // Bet record per member in this Clubhouse: resolved bets they joined, and how many they won.
  // Reads through existing RLS (members can see participants of non-open bets in their Clubhouse).
  useEffect(() => {
    if (!activeCircleId) return;
    let alive = true;
    supabase
      .from('p2p_bet_participants')
      .select('user_id, is_winner, p2p_bets!inner(circle_id, status)')
      .eq('p2p_bets.circle_id', activeCircleId)
      .eq('p2p_bets.status', 'resolved')
      .eq('status', 'joined')
      .then(({ data }) => {
        if (!alive || !data) return;
        const m = new Map();
        for (const r of data) {
          const cur = m.get(r.user_id) ?? { played: 0, won: 0 };
          cur.played += 1;
          if (r.is_winner) cur.won += 1;
          m.set(r.user_id, cur);
        }
        setBetRecords(m);
      });
    return () => { alive = false; };
  }, [activeCircleId]);

  const [viewW, setViewW] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1280);
  const isDesktop = viewW >= 1024;
  const [showInvite, setShowInvite] = useState(false);
  const [joinCodeStatus, setJoinCodeStatus] = useState(null); // 'joining' | { error } | null
  const handledCircleCode = useRef(null);

  useEffect(() => {
    const handler = () => setViewW(window.innerWidth);
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
  const totalComps  = (competitions.football?.length ?? 0) + (competitions.f1?.length ?? 0) + (competitions.tennis?.length ?? 0);

  const MAIN_TABS = [
    { key: 'room',    label: 'The Room' },
    { key: 'leagues', label: 'Leagues' },
    { key: 'people',  label: 'People' },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 32 }}>

      {/* Header: the members table (MD-4), with who is here now (MD-5) */}
      {(() => {
        const gear = isOwner && (
          <button
            onClick={() => setTab('settings')}
            aria-label="Clubhouse settings"
            className="hit-44"
            style={{ minWidth: 'var(--tap)', minHeight: 'var(--tap)', background: 'transparent', border: 'none', color: tab === 'settings' ? 'var(--accent)' : 'var(--mute)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>
          </button>
        );
        const bell = (
          <NotificationBell
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={markRead}
            onMarkAll={() => markAllRead(activeCircleId)}
            isDesktop={isDesktop}
            describe={describeNotice}
            onNavigate={(n) => n.source_type === 'clubhouse' && n.payload?.message_id ? (setFocusMsg(n.payload.message_id), setTab('room')) : navigate((n.source_type === 'p2p_bet' || n.source_type === 'p2p_challenge') ? '/bets' : `/league/${n.source_id}`)}
          />
        );
        const invite = activeCircle?.invite_code && (
          <button
            onClick={() => setShowInvite(true)}
            title="Invite people to this Clubhouse"
            style={{ minHeight: 'var(--tap)', padding: '8px 18px', background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: isDesktop ? 'auto' : '100%' }}
          >
            <span style={{ ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--on-accent)' }}>Invite</span>
          </button>
        );
        const eyebrow = (
          <div style={{ ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mute)', marginBottom: 6 }}>
            Clubhouse{activeCircle && totalComps > 0 ? ` · ${totalComps} ${totalComps === 1 ? 'league' : 'leagues'}` : ''}
            {activeCircle?.is_public && <span style={{ color: 'var(--positive)' }}> · Public</span>}
          </div>
        );
        const name = (
          <h1 style={{ ...HEAD, fontSize: isDesktop ? 'var(--fs-display)' : 'var(--fs-title)', color: 'var(--paper)', margin: 0, lineHeight: 1.02, letterSpacing: '-.01em', overflowWrap: 'anywhere' }}>
            {activeCircle ? activeCircle.name : 'Clubhouse'}
          </h1>
        );
        const sub = standLine && (
          <p style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--text-2)', margin: '10px 0 0', lineHeight: 1.4 }}>{standLine}</p>
        );
        const legend = (
          <div aria-hidden style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap', ...MONO, fontSize: 'var(--fs-micro)', fontWeight: 600, color: 'var(--mute)' }}>
            {[['var(--gold)', 'you'], ['var(--positive)', 'here now'], ['var(--rule)', 'away']].map(([c, l]) => (
              <span key={l} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />{l}
              </span>
            ))}
          </div>
        );
        const table = activeCircle && members.length > 0 && (
          <MembersTable
            members={members}
            meId={user?.id}
            hereIds={hereIds}
            latest={latestLine}
            size={isDesktop ? 380 : Math.min(290, viewW - 40)}
            showNames={isDesktop}
          />
        );

        if (isDesktop) {
          return (
            <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', padding: '28px 32px 22px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: table ? 'minmax(0, 1fr) 440px' : 'minmax(0, 1fr)', gap: 32, alignItems: 'center', maxWidth: 1280, margin: '0 auto' }}>
                <div style={{ minWidth: 0 }}>
                  {eyebrow}
                  {name}
                  {sub}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20 }}>
                    {invite}
                    <span style={{ flex: 1 }} />
                    {gear}
                    {bell}
                  </div>
                </div>
                {table && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, paddingTop: 18 }}>
                    {table}
                    {legend}
                  </div>
                )}
              </div>
            </div>
          );
        }
        return (
          <div style={{ background: 'var(--card)', borderBottom: '1px solid var(--rule)', padding: '18px 20px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                {eyebrow}
                {name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {gear}
                {bell}
              </div>
            </div>
            {sub}
            {table && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginTop: 22 }}>
                {table}
                {legend}
              </div>
            )}
            {invite && <div style={{ marginTop: 16 }}>{invite}</div>}
          </div>
        );
      })()}

      {joinCodeStatus === 'joining' && (
        <div style={{ padding: '10px 16px', background: 'var(--accent-soft)', borderBottom: '1px solid var(--rule)', ...BODY, fontSize: 'var(--fs-label)', color: 'var(--accent)', textAlign: 'center' }}>
          Joining Clubhouse…
        </div>
      )}
      {joinCodeStatus?.error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 16px', background: 'var(--crit-soft)', borderBottom: '1px solid var(--rule)', ...MONO, fontSize: 'var(--fs-label)', color: 'var(--crit)' }}>
          <span>{joinCodeStatus.error}</span>
          <button onClick={() => setJoinCodeStatus(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', ...BODY, fontSize: 'var(--fs-label)' }}>✕</button>
        </div>
      )}

      {loading ? (
        <div role="status" aria-label="Loading" aria-busy="true" className="space-y-2" style={{ padding: '24px 0' }}>{[0, 1, 2, 3].map(i => <div key={i} className="ffl-skeleton ffl-skeleton--row" />)}</div>
      ) : myCircles.length === 0 ? (
        <ClubhouseLobby createCircle={createCircle} joinCircleByCode={joinCircleByCode} />
      ) : (
        <>
          <div ref={tabsRef}><TabStrip variant="underline" tabs={MAIN_TABS} active={tab} onTab={setTab} /></div>

          {/* Full-width tabs — rendered outside the max-width container */}
          {(tab === 'frontrow' || (tab === 'settings' && isOwner)) && (
            <div style={{ padding: '10px 16px 0' }}>
              <button onClick={() => setTab('leagues')} style={{ minHeight: 'var(--tap)', background: 'transparent', border: 'none', color: 'var(--accent)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer' }}>← Back to Leagues</button>
            </div>
          )}
          {tab === 'frontrow' && (
            <ClubhouseFrontpage
              circleId={activeCircleId}
              circleName={activeCircle?.name}
              isOwner={activeCircle?.role === 'owner'}
            />
          )}

          {/* Chat tab — mobile's only view of chat; desktop reaches it via the rail's expand button (S-06) */}
          {tab === 'room' && (<>
            <YourMoveLine move={move} coinsOnTable={wallet?.escrow ?? 0} onWallet={() => navigate('/wallet')} />
            <ClubhouseChat
              circleId={activeCircleId}
              members={members}
              activeCircle={activeCircle}
              feed={feed}
              onEnterLeague={enterLeague}
              layout="full"
              anchorRef={tabsRef}
              focusMessageId={focusMsg}
              onFocusDone={clearFocus}
            />
          </>)}

          {/* HOME tab — main column + persistent chat rail (desktop) */}
          {tab === 'leagues' && (
            <div style={{ display: 'flex', alignItems: 'stretch' }}>
              <div style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Empty Clubhouse: one main action, one quiet one (C-11). Saying hello is the Room's message box. */}
                {(members?.length ?? 0) <= 1 && (
                  <div style={{ border: '1px solid var(--rule)', borderRadius: 'var(--radius)', background: 'var(--card)', padding: '18px 16px', textAlign: 'center' }}>
                    <p style={{ ...HEAD, fontSize: 'var(--fs-body-lg)', color: 'var(--paper)', margin: '0 0 6px' }}>
                      It is just you in here
                    </p>
                    <p style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--mute)', margin: '0 0 14px' }}>
                      A Clubhouse comes alive with friends. Bring someone in with a bet.
                    </p>
                    <button
                      onClick={() => navigate('/challenges?tab=bets&new=1')}
                      style={{ minHeight: 'var(--tap)', padding: '10px 24px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Invite with a bet
                    </button>
                    <div>
                      <button
                        onClick={() => setShowInvite(true)}
                        style={{ minHeight: 'var(--tap)', marginTop: 4, padding: '8px 12px', background: 'transparent', color: 'var(--mute)', border: 'none', ...BODY, fontSize: 'var(--fs-label)', textDecoration: 'underline', cursor: 'pointer' }}
                      >
                        Share a link instead
                      </button>
                    </div>
                    {!isDesktop && (
                      <button
                        onClick={() => setTab('room')}
                        style={{ background: 'transparent', border: 'none', color: 'var(--accent)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', padding: 4 }}
                      >
                        Say hello in The Room
                      </button>
                    )}
                  </div>
                )}

                <YourMoveLine move={move} coinsOnTable={wallet?.escrow ?? 0} onWallet={() => navigate('/wallet')} />

                {/* All competition cards — unified grid */}
                <AllCompetitions
                  competitions={competitions}
                  positionFor={positionFor}
                  onEnter={(item, sport) => {
                    if (sport === 'football') enterLeague(item);
                    else if (sport === 'f1') enterPaddock(item);
                    else enterPlayerBox(item);
                  }}
                />

                {/* Empty state — no competitions yet */}
                {competitions.football.length === 0 && competitions.f1.length === 0 && competitions.tennis.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
                    <p style={{ ...HEAD, fontSize: 'var(--fs-body-lg)', color: 'var(--paper)', margin: '0 0 8px' }}>
                      No competitions yet
                    </p>
                    <p style={{ ...BODY, fontSize: 'var(--fs-body)', color: 'var(--mute)', margin: '0 0 20px' }}>
                      Create a football, F1 or tennis league to get started.<br />
                      You can also chat and bet without playing.
                    </p>
                    <button
                      onClick={openNewCompetitionFlow}
                      style={{ minHeight: 'var(--tap)', padding: '10px 24px', background: 'var(--accent)', color: 'var(--on-accent)', border: 'none', borderRadius: 'var(--radius)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer' }}
                    >
                      Create a competition →
                    </button>
                  </div>
                )}

                {/* FrontRow teaser */}
                <button
                  onClick={() => setTab('frontrow')}
                  style={{
                    textAlign: 'left', cursor: 'pointer', border: '1px solid var(--rule)', borderLeft: '4px solid var(--gold)', borderRadius: 'var(--radius)',
                    background: 'var(--card)', minHeight: 'var(--tap)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4,
                  }}
                >
                  <div className="num" style={{ fontSize: 'var(--fs-label)', color: 'var(--gold-text)' }}>
                    The Paper{frontpage.edition ? ` · Edition #${frontpage.edition.edition_number}` : ''}
                  </div>
                  <div style={{ fontFamily: 'Georgia, serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', fontStyle: frontpage.edition ? 'normal' : 'italic' }}>
                    {frontpage.edition?.headline ?? 'No edition published yet today.'}
                  </div>
                  <div style={{ fontSize: 'var(--fs-label)', fontWeight: 700, color: 'var(--accent)', marginTop: 2 }}>Read the Paper →</div>
                </button>
                <button
                  onClick={() => navigate('/recap')}
                  style={{ minHeight: 'var(--tap)', background: 'transparent', border: 'none', color: 'var(--accent)', ...BODY, fontSize: 'var(--fs-label)', fontWeight: 700, cursor: 'pointer', textAlign: 'left' }}
                >Weekly digest →</button>
              </div>

              {/* Persistent chat rail — desktop only; mobile uses the Chat tab */}
              {isDesktop && (
                <div style={{ width: 330, flexShrink: 0, borderLeft: '1px solid var(--rule)' }}>
                  <ClubhouseChat
                    circleId={activeCircleId}
                    members={members}
                    activeCircle={activeCircle}
                    feed={feed}
                    onEnterLeague={enterLeague}
                    layout="rail"
                    onExpand={() => setTab('room')}
                  />
                </div>
              )}
            </div>
          )}

          {/* Remaining tabs share the max-width reading container */}
          {(tab === 'people' || (tab === 'settings' && isOwner)) && (
            <div style={{ padding: '20px 16px', maxWidth: 640, margin: '0 auto' }}>
              {tab === 'people' && (
                <MembersTab
                  records={betRecords}
                  onChallenge={(userId) => navigate(`/challenges?tab=bets&opponent=${userId}`)}
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
