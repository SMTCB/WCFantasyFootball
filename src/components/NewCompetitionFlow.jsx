import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const SPORT_COLOR = { football: 'var(--accent)', f1: 'var(--f1)', tennis: 'var(--ten)' };

const FORMATS = [
  { value: 'noduplicate', label: 'Classic' },
  { value: 'draft',       label: 'Draft'   },
];

// Avoids importing useAuth or useClubhouseContext (both imported by AppLayout — TDZ guard).
// circleId, onCreated, onClose come in as props from AppLayout.
export default function NewCompetitionFlow({ circleId, onCreated, onClose }) {
  const navigate = useNavigate();

  const [step, setStep]               = useState('pick');
  const [name, setName]               = useState('');
  const [format, setFormat]           = useState('noduplicate');
  const [h2h, setH2h]                 = useState(false);
  const [tournaments, setTournaments] = useState([]);
  const [tournamentId, setTournamentId] = useState('');
  const [joinCode, setJoinCode]       = useState('');
  const [joinSport, setJoinSport]     = useState('football');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState(null);

  // Fetch tournament list the moment the football create step mounts
  useEffect(() => {
    if (step !== 'create-football') return;
    supabase
      .from('tournaments')
      .select('id, name')
      .order('name')
      .then(({ data }) => {
        const list = data ?? [];
        setTournaments(list);
        // Only auto-select if the user hasn't already chosen one
        if (list.length > 0) setTournamentId(prev => prev || list[0].id);
      });
  }, [step]);

  function resetForm() {
    setName(''); setFormat('noduplicate'); setH2h(false);
    setTournamentId(''); setJoinCode(''); setError(null);
  }

  function back()  { resetForm(); setStep('pick'); }
  function close() { resetForm(); setStep('pick'); onClose(); }

  async function handleCreate(sport) {
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
      else if (sport === 'tennis'  && newId) navigate(`/tennis/tournament/${newId}`);
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
        if (id) navigate(`/tennis/tournament/${id}`);
      }
      close();
    } catch (e) {
      setError(e.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  // ── Shared styles ────────────────────────────────────────────────────────────
  const INPUT_STYLE = {
    width: '100%', padding: '9px 12px', borderRadius: 6,
    background: 'var(--elev)', border: '1px solid var(--rule)',
    color: 'var(--paper)', fontFamily: 'inherit', fontSize: 14,
    outline: 'none', boxSizing: 'border-box',
  };
  const LABEL_STYLE = {
    display: 'block', marginBottom: 5,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 9, letterSpacing: '0.14em',
    textTransform: 'uppercase', color: 'var(--mute)',
  };
  const PRIMARY_BTN = (color = 'var(--accent)') => ({
    width: '100%', padding: '11px 16px', borderRadius: 6,
    background: color, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
    color: '#fff', fontFamily: 'Archivo Black, sans-serif',
    fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase',
    opacity: loading ? 0.6 : 1,
  });
  const SPORT_BTN = (sport) => ({
    flex: 1, padding: '14px 10px', borderRadius: 8,
    border: `1.5px solid ${SPORT_COLOR[sport]}22`,
    background: `${SPORT_COLOR[sport]}0d`,
    cursor: 'pointer', textAlign: 'center',
    transition: 'all .12s',
  });
  const SPORT_BTN_LABEL = (sport) => ({
    display: 'block', marginTop: 6,
    fontFamily: 'Archivo Black, sans-serif',
    fontSize: 11, letterSpacing: '0.05em',
    textTransform: 'uppercase', color: SPORT_COLOR[sport],
  });

  // ── Render ───────────────────────────────────────────────────────────────────
  const renderStep = () => {
    // ── Pick step ─────────────────────────────────────────────────────────────
    if (step === 'pick') return (
      <div>
        <div style={{ marginBottom: 20 }}>
          <div style={LABEL_STYLE}>Create</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { sport: 'football', emoji: '⚽', label: 'Football' },
              { sport: 'f1',       emoji: '🏁', label: 'F1'       },
              { sport: 'tennis',   emoji: '🎾', label: 'Tennis'   },
            ].map(({ sport, emoji, label }) => (
              <button
                key={sport}
                onClick={() => setStep(`create-${sport}`)}
                style={SPORT_BTN(sport)}
              >
                <span style={{ fontSize: 22 }}>{emoji}</span>
                <span style={SPORT_BTN_LABEL(sport)}>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '18px 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
          <span style={{ ...LABEL_STYLE, margin: 0 }}>or join by code</span>
          <div style={{ flex: 1, height: 1, background: 'var(--rule)' }} />
        </div>

        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {['football', 'f1', 'tennis'].map(s => (
              <button
                key={s}
                onClick={() => setJoinSport(s)}
                style={{
                  flex: 1, padding: '7px 4px', borderRadius: 5,
                  border: `1.5px solid ${joinSport === s ? SPORT_COLOR[s] : 'var(--rule)'}`,
                  background: joinSport === s ? `${SPORT_COLOR[s]}18` : 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 9, letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: joinSport === s ? SPORT_COLOR[s] : 'var(--mute)',
                  transition: 'all .1s',
                }}
              >
                {s === 'football' ? '⚽' : s === 'f1' ? '🏁' : '🎾'}
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
                fontFamily: 'Archivo Black, sans-serif', fontSize: 13,
                cursor: loading || !joinCode.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !joinCode.trim() ? 0.5 : 1,
                flexShrink: 0,
              }}
            >
              →
            </button>
          </div>
        </div>

        {error && <div style={{ marginTop: 12, color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
      </div>
    );

    // ── Football create step ───────────────────────────────────────────────────
    if (step === 'create-football') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={LABEL_STYLE}>League name</label>
          <input
            autoFocus
            style={INPUT_STYLE}
            placeholder="e.g. The Premier League"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
          />
        </div>

        <div>
          <label style={LABEL_STYLE}>Tournament</label>
          <select
            style={{ ...INPUT_STYLE, cursor: 'pointer' }}
            value={tournamentId}
            onChange={e => setTournamentId(e.target.value)}
          >
            {tournaments.length === 0 && <option value="">Loading...</option>}
            {tournaments.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={LABEL_STYLE}>Format</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {FORMATS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setFormat(value)}
                style={{
                  flex: 1, padding: '9px 10px', borderRadius: 6,
                  border: `1.5px solid ${format === value ? 'var(--accent)' : 'var(--rule)'}`,
                  background: format === value ? 'rgba(0,180,216,0.1)' : 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: format === value ? 'var(--accent)' : 'var(--mute)',
                  transition: 'all .1s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={h2h}
            onChange={e => setH2h(e.target.checked)}
            style={{ width: 15, height: 15, accentColor: 'var(--accent)' }}
          />
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Head-to-Head mode</span>
        </label>

        {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}

        <button
          onClick={() => handleCreate('football')}
          disabled={loading}
          style={PRIMARY_BTN('var(--accent)')}
        >
          {loading ? 'Creating…' : 'Create League'}
        </button>
      </div>
    );

    // ── F1 create step ────────────────────────────────────────────────────────
    if (step === 'create-f1') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={LABEL_STYLE}>Paddock name</label>
          <input
            autoFocus
            style={INPUT_STYLE}
            placeholder="e.g. Scuderia Friends"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
          />
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
        <button
          onClick={() => handleCreate('f1')}
          disabled={loading}
          style={PRIMARY_BTN('var(--f1)')}
        >
          {loading ? 'Creating…' : 'Create Paddock'}
        </button>
      </div>
    );

    // ── Tennis create step ────────────────────────────────────────────────────
    if (step === 'create-tennis') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={LABEL_STYLE}>Player Box name</label>
          <input
            autoFocus
            style={INPUT_STYLE}
            placeholder="e.g. Grand Slam HQ"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={60}
          />
        </div>
        {error && <div style={{ color: 'var(--danger)', fontSize: 12 }}>{error}</div>}
        <button
          onClick={() => handleCreate('tennis')}
          disabled={loading}
          style={PRIMARY_BTN('var(--ten)')}
        >
          {loading ? 'Creating…' : 'Create Player Box'}
        </button>
      </div>
    );

    return null;
  };

  const SPORT_HEADER = { 'create-football': '⚽ Football League', 'create-f1': '🏁 F1 Paddock', 'create-tennis': '🎾 Tennis Player Box' };
  const HEADER_COLOR = { 'create-football': 'var(--accent)', 'create-f1': 'var(--f1)', 'create-tennis': 'var(--ten)' };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={close}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed', zIndex: 1001,
          top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(420px, 92vw)',
          maxHeight: '85vh', overflowY: 'auto',
          background: 'var(--card)',
          border: '1px solid var(--rule)',
          borderRadius: 12,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '16px 20px 14px',
          borderBottom: '1px solid var(--rule)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {step !== 'pick' && (
              <button
                onClick={back}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 8px 0 0', color: 'var(--mute)', fontSize: 16, lineHeight: 1 }}
              >
                ←
              </button>
            )}
            <div>
              <div style={{
                fontFamily: 'Archivo Black, sans-serif', fontSize: 14,
                color: step === 'pick' ? 'var(--paper)' : HEADER_COLOR[step],
                letterSpacing: '-0.01em',
              }}>
                {step === 'pick' ? 'New Competition' : SPORT_HEADER[step]}
              </div>
            </div>
          </div>
          <button
            onClick={close}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--mute)', fontSize: 18, lineHeight: 1, padding: 4 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20 }}>
          {renderStep()}
        </div>
      </div>
    </>,
    document.body
  );
}
