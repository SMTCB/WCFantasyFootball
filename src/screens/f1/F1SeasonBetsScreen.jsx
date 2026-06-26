import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { DRIVERS, TEAMS } from '../../lib/f1/f1-data';

const SEASON_FIELDS = [
  { key: 'driver_champion',       label: 'Drivers\' Champion',              type: 'driver' },
  { key: 'driver_p2',             label: 'Drivers\' Championship P2',       type: 'driver' },
  { key: 'driver_p3',             label: 'Drivers\' Championship P3',       type: 'driver' },
  { key: 'constructor_champion',  label: 'Constructors\' Champion',         type: 'team' },
  { key: 'last_constructor',      label: 'Last Place Constructor',          type: 'team' },
  { key: 'fewest_finishers_race', label: 'Race with Fewest Finishers',      type: 'race' },
  { key: 'most_dnfs_driver',      label: 'Driver with Most DNFs',           type: 'driver' },
  { key: 'first_driver_replaced', label: 'First Driver to be Replaced',    type: 'driver' },
  { key: 'most_poles',            label: 'Driver with Most Pole Positions', type: 'driver' },
  { key: 'most_podiums_no_win',   label: 'Most Podiums Without a Win',     type: 'driver' },
];

function FieldInput({ field, value, onChange, disabled, races }) {
  const style = { width: '100%', padding: '11px 12px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 14, color: value ? 'var(--paper)' : 'var(--mute)', background: 'var(--card)', outline: 'none', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1, boxSizing: 'border-box' };

  if (field.type === 'driver') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value || null)} disabled={disabled} style={style}>
        <option value="">Select driver…</option>
        {DRIVERS.map(d => <option key={d} value={d}>{d}</option>)}
      </select>
    );
  }
  if (field.type === 'team') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value || null)} disabled={disabled} style={style}>
        <option value="">Select team…</option>
        {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    );
  }
  if (field.type === 'race') {
    return (
      <select value={value ?? ''} onChange={e => onChange(e.target.value || null)} disabled={disabled} style={style}>
        <option value="">Select race…</option>
        {races.map(r => <option key={r.round_number} value={r.gp_name}>R{r.round_number} — {r.gp_name}</option>)}
      </select>
    );
  }
  return null;
}

export default function F1SeasonBetsScreen() {
  useParams();
  const { user } = useAuth();

  const [races, setRaces] = useState([]);
  const [yearResults, setYearResults] = useState(null);
  const [bet, setBet] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!user?.id) return;
    Promise.all([
      supabase.from('f1_races').select('round_number, gp_name').eq('season', 2026).order('round_number'),
      supabase.from('f1_year_results').select('*').eq('season', 2026).maybeSingle(),
      supabase.from('f1_bets_year').select('*').eq('user_id', user.id).eq('season', 2026).maybeSingle(),
    ]).then(([{ data: r }, { data: yr }, { data: b }]) => {
      setRaces(r ?? []);
      setYearResults(yr);
      if (b) {
        const fields = {};
        SEASON_FIELDS.forEach(f => { fields[f.key] = b[f.key] ?? null; });
        setBet(fields);
      }
      setLoading(false);
    });
  }, [user?.id]);

  const isLocked = yearResults?.is_bets_locked ?? false;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true); setErr('');
    try {
      const payload = {
        user_id: user.id, season: 2026,
        ...bet,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('f1_bets_year').upsert(payload, { onConflict: 'user_id,season' });
      if (error) throw error;
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e.message);
    } finally { setSaving(false); }
  }

  function setField(key, val) {
    setBet(b => ({ ...b, [key]: val }));
  }

  const answered = SEASON_FIELDS.filter(f => bet[f.key]).length;

  if (loading) return <div style={{ textAlign: 'center', padding: 40, color: 'var(--mute)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>LOADING…</div>;

  return (
    <div style={{ background: 'var(--ink)', minHeight: '100vh', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '16px 16px 12px' }}>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.45)', marginBottom: 4 }}>
          SEASON PREDICTIONS · 2026
        </div>
        <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 22, color: 'var(--on-shell)', margin: 0 }}>SEASON BETS</h1>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>
          10 pts per correct prediction · {answered}/{SEASON_FIELDS.length} answered
        </div>
      </div>

      {isLocked && (
        <div style={{ margin: '12px 16px', padding: '10px 14px', background: 'rgba(185,28,28,0.08)', border: '1px solid rgba(185,28,28,0.2)', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--danger)' }}>
          🔒 Season bets are locked
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SEASON_FIELDS.map(field => (
          <div key={field.key} style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 8, textTransform: 'uppercase' }}>
              {field.label}
              {yearResults?.[field.key] && (
                <span style={{ marginLeft: 8, color: bet[field.key] === yearResults[field.key] ? 'var(--positive)' : 'var(--danger)' }}>
                  {bet[field.key] === yearResults[field.key] ? '✓ +10' : `✗ (${yearResults[field.key]})`}
                </span>
              )}
            </div>
            <FieldInput
              field={field}
              value={bet[field.key]}
              onChange={val => setField(field.key, val)}
              disabled={isLocked}
              races={races}
            />
          </div>
        ))}

        {err && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--danger)', padding: '8px 12px', background: 'rgba(185,28,28,0.06)', borderRadius: 6 }}>{err}</div>}

        {!isLocked && (
          <button
            type="submit"
            disabled={saving}
            style={{ padding: '14px', background: saved ? 'var(--positive)' : saving ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', cursor: saving ? 'default' : 'pointer', transition: 'background 0.2s', marginTop: 4 }}
          >
            {saved ? '✓ SEASON BETS SAVED' : saving ? 'SAVING…' : 'SAVE SEASON BETS'}
          </button>
        )}
      </form>
    </div>
  );
}
