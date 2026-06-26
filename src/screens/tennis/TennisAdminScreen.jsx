import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTennisCalendar } from '../../hooks/tennis/useTennisCalendar';
import { supabase } from '../../lib/supabase';

const STATUS_ORDER = ['upcoming', 'roster_open', 'in_progress', 'qf_captain_open', 'completed'];

export default function TennisAdminScreen() {
  const navigate = useNavigate();
  const { tournaments, loading, refresh } = useTennisCalendar(2026);

  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Seed players textarea
  const [playersJson, setPlayersJson] = useState('');
  // Eliminated player IDs (multi-select)
  const [eliminatedIds, setEliminatedIds] = useState([]);
  // ATP Finals specific
  const [atpMatchNumber, setAtpMatchNumber] = useState('');
  const [atpWinnerId, setAtpWinnerId] = useState('');
  // Score trigger
  const [scoringBusy, setScoringBusy] = useState(false);

  const t = tournaments.find(x => (x.tournament_id ?? x.id) === selected);
  const isAtp = t?.tournament_type === 'atp_finals';

  async function rpc(fn, params) {
    setBusy(true); setMsg(''); setErr('');
    try {
      const { data, error: e } = await supabase.rpc(fn, params);
      if (e) throw e;
      setMsg(`✓ ${fn} succeeded`);
      refresh();
      return data;
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  }

  async function openTournament() { await rpc('admin_open_tournament', { p_tournament_id: selected }); }
  async function startTournament() { await rpc('admin_start_tournament', { p_tournament_id: selected }); }
  async function completeTournament() { await rpc('admin_complete_tournament', { p_tournament_id: selected }); }
  async function openQfWindow() { await rpc('admin_open_qf_window', { p_tournament_id: selected }); }

  async function seedPlayers() {
    let parsed;
    try { parsed = JSON.parse(playersJson); } catch { setErr('Invalid JSON — paste an array of {player_name, seed, tier, nationality} objects.'); return; }
    await rpc('admin_seed_tournament_players', { p_tournament_id: selected, p_players: parsed });
    setPlayersJson('');
  }

  async function enterResults() {
    if (eliminatedIds.length === 0) { setErr('Select at least one eliminated player.'); return; }
    await rpc('admin_enter_round_results', { p_tournament_id: selected, p_eliminated_player_ids: eliminatedIds });
    setEliminatedIds([]);
    refresh();
  }

  async function enterAtpResult() {
    if (!atpMatchNumber || !atpWinnerId) { setErr('Enter match number and winner ID.'); return; }
    await rpc('admin_enter_atp_finals_result', { p_season_year: 2026, p_match_number: parseInt(atpMatchNumber, 10), p_winner_id: atpWinnerId });
    setAtpMatchNumber(''); setAtpWinnerId('');
  }

  async function triggerScoring() {
    if (!selected) return;
    setScoringBusy(true); setMsg(''); setErr('');
    try {
      const fnName = isAtp ? 'score-atp-finals' : 'score-tennis-tournament';
      const body = isAtp ? { season_year: 2026 } : { tournament_id: selected };
      const { error: e } = await supabase.functions.invoke(fnName, { body });
      if (e) throw e;
      setMsg(`✓ Scoring triggered for ${t?.name ?? selected}`);
    } catch (e) {
      setErr(e.message);
    } finally { setScoringBusy(false); }
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '20px 16px' }}>
        <button onClick={() => navigate('/tennis')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontFamily: 'Archivo, sans-serif', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
          ← Tennis
        </button>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4 }}>
          Admin
        </div>
        <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 24, color: 'var(--on-shell)', margin: 0 }}>
          Tennis Admin Panel
        </h1>
      </div>

      <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>

        {/* Tournament selector */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px', marginBottom: 16 }}>
          <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
            Select Tournament
          </label>
          {loading ? (
            <div style={{ color: 'var(--mute)', fontSize: 13, fontFamily: 'Archivo, sans-serif' }}>Loading…</div>
          ) : (
            <select
              value={selected ?? ''}
              onChange={e => { setSelected(e.target.value || null); setMsg(''); setErr(''); setEliminatedIds([]); }}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--paper)', background: 'var(--card)', outline: 'none' }}
            >
              <option value="">— Choose —</option>
              {tournaments.map(x => (
                <option key={x.tournament_id ?? x.id} value={x.tournament_id ?? x.id}>
                  {x.name} [{x.status}]
                </option>
              ))}
            </select>
          )}
        </div>

        {selected && t && (
          <>
            {/* Status + phase controls */}
            <Section title="Phase Controls">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {t.status === 'upcoming' && (
                  <AdminBtn label="Open Roster" onClick={openTournament} disabled={busy} />
                )}
                {t.status === 'roster_open' && !isAtp && (
                  <AdminBtn label="Start Tournament (lock rosters)" onClick={startTournament} disabled={busy} />
                )}
                {t.status === 'in_progress' && !isAtp && (
                  <AdminBtn label="Open QF Window" onClick={openQfWindow} disabled={busy} />
                )}
                {(t.status === 'qf_captain_open' || t.status === 'in_progress') && !isAtp && (
                  <AdminBtn label="Mark Complete" onClick={completeTournament} disabled={busy} />
                )}
                {t.status === 'completed' && (
                  <AdminBtn label={scoringBusy ? 'Scoring…' : 'Trigger Scoring'} onClick={triggerScoring} disabled={busy || scoringBusy} accent />
                )}
              </div>
            </Section>

            {/* Seed players (non-ATP) */}
            {!isAtp && ['upcoming', 'roster_open'].includes(t.status) && (
              <Section title="Seed Player List">
                <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--mute)', margin: '0 0 10px' }}>
                  Paste a JSON array: <code style={{ fontSize: 11 }}>[{`{"player_name":"Djokovic","seed":1,"tier":1,"nationality":"SRB"}`}, …]</code>
                </p>
                <textarea
                  value={playersJson}
                  onChange={e => setPlayersJson(e.target.value)}
                  rows={5}
                  placeholder='[{"player_name":"Djokovic","seed":1,"tier":1,"nationality":"SRB"}]'
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--paper)', background: 'var(--card)', outline: 'none', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <AdminBtn label="Seed Players" onClick={seedPlayers} disabled={busy || !playersJson.trim()} />
              </Section>
            )}

            {/* Enter round results (non-ATP, in_progress / qf_captain_open) */}
            {!isAtp && ['in_progress', 'qf_captain_open'].includes(t.status) && (
              <Section title="Enter Round Results — Eliminated Players">
                <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--mute)', margin: '0 0 10px' }}>
                  Select all players eliminated in this round. Their <code>round_reached</code> will be set automatically.
                </p>
                <PlayerMultiSelect
                  tournamentId={selected}
                  selected={eliminatedIds}
                  onChange={setEliminatedIds}
                />
                <AdminBtn label={`Mark ${eliminatedIds.length} player(s) eliminated`} onClick={enterResults} disabled={busy || eliminatedIds.length === 0} />
              </Section>
            )}

            {/* ATP Finals match result entry */}
            {isAtp && t.status !== 'upcoming' && (
              <Section title="Enter ATP Finals Match Result">
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <input
                    type="number"
                    min={1} max={15}
                    value={atpMatchNumber}
                    onChange={e => setAtpMatchNumber(e.target.value)}
                    placeholder="Match # (1–15)"
                    style={{ flex: 1, minWidth: 100, padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--paper)', background: 'var(--card)', outline: 'none' }}
                  />
                  <input
                    type="text"
                    value={atpWinnerId}
                    onChange={e => setAtpWinnerId(e.target.value)}
                    placeholder="Winner player UUID"
                    style={{ flex: 2, minWidth: 180, padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--paper)', background: 'var(--card)', outline: 'none' }}
                  />
                </div>
                <AdminBtn label="Enter Result" onClick={enterAtpResult} disabled={busy || !atpMatchNumber || !atpWinnerId} />
              </Section>
            )}

            {/* Feedback */}
            {msg && <div style={{ padding: '10px 14px', background: 'rgba(22,101,52,0.08)', border: '1px solid var(--pos)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--pos)', marginTop: 12 }}>{msg}</div>}
            {err && <div style={{ padding: '10px 14px', background: 'rgba(185,28,28,0.07)', border: '1px solid var(--neg)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--neg)', marginTop: 12 }}>{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px', marginBottom: 14 }}>
      <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 13, color: 'var(--paper)', marginBottom: 12 }}>{title}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </div>
  );
}

