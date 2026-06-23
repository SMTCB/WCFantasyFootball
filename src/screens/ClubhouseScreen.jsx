import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClubhouse } from '../hooks/useClubhouse';
import { useSport } from '../context/SportContext';
import ClubhouseChat from '../components/ClubhouseChat';

const MONO = { fontFamily: 'JetBrains Mono, monospace' };
const HEAD = { fontFamily: 'Archivo Black, sans-serif' };
const BODY = { fontFamily: 'Archivo, sans-serif' };

function timeAgo(isoString) {
  const diff = (Date.now() - new Date(isoString)) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Shared tab bar ────────────────────────────────────────────────────────────
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)' }}>
      {tabs.map(t => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          style={{
            flex: 1,
            padding: '12px 0',
            ...MONO,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            cursor: 'pointer',
            border: 'none',
            borderBottom: active === t.key ? '2px solid var(--accent)' : '2px solid transparent',
            background: 'transparent',
            color: active === t.key ? 'var(--accent)' : 'var(--mute)',
            marginBottom: -1,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── Empty / no-circles state ──────────────────────────────────────────────────
function ClubhouseLobby({ createCircle, joinCircleByCode }) {
  const [tab, setTab] = useState('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const TABS = [
    { key: 'create', label: 'CREATE' },
    { key: 'join',   label: 'JOIN'   },
  ];

  async function handleCreate(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setErr('');
    try { await createCircle(name.trim()); }
    catch (e) { setErr(e.message === 'NAME_REQUIRED' ? 'Please enter a name.' : e.message); }
    finally { setBusy(false); }
  }

  async function handleJoin(e) {
    e.preventDefault();
    if (code.trim().length < 6) return;
    setBusy(true); setErr('');
    try { await joinCircleByCode(code.trim()); }
    catch (e) {
      setErr(e.message === 'INVALID_CODE' ? 'Code not found — check and try again.' : e.message);
    }
    finally { setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px 32px' }}>
      <div style={{ textAlign: 'center', padding: '48px 0 32px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🏠</div>
        <h2 style={{ ...HEAD, fontSize: 22, color: 'var(--paper)', margin: '0 0 8px' }}>
          YOUR CLUBHOUSE
        </h2>
        <p style={{ ...BODY, fontSize: 14, color: 'var(--mute)', margin: 0 }}>
          A shared space for your group — chat, compete, and bet across every sport.
        </p>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={t => { setTab(t); setErr(''); }} />

      <div style={{ paddingTop: 24 }}>
        {tab === 'create' && (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', ...MONO, fontSize: 10, letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 8, textTransform: 'uppercase' }}>
                Clubhouse Name
              </label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. The Friday Night Crew"
                maxLength={40}
                style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--rule)', borderRadius: 6, ...BODY, fontSize: 15, color: 'var(--paper)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            {err && <div style={{ ...MONO, fontSize: 11, color: 'var(--danger)' }}>{err}</div>}
            <button
              type="submit"
              disabled={busy || !name.trim()}
              style={{ padding: 13, background: busy || !name.trim() ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', cursor: busy || !name.trim() ? 'default' : 'pointer' }}
            >
              {busy ? 'CREATING…' : 'CREATE CLUBHOUSE →'}
            </button>
          </form>
        )}

        {tab === 'join' && (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', ...MONO, fontSize: 10, letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 8, textTransform: 'uppercase' }}>
                Invite Code
              </label>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="8-CHARACTER CODE"
                maxLength={8}
                style={{ width: '100%', padding: '12px 14px', border: '1px solid var(--rule)', borderRadius: 6, ...MONO, fontSize: 18, fontWeight: 700, letterSpacing: '0.25em', color: 'var(--paper)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase' }}
              />
            </div>
            {err && <div style={{ ...MONO, fontSize: 11, color: 'var(--danger)' }}>{err}</div>}
            <button
              type="submit"
              disabled={busy || code.trim().length < 6}
              style={{ padding: 13, background: busy || code.trim().length < 6 ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', cursor: busy || code.trim().length < 6 ? 'default' : 'pointer' }}
            >
              {busy ? 'JOINING…' : 'JOIN CLUBHOUSE →'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Competition cards ─────────────────────────────────────────────────────────
function SportSection({ label, emoji, items, onEnter }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 10 }}>
        {emoji} {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => onEnter(item)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8, cursor: 'pointer', textAlign: 'left', width: '100%' }}
          >
            <div>
              <div style={{ ...HEAD, fontSize: 14, color: 'var(--paper)' }}>{item.name}</div>
              {item.format && (
                <div style={{ ...MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '0.1em', marginTop: 2, textTransform: 'uppercase' }}>
                  {item.format}
                </div>
              )}
            </div>
            <span style={{ ...MONO, fontSize: 10, color: 'var(--accent)', letterSpacing: '0.1em' }}>ENTER →</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────
function FeedEntry({ entry }) {
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
  }[entry.entry_type] ?? 'var(--mute)';

  const ago = timeAgo(entry.created_at);

  return (
    <div style={{ padding: '12px 0', borderBottom: '1px solid var(--rule)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: typeColor }}>{typeLabel}</span>
          {entry.league_name && (
            <span style={{ ...MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '0.08em' }}>{entry.league_name}</span>
          )}
        </div>
        <span style={{ ...MONO, fontSize: 9, color: 'var(--mute)', whiteSpace: 'nowrap', letterSpacing: '0.08em' }}>{ago}</span>
      </div>
      <div style={{ ...BODY, fontSize: 13, color: 'var(--paper)', lineHeight: 1.4 }}>{entry.headline}</div>
    </div>
  );
}

// ── Members tab ───────────────────────────────────────────────────────────────
function MembersTab({ members }) {
  if (members.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '48px 0', ...MONO, fontSize: 11, color: 'var(--mute)' }}>
        No members yet.
      </div>
    );
  }
  const owners  = members.filter(m => m.role === 'owner');
  const regular = members.filter(m => m.role !== 'owner');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[...owners, ...regular].map(m => (
        <div
          key={m.user_id}
          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8 }}
        >
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: m.role === 'owner' ? 'var(--accent)' : 'var(--elev)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ ...MONO, fontSize: 12, fontWeight: 700, color: '#fff' }}>
              {(m.username?.[0] ?? '?').toUpperCase()}
            </span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...MONO, fontSize: 12, color: 'var(--paper)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {m.username}
            </div>
          </div>
          {m.role === 'owner' && (
            <span style={{ ...MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)' }}>OWNER</span>
          )}
        </div>
      ))}
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
          style={{ flex: 1, padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 6, ...BODY, fontSize: 14, color: 'var(--paper)', background: 'var(--card)', outline: 'none' }}
        />
        <button
          type="submit"
          disabled={busy || query.trim().length < 2}
          style={{ padding: '10px 16px', background: busy || query.trim().length < 2 ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {busy ? '…' : 'SEARCH'}
        </button>
      </form>

      {err && <div style={{ ...MONO, fontSize: 11, color: 'var(--danger)', marginBottom: 12 }}>{err}</div>}

      {results !== null && results.length === 0 && (
        <div style={{ textAlign: 'center', padding: '32px 0', ...MONO, fontSize: 11, color: 'var(--mute)' }}>
          No public Clubhouses found for "{query}".
        </div>
      )}

      {results !== null && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {results.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8 }}>
              <div>
                <div style={{ ...HEAD, fontSize: 14, color: 'var(--paper)' }}>{r.name}</div>
                <div style={{ ...MONO, fontSize: 9, color: 'var(--mute)', letterSpacing: '0.08em', marginTop: 2 }}>
                  {r.member_count} {r.member_count === 1 ? 'member' : 'members'}
                </div>
              </div>
              {r.already_member ? (
                <span style={{ ...MONO, fontSize: 9, color: 'var(--positive)', fontWeight: 700, letterSpacing: '0.1em' }}>JOINED ✓</span>
              ) : (
                <button
                  onClick={() => handleJoin(r.invite_code)}
                  disabled={joining === r.invite_code}
                  style={{ padding: '8px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {joining === r.invite_code ? 'JOINING…' : 'JOIN'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {results === null && !busy && (
        <div style={{ textAlign: 'center', padding: '32px 0', ...MONO, fontSize: 11, color: 'var(--mute)', lineHeight: 1.8 }}>
          Search for public Clubhouses by name.<br />
          Private Clubhouses are invite-code only.
        </div>
      )}
    </div>
  );
}

// ── Circle selector strip (when user is in multiple circles) ──────────────────
function CircleSelector({ circles, activeCircleId, onChange }) {
  if (circles.length <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px', borderBottom: '1px solid var(--rule)', scrollbarWidth: 'none' }}>
      {circles.map(c => (
        <button
          key={c.id}
          onClick={() => onChange(c.id)}
          style={{
            flexShrink: 0,
            padding: '6px 14px',
            borderRadius: 20,
            border: '1px solid',
            borderColor: c.id === activeCircleId ? 'var(--accent)' : 'var(--rule)',
            background: c.id === activeCircleId ? 'rgba(26,111,168,0.15)' : 'transparent',
            color: c.id === activeCircleId ? 'var(--accent)' : 'var(--mute)',
            ...MONO,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ClubhouseScreen() {
  const { circleId: routeCircleId } = useParams();
  const navigate = useNavigate();
  const { setActiveSport, setActivePaddockId } = useSport();
  const {
    myCircles,
    activeCircle,
    activeCircleId,
    setActiveCircleId,
    competitions,
    feed,
    members,
    loading,
    createCircle,
    joinCircleByCode,
    searchClubhouses,
  } = useClubhouse();

  const [tab, setTab] = useState('home');
  const [copied, setCopied] = useState(false);

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
    setActiveSport('f1');
    setActivePaddockId(paddock.id);
    navigate(`/f1/${paddock.id}`);
  }

  const MAIN_TABS = [
    { key: 'home',    label: 'HOME'    },
    { key: 'chat',    label: 'CHAT'    },
    { key: 'members', label: 'MEMBERS' },
    { key: 'find',    label: 'FIND'    },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--ink)', paddingBottom: 32 }}>

      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '24px 20px 20px' }}>
        <div style={{ ...MONO, fontSize: 10, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase', marginBottom: 6 }}>
          🏠 The Clubhouse
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h1 style={{ ...HEAD, fontSize: 26, color: '#fff', margin: 0, lineHeight: 1.1 }}>
              {activeCircle ? activeCircle.name.toUpperCase() : 'CLUBHOUSE'}
            </h1>
            {activeCircle && (
              <div style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.1em', marginTop: 6 }}>
                {members.length} {members.length === 1 ? 'MEMBER' : 'MEMBERS'}
                {activeCircle.is_public && <span style={{ marginLeft: 8, color: 'var(--positive)' }}>· PUBLIC</span>}
              </div>
            )}
          </div>
          {activeCircle?.invite_code && (
            <button
              onClick={copyCode}
              title="Copy invite code"
              style={{ flexShrink: 0, padding: '8px 14px', background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 6, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
            >
              <span style={{ ...MONO, fontSize: 13, fontWeight: 700, letterSpacing: '0.2em', color: 'var(--paper)' }}>
                {activeCircle.invite_code}
              </span>
              <span style={{ ...MONO, fontSize: 8, letterSpacing: '0.1em', color: copied ? 'var(--positive)' : 'var(--mute)' }}>
                {copied ? 'COPIED ✓' : 'COPY CODE'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Circle selector (multi-clubhouse) */}
      {myCircles.length > 1 && (
        <CircleSelector
          circles={myCircles}
          activeCircleId={activeCircleId}
          onChange={id => { setActiveCircleId(id); navigate(`/clubhouse/${id}`, { replace: true }); }}
        />
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, ...MONO, fontSize: 11, color: 'var(--mute)' }}>
          Loading…
        </div>
      ) : myCircles.length === 0 ? (
        <ClubhouseLobby createCircle={createCircle} joinCircleByCode={joinCircleByCode} />
      ) : (
        <>
          <TabBar tabs={MAIN_TABS} active={tab} onChange={setTab} />

          {/* CHAT tab — full-width, no padding constraint */}
          {tab === 'chat' && (
            <ClubhouseChat
              circleId={activeCircleId}
              members={members}
              activeCircle={activeCircle}
            />
          )}

          <div style={{ padding: '20px 16px', maxWidth: 640, margin: '0 auto', display: tab === 'chat' ? 'none' : undefined }}>

            {/* HOME tab */}
            {tab === 'home' && (
              <div>
                {/* Sport competition cards */}
                <SportSection
                  label="Football"
                  emoji="⚽"
                  items={competitions.football}
                  onEnter={enterLeague}
                />
                <SportSection
                  label="Formula 1"
                  emoji="🏎"
                  items={competitions.f1}
                  onEnter={enterPaddock}
                />

                {/* Non-playing member empty state */}
                {competitions.football.length === 0 && competitions.f1.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '32px 0 24px' }}>
                    <div style={{ fontSize: 32, marginBottom: 12 }}>🏟️</div>
                    <p style={{ ...HEAD, fontSize: 16, color: 'var(--paper)', margin: '0 0 8px' }}>
                      No leagues linked yet
                    </p>
                    <p style={{ ...BODY, fontSize: 13, color: 'var(--mute)', margin: '0 0 20px' }}>
                      The Clubhouse owner can create leagues and link them here.<br />
                      You can still chat and place bets without playing.
                    </p>
                    <button
                      onClick={() => navigate('/league')}
                      style={{ padding: '10px 24px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, ...MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer' }}
                    >
                      BROWSE LEAGUES →
                    </button>
                  </div>
                )}

                {/* Activity feed */}
                {feed.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ ...MONO, fontSize: 9, letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase', marginBottom: 12 }}>
                      📰 Activity
                    </div>
                    {feed.map(entry => (
                      <FeedEntry key={entry.id} entry={entry} />
                    ))}
                  </div>
                )}

                {feed.length === 0 && (competitions.football.length > 0 || competitions.f1.length > 0) && (
                  <div style={{ ...MONO, fontSize: 11, color: 'var(--mute)', textAlign: 'center', padding: '32px 0' }}>
                    Activity from linked leagues will appear here.
                  </div>
                )}
              </div>
            )}

            {/* MEMBERS tab */}
            {tab === 'members' && <MembersTab members={members} />}

            {/* FIND tab */}
            {tab === 'find' && (
              <FindTab searchClubhouses={searchClubhouses} joinCircleByCode={joinCircleByCode} />
            )}
          </div>

          {/* Add another clubhouse strip */}
          {tab === 'home' && (
            <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>
              <button
                onClick={() => setTab('find')}
                style={{ width: '100%', padding: 12, border: '1px dashed var(--rule)', borderRadius: 8, background: 'transparent', color: 'var(--mute)', ...MONO, fontSize: 10, letterSpacing: '0.1em', cursor: 'pointer' }}
              >
                + JOIN OR CREATE ANOTHER CLUBHOUSE
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
