import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useIsDesktop } from '../hooks/useViewport';

const SPORT_COLOR = { football: 'var(--accent)', f1: 'var(--f1)', tennis: 'var(--ten)' };
const SPORT_EMOJI = { football: '⚽', f1: '🏁', tennis: '🎾' };

const SPORTS = [
  { sport: 'football', label: 'Football', icon: '/brand/frontrow-football-normal.svg' },
  { sport: 'tennis',   label: 'Tennis',   icon: '/brand/frontrow-tennis-normal.svg' },
  { sport: 'f1',       label: 'F1',       icon: '/brand/frontrow-f1-normal.svg' },
];

const FORMATS = [
  { value: 'noduplicate', label: 'Classic — season-long points' },
  { value: 'draft',       label: 'Draft' },
];

const SPORT_INFO = {
  football: {
    overview: 'Build a squad of real Premier League / World Cup players from the tournament you pick below. Your squad scores points on their real match performances each gameweek.',
    modes: [
      { label: 'Classic', text: 'No exclusivity — every manager can own the same player. Race for the highest season-long points total.' },
      { label: 'Draft',   text: 'Each real player can belong to only one manager in the league. Managers hold a live draft to claim exclusive rights before the window opens.' },
    ],
    extra: 'Head-to-Head adds weekly win/draw/loss matchups on top of whichever format you pick.',
  },
  tennis: {
    overview: 'Pick a box of real ATP/WTA players for a tournament. Your box scores points on how far each player goes in the draw.',
    modes: [],
    extra: null,
  },
  f1: {
    overview: 'Pick drivers and constructors for a season of race weekends (a "Paddock"). You score points on real qualifying and race results.',
    modes: [],
    extra: null,
  },
};

function SportInfoPopover({ sport }) {
  const [open, setOpen] = useState(false);
  const info = SPORT_INFO[sport];
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`About ${sport}`}
        style={{
          width: 16, height: 16, borderRadius: '50%', border: '1px solid var(--mute)',
          background: 'transparent', color: 'var(--mute)', fontSize: 'var(--fs-micro)', lineHeight: '14px',
          cursor: 'pointer', padding: 0, fontFamily: 'Georgia, serif', fontStyle: 'italic',
        }}
      >i</button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1010 }} />
          <div style={{
            position: 'absolute', top: 20, left: 0, zIndex: 1011, width: 260,
            background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 8,
            padding: 12, boxShadow: '0 12px 28px -8px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--paper)', lineHeight: 1.4, marginBottom: info.modes.length ? 8 : 0 }}>
              {info.overview}
            </div>
            {info.modes.map(m => (
              <div key={m.label} style={{ marginTop: 8 }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: 2 }}>{m.label.toUpperCase()}</div>
                <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', lineHeight: 1.4 }}>{m.text}</div>
              </div>
            ))}
            {info.extra && (
              <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--mute)', lineHeight: 1.4, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--rule)' }}>
                {info.extra}
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );
}