function AdminBtn({ label, onClick, disabled, accent }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ padding: '10px 18px', background: disabled ? 'var(--mute)' : accent ? 'var(--accent)' : 'var(--elev)', color: disabled ? '#fff' : accent ? '#fff' : 'var(--paper)', border: `1px solid ${accent ? 'var(--accent)' : 'var(--rule)'}`, borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 13, fontWeight: 600, cursor: disabled ? 'default' : 'pointer' }}
    >
      {label}
    </button>
  );
}

function PlayerMultiSelect({ tournamentId, selected, onChange }) {
  const [players, setPlayers] = useState([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    if (loaded) return;
    const { data } = await supabase
      .from('tennis_tournament_players')
      .select('id, player_name, tier, eliminated')
      .eq('tournament_id', tournamentId)
      .eq('eliminated', false)
      .order('tier');
    setPlayers(data ?? []);
    setLoaded(true);
  }

  function toggle(id) {
    onChange(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <div>
      {!loaded ? (
        <button onClick={load} style={{ padding: '8px 14px', border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--elev)', fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--paper)', cursor: 'pointer', marginBottom: 10 }}>
          Load active players
        </button>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto', marginBottom: 10 }}>
          {players.map(p => (
            <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', border: `1px solid ${selected.includes(p.id) ? 'var(--neg)' : 'var(--rule)'}`, borderRadius: 6, background: selected.includes(p.id) ? 'rgba(185,28,28,0.06)' : 'var(--card)', cursor: 'pointer', fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--paper)' }}>
              <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggle(p.id)} style={{ accentColor: 'var(--neg)' }} />
              {p.player_name}
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', marginLeft: 'auto' }}>T{p.tier}</span>
            </label>
          ))}
          {players.length === 0 && (
            <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--mute)' }}>No active players found.</div>
          )}
        </div>
      )}
    </div>
  );
}
