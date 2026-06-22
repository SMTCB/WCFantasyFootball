import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { DRIVERS, TEAMS } from '../../lib/f1/f1-data';
import { fetchRaceSession, fetchSessionResult } from '../../lib/f1/openf1';

export default function F1AdminScreen() {
  useParams();
  const { user } = useAuth();

  const [isAdmin, setIsAdmin] = useState(false);
  const [races, setRaces] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [race, setRace] = useState(null);
  const [yearResults, setYearResults] = useState(null);

  const [p1, setP1] = useState(''); const [p2, setP2] = useState(''); const [p3, setP3] = useState('');
  const [dnfs, setDnfs] = useState([]);
  const [team, setTeam] = useState('');
  const [specialAns, setSpecialAns] = useState('');
  const [manualUnlock, setManualUnlock] = useState(false);

  const [yearFields, setYearFields] = useState({});
  const [activeSection, setActiveSection] = useState('race');

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [fetchingOpenF1, setFetchingOpenF1] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    supabase.from('users').select('is_admin').eq('id', user.id).maybeSingle()
      .then(({ data }) => setIsAdmin(data?.is_admin ?? false));
    supabase.from('f1_races').select('*').eq('season', 2026).order('round_number')
      .then(({ data }) => {
        setRaces(data ?? []);
        const first = data?.find(r => !r.is_scored) ?? data?.[0];
        if (first) setSelectedId(first.id);
      });
    supabase.from('f1_year_results').select('*').eq('season', 2026).maybeSingle()
      .then(({ data }) => { setYearResults(data); if (data) setYearFields(data); });
  }, [user?.id]);

  useEffect(() => {
    if (!selectedId) return;
    const r = races.find(r => r.id === selectedId);
    setRace(r ?? null);
    if (r) {
      setP1(r.result_p1 ?? ''); setP2(r.result_p2 ?? ''); setP3(r.result_p3 ?? '');
      setDnfs(r.result_dnf_drivers ?? []);
      setTeam(r.result_team_most_points ?? '');
      setSpecialAns(r.special_category_answer ?? '');
      setManualUnlock(r.is_manual_unlock ?? false);
    }
  }, [selectedId, races]);

  async function fetchFromOpenF1() {
    if (!race) return;
    setFetchingOpenF1(true); setMsg('Fetching from OpenF1…');
    try {
      const session = await fetchRaceSession(2026, race.round_number);
      if (!session) { setMsg('No OpenF1 session found for this race.'); return; }
      const result = await fetchSessionResult(session.session_key);
      if (result.length >= 3) {
        setP1(result[0]?.name ?? ''); setP2(result[1]?.name ?? ''); setP3(result[2]?.name ?? '');
        setMsg(`Fetched from OpenF1: ${result[0]?.name}, ${result[1]?.name}, ${result[2]?.name}`);
      } else {
        setMsg('OpenF1 result incomplete — fill manually.');
      }
    } catch (e) {
      setMsg('OpenF1 fetch failed: ' + e.message);
    } finally { setFetchingOpenF1(false); }
  }

  async function saveRaceResult() {
    if (!race || !p1 || !p2 || !p3) { setMsg('P1, P2, P3 required.'); return; }
    setBusy(true); setMsg('');
    try {
      const { error } = await supabase.from('f1_races').update({
        result_p1: p1, result_p2: p2, result_p3: p3,
        result_dnf_drivers: dnfs.filter(Boolean),
        result_team_most_points: team || null,
        special_category_answer: specialAns || null,
        is_manual_unlock: manualUnlock,
        status: 'finished',
      }).eq('id', race.id);
      if (error) throw error;
      setMsg('Race result saved.');
      setRaces(rs => rs.map(r => r.id === race.id ? { ...r, result_p1: p1, result_p2: p2, result_p3: p3, status: 'finished' } : r));
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setBusy(false); }
  }

  async function scoreRace() {
    if (!race) return;
    setBusy(true); setMsg('Scoring race…');
    try {
      const { data, error } = await supabase.functions.invoke('score-f1-race', { body: { race_id: race.id } });
      if (error) throw error;
      setMsg(`Scored: ${data?.scored ?? 0} bets · winner: ${data?.winner ?? 'n/a'} (${data?.winner_pts ?? 0} pts)`);
      setRaces(rs => rs.map(r => r.id === race.id ? { ...r, is_scored: true } : r));
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setBusy(false); }
  }

  async function saveYearResults() {
    setBusy(true); setMsg('');
    try {
      const { error } = await supabase.from('f1_year_results').update({ ...yearFields, updated_at: new Date().toISOString() }).eq('season', 2026);
      if (error) throw error;
      setMsg('Season results saved.');
    } catch (e) { setMsg('Error: ' + e.message); }
    finally { setBusy(false); }
  }

  async function toggleYearLock() {
    const next = !(yearResults?.is_bets_locked);
    await supabase.from('f1_year_results').update({ is_bets_locked: next }).eq('season', 2026);
    setYearResults(r => ({ ...r, is_bets_locked: next }));
    setMsg(`Season bets ${next ? 'locked' : 'unlocked'}.`);
  }

  if (!isAdmin) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <p style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--mute)', fontSize: 12 }}>ADMIN ACCESS REQUIRED</p>
        </div>
      </div>
    );
  }

  const btnStyle = (variant = 'primary') => ({
    padding: '11px 18px', border: 'none', borderRadius: 6,
    fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
    cursor: busy ? 'default' : 'pointer',
    background: variant === 'primary' ? 'var(--accent)' : variant === 'danger' ? 'var(--danger)' : 'var(--elev)',
    color: variant === 'elev' ? 'var(--paper)' : '#fff',
    opacity: busy ? 0.7 : 1,
  });

  const selectStyle = { width: '100%', padding: '10px 12px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--paper)', background: 'var(--card)', outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ background: 'var(--ink)', minHeight: '100vh', paddingBottom: 40 }}>
      <div style={{ background: 'var(--shell)', padding: '16px 16px 12px' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>⚡ ADMIN PANEL</div>
        <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 22, color: '#fff', margin: 0 }}>F1 ADMIN</h1>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--rule)' }}>
        {[['race', 'RACE RESULTS'], ['season', 'SEASON BETS']].map(([k, l]) => (
          <button key={k} onClick={() => setActiveSection(k)} style={{ flex: 1, padding: '11px 0', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', cursor: 'pointer', border: 'none', borderBottom: activeSection === k ? '2px solid var(--accent)' : '2px solid transparent', background: 'transparent', color: activeSection === k ? 'var(--accent)' : 'var(--mute)', marginBottom: -1 }}>
            {l}
          </button>
        ))}
      </div>

      <div style={{ padding: '16px', maxWidth: 560 }}>
        {msg && (
          <div style={{ padding: '10px 14px', marginBottom: 14, background: 'var(--elev)', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--paper)' }}>
            {msg}
          </div>
        )}

        {/* RACE RESULTS */}
        {activeSection === 'race' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', marginBottom: 6, letterSpacing: '0.1em' }}>SELECT RACE</label>
              <select value={selectedId ?? ''} onChange={e => setSelectedId(e.target.value)} style={selectStyle}>
                {races.map(r => <option key={r.id} value={r.id}>R{r.round_number} — {r.gp_name} {r.is_scored ? '✓' : ''}</option>)}
              </select>
            </div>

            {race && (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={fetchFromOpenF1} disabled={fetchingOpenF1 || busy} style={btnStyle('elev')}>
                    {fetchingOpenF1 ? 'FETCHING…' : '⚡ FETCH FROM OPENF1'}
                  </button>
                </div>

                {['P1 Winner', 'P2 Second', 'P3 Third'].map((label, i) => {
                  const vals = [p1, p2, p3]; const setters = [setP1, setP2, setP3];
                  return (
                    <div key={label}>
                      <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</label>
                      <select value={vals[i]} onChange={e => setters[i](e.target.value)} style={selectStyle}>
                        <option value="">Select driver…</option>
                        {DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  );
                })}

                <div>
                  <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', marginBottom: 6, letterSpacing: '0.1em' }}>TEAM — MOST POINTS</label>
                  <select value={team} onChange={e => setTeam(e.target.value)} style={selectStyle}>
                    <option value="">Select team…</option>
                    {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                {race.special_category_question && (
                  <div>
                    <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', marginBottom: 6, letterSpacing: '0.1em' }}>SPECIAL: {race.special_category_question}</label>
                    <input
                      value={specialAns}
                      onChange={e => setSpecialAns(e.target.value)}
                      placeholder="Enter answer…"
                      style={{ ...selectStyle, fontFamily: 'Archivo, sans-serif' }}
                    />
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6 }}>
                  <input type="checkbox" id="unlock" checked={manualUnlock} onChange={e => setManualUnlock(e.target.checked)} />
                  <label htmlFor="unlock" style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--paper)', cursor: 'pointer', letterSpacing: '0.1em' }}>
                    MANUAL UNLOCK (allow late bet edits)
                  </label>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={saveRaceResult} disabled={busy} style={btnStyle('primary')}>SAVE RESULT</button>
                  <button onClick={scoreRace} disabled={busy || !race.result_p1 || race.is_scored} style={btnStyle('elev')}>
                    {race.is_scored ? '✓ ALREADY SCORED' : 'SCORE RACE →'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* SEASON BETS */}
        {activeSection === 'season' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: yearResults?.is_bets_locked ? 'var(--danger)' : 'var(--positive)' }}>
                {yearResults?.is_bets_locked ? '🔒 LOCKED' : '🔓 OPEN'}
              </span>
              <button onClick={toggleYearLock} disabled={busy} style={btnStyle('elev')}>
                {yearResults?.is_bets_locked ? 'UNLOCK BETS' : 'LOCK BETS'}
              </button>
            </div>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--mute)', margin: 0 }}>
              Enter final season results to score all season bets. Each correct prediction = 10 pts.
            </p>
            {[['driver_champion','Driver Champion'],['driver_p2','P2'],['driver_p3','P3'],['constructor_champion','Constructor Champion'],['last_constructor','Last Constructor'],['fewest_finishers_race','Fewest Finishers Race'],['most_dnfs_driver','Most DNFs Driver'],['first_driver_replaced','First Driver Replaced'],['most_poles','Most Poles'],['most_podiums_no_win','Most Podiums No Win']].map(([key, label]) => (
              <div key={key}>
                <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--mute)', marginBottom: 6, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</label>
                <input
                  value={yearFields[key] ?? ''}
                  onChange={e => setYearFields(f => ({ ...f, [key]: e.target.value || null }))}
                  placeholder="Enter result…"
                  style={{ ...selectStyle, fontFamily: 'Archivo, sans-serif' }}
                />
              </div>
            ))}
            <button onClick={saveYearResults} disabled={busy} style={btnStyle('primary')}>SAVE SEASON RESULTS</button>
          </div>
        )}
      </div>
    </div>
  );
}