// Avoids importing useAuth or useClubhouseContext (both imported by AppLayout — TDZ guard).
// circleId, clubhouseName, onCreated, onClose come in as props from AppLayout.
export default function NewCompetitionFlow({ circleId, clubhouseName, onCreated, onClose }) {
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();

  const [sport, setSport]             = useState('football');
  const [name, setName]               = useState('');
  const [format, setFormat]           = useState('noduplicate');
  const [h2h, setH2h]                 = useState(false);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentId, setTournamentId] = useState('');
  const [showJoin, setShowJoin]       = useState(false);
  const [joinCode, setJoinCode]       = useState('');
  const [joinSport, setJoinSport]     = useState('football');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  // Fetch the real-world tournament list whenever football is the selected sport
  useEffect(() => {
    if (sport !== 'football') return;
    supabase
      .from('tournaments')
      .select('forza_id, name')
      .eq('available_for_league_creation', true)
      .order('name')
      .then(({ data }) => {
        const list = data ?? [];
        setTournaments(list);
        if (list.length > 0) setTournamentId(prev => prev || list[0].forza_id);
      });
  }, [sport]);

  function close() { onClose(); }

  async function handleCreate() {
    if (!circleId) { setError('A competition must belong to a Clubhouse — create one first.'); return; }
    if (!name.trim()) { setError('Name is required'); return; }
    if (sport === 'football' && !tournamentId) { setError('Select a tournament'); return; }
    setLoading(true); setError(null);
    try {
      let newId;
      if (sport === 'football') {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error: err } = await supabase.rpc('create_league', {
          p_name:          name.trim(),
          p_format:        format,
          p_user_id:       user.id,
          p_tournament_id: tournamentId,
          p_h2h_enabled:   h2h,
          p_circle_id:     circleId,
        });
        if (err) throw err;
        if (data?.error) throw new Error(data.error);
        newId = data?.league_id ?? data;
      } else if (sport === 'f1') {
        const { data, error: err } = await supabase.rpc('create_paddock', {
          p_name:      name.trim(),
          p_circle_id: circleId,
        });
        if (err) throw err;
        if (data?.error) throw new Error(data.error);
        newId = data;
      } else if (sport === 'tennis') {
        const { data, error: err } = await supabase.rpc('create_player_box', {
          p_name:         name.trim(),
          p_season_year:  2026,
          p_circle_id:    circleId,
        });
        if (err) throw err;
        if (data?.error) throw new Error(data.error);
        newId = data?.player_box_id ?? data;
      }

      onCreated();
      if (sport === 'football' && newId) navigate(`/league/${newId}`);
      else if (sport === 'f1'      && newId) navigate(`/f1/${newId}`);
      else if (sport === 'tennis'  && newId) navigate('/tennis');
      close();
    } catch (e) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!joinCode.trim()) { setError('Enter an invite code'); return; }
    setLoading(true); setError(null);
    try {
      if (joinSport === 'football') {
        const { data, error: err } = await supabase.rpc('join_league_by_code', {
          p_invite_code: joinCode.trim().toUpperCase(),
        });
        if (err) throw err;
        if (data?.error) throw new Error(data.error);
        const id = data?.league_id ?? data;
        onCreated();
        if (id) navigate(`/league/${id}`);
      } else if (joinSport === 'f1') {
        const { data, error: err } = await supabase.rpc('join_paddock_by_code', {
          p_code: joinCode.trim().toUpperCase(),
        });
        if (err) throw err;
        if (data?.error) throw new Error(data.error);
        const id = data;
        onCreated();
        if (id) navigate(`/f1/${id}`);
      } else if (joinSport === 'tennis') {
        const { data, error: err } = await supabase.rpc('join_player_box_by_code', {
          p_invite_code: joinCode.trim().toUpperCase(),
        });
        if (err) throw err;
        if (data?.error) throw new Error(data.error);
        const id = data?.player_box_id ?? data;
        onCreated();
        // id here is a player_boxes.id (a container of tournaments), not a tennis_tournaments
        // id — /tennis reads the active box from SportContext rather than taking an id in the URL.
        if (id) navigate('/tennis');
      }
      close();
    } catch (e) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  // ── Shared styles ────────────────────────────────────────────────────────────
  const LABEL_STYLE = {
    display: 'block', marginBottom: 6,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 'var(--fs-micro)', letterSpacing: '0.1em',
    textTransform: 'uppercase', color: 'var(--mute)',
  };
  const INPUT_STYLE = {
    width: '100%', padding: '11px 13px', borderRadius: 6,
    background: 'var(--elev)', border: 'none',
    color: 'var(--paper)', fontFamily: 'inherit', fontSize: 'var(--fs-body)',
    outline: 'none', boxSizing: 'border-box',
  };
  const SPORT_TILE = (active) => ({
    flex: 1, border: `1.5px solid ${active ? 'var(--accent)' : 'var(--rule)'}`,
    background: active ? 'var(--accent-bg)' : 'transparent',
    borderRadius: 6, padding: '14px 8px', textAlign: 'center',
    cursor: 'pointer', transition: 'all .12s',
  });
  const GHOST_BTN = {
    flex: 1, textAlign: 'center', padding: 12, borderRadius: 6,
    border: '1px solid var(--rule)', background: 'transparent', color: 'var(--mute)',
    fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.1em',
    textTransform: 'uppercase', fontWeight: 600, cursor: 'pointer',
  };
  const PRIMARY_BTN = {
    flex: 1, textAlign: 'center', padding: 12, borderRadius: 6,
    border: 'none', background: 'var(--accent)', color: '#fff',
    fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.1em',
    textTransform: 'uppercase', fontWeight: 600,
    cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1,
  };

  const formContent = (
    <>
      <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-heading)', color: 'var(--paper)', marginBottom: 4 }}>
        Create a competition
      </div>
      <div style={{ fontSize: 'var(--fs-label)', color: 'var(--mute)', marginBottom: 18 }}>
        {clubhouseName ? `Adds to ${clubhouseName} — every member gets access` : 'Every member of this Clubhouse gets access'}
      </div>

      <div style={{ ...LABEL_STYLE, display: 'flex', alignItems: 'center', gap: 6 }}>
        Sport
        <SportInfoPopover sport={sport} />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
        {SPORTS.map(({ sport: s, label, icon }) => (
          <button key={s} onClick={() => setSport(s)} style={SPORT_TILE(s === sport)}>
            <img src={icon} alt="" style={{ width: 48, height: 48, marginBottom: 8, display: 'block', marginInline: 'auto' }} />
            <span style={{ fontSize: 'var(--fs-micro)', fontWeight: 600, color: 'var(--paper)' }}>{label}</span>
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={LABEL_STYLE}>Competition name</label>
        <input
          autoFocus
          style={INPUT_STYLE}
          placeholder="e.g. Sunday League Redux"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={60}
        />
      </div>

      {sport === 'football' && (
        <>
          <div style={{ marginBottom: 14 }}>
            <label style={LABEL_STYLE}>Tournament</label>
            <select
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
              value={tournamentId}
              onChange={e => setTournamentId(e.target.value)}
            >
              {tournaments.length === 0 && <option value="">Loading...</option>}
              {tournaments.map(t => (
                <option key={t.forza_id} value={t.forza_id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={LABEL_STYLE}>Format</label>
            <select
              style={{ ...INPUT_STYLE, cursor: 'pointer' }}
              value={format}
              onChange={e => setFormat(e.target.value)}
            >
              {FORMATS.map(f => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={h2h}
              onChange={e => setH2h(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
            />
            <span style={{ fontSize: 'var(--fs-body)', color: 'var(--mute)' }}>Head-to-Head mode</span>
          </label>
        </>
      )}

      {error && <div style={{ color: 'var(--danger)', fontSize: 'var(--fs-label)', marginTop: 8 }}>{error}</div>}

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={close} style={GHOST_BTN}>Cancel</button>
        <button onClick={handleCreate} disabled={loading} style={PRIMARY_BTN}>
          {loading ? 'Creating…' : 'Create competition'}
        </button>
      </div>

      <div style={{ marginTop: 18 }}>
        {!showJoin ? (
          <button
            onClick={() => setShowJoin(true)}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.08em', color: 'var(--accent)' }}
          >
            Have an invite code instead? →
          </button>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 12px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
              <span style={{ ...LABEL_STYLE, margin: 0 }}>join by code</span>
              <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {['football', 'f1', 'tennis'].map(s => (
                <button
                  key={s}
                  onClick={() => setJoinSport(s)}
                  style={{
                    flex: 1, padding: '7px 4px', borderRadius: 5,
                    border: `1.5px solid ${joinSport === s ? SPORT_COLOR[s] : 'var(--rule)'}`,
                    background: joinSport === s ? `${SPORT_COLOR[s]}18` : 'transparent',
                    cursor: 'pointer', fontSize: 'var(--fs-body)',
                  }}
                >
                  {SPORT_EMOJI[s]}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...INPUT_STYLE, flex: 1 }}
                placeholder="Invite code"
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                maxLength={12}
              />
              <button
                onClick={handleJoin}
                disabled={loading || !joinCode.trim()}
                style={{
                  padding: '9px 16px', borderRadius: 6, border: 'none',
                  background: SPORT_COLOR[joinSport], color: '#fff',
                  fontFamily: 'Archivo Black, sans-serif', fontSize: 'var(--fs-body)',
                  cursor: loading || !joinCode.trim() ? 'not-allowed' : 'pointer',
                  opacity: loading || !joinCode.trim() ? 0.5 : 1,
                  flexShrink: 0,
                }}
              >
                →
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );

  if (isDesktop) {
    return createPortal(
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(24,32,46,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            width: 460, maxWidth: '92vw', maxHeight: '85vh', overflowY: 'auto',
            background: 'var(--card)', borderRadius: 12,
            padding: '26px 26px 22px',
            boxShadow: '0 30px 60px -20px rgba(0,0,0,0.4)',
          }}
        >
          {formContent}
        </div>
      </div>,
      document.body
    );
  }

  // Mobile — bottom sheet
  return createPortal(
    <div
      onClick={close}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(24,32,46,0.55)',
        display: 'flex', alignItems: 'flex-end',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '90vh', overflowY: 'auto',
          background: 'var(--card)', borderRadius: '18px 18px 0 0',
          padding: '18px 20px 24px',
        }}
      >
        <div style={{ width: 36, height: 4, background: 'var(--rule)', borderRadius: 100, margin: '0 auto 16px' }} />
        {formContent}
      </div>
    </div>,
    document.body
  );
}
