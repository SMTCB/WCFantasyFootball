import { LoadingRows } from '../../components/Skeleton';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { usePaddock } from '../../hooks/f1/usePaddock';
import { DRIVERS, TEAMS } from '../../lib/f1/f1-data';
import { F1Header } from '../../components/f1/F1Kit';

const POINTS_EACH = 10;

const SEASON_FIELDS = [
  { key: 'driver_champion',       label: 'Drivers\' champion',          type: 'driver' },
  { key: 'driver_p2',             label: 'Drivers\' championship P2',   type: 'driver' },
  { key: 'driver_p3',             label: 'Drivers\' championship P3',   type: 'driver' },
  { key: 'constructor_champion',  label: 'Constructors\' champion',     type: 'team' },
  { key: 'last_constructor',      label: 'Last-placed team',            type: 'team' },
  { key: 'fewest_finishers_race', label: 'Race with fewest finishers',  type: 'race' },
  { key: 'most_dnfs_driver',      label: 'Driver with most DNFs',       type: 'driver' },
  { key: 'first_driver_replaced', label: 'First driver replaced',       type: 'driver' },
  { key: 'most_poles',            label: 'Most pole positions',         type: 'driver' },
  { key: 'most_podiums_no_win',   label: 'Most podiums without a win',  type: 'driver' },
];

function FieldInput({ field, value, onChange, races }) {
  const opts = field.type === 'driver' ? DRIVERS.map(d => [d, d])
    : field.type === 'team' ? TEAMS.map(t => [t, t])
      : races.map(r => [r.gp_name, `R${r.round_number} · ${r.gp_name}`]);
  const placeholder = field.type === 'driver' ? 'Choose a driver' : field.type === 'team' ? 'Choose a team' : 'Choose a race';
  return (
    <select
      className="f1-select"
      aria-label={field.label}
      value={value ?? ''}
      onChange={e => onChange(e.target.value || null)}
      style={{ color: value ? 'var(--paper)' : 'var(--mute)' }}
    >
      <option value="">{placeholder}</option>
      {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

export default function F1SeasonBetsScreen() {
  const { paddockId } = useParams();
  const { user } = useAuth();
  const { myPaddocks } = usePaddock();
  const paddock = myPaddocks.find(p => p.paddock_id === paddockId);

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
    setSaved(false);
    setBet(b => ({ ...b, [key]: val }));
  }

  if (loading) {
    return <div className="f1-screen"><div className="sport-col f1-body"><LoadingRows rows={5} /></div></div>;
  }

  const answered = SEASON_FIELDS.filter(f => bet[f.key]).length;
  const settled = SEASON_FIELDS.filter(f => yearResults?.[f.key]);
  const right = settled.filter(f => bet[f.key] === yearResults[f.key]).length;
  const raceName = name => {
    const r = races.find(x => x.gp_name === name);
    return r ? `R${r.round_number} · ${name}` : name;
  };

  const eyebrow = [
    paddock?.name ?? 'F1 league',
    isLocked ? 'bets locked' : 'bets open',
  ].join(' · ');

  return (
    <div className="f1-screen">
      <form onSubmit={handleSubmit} className="sport-col f1-body">
        <F1Header eyebrow={eyebrow} title="Season bets" />

        <section className="f1-live" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }} aria-label="Season bets summary">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
            <span className="f1-h" style={{ fontSize: 'var(--fs-heading)', color: 'var(--on-accent)' }}>
              {settled.length > 0
                ? `${right} of ${settled.length} settled bets right`
                : `${answered} of ${SEASON_FIELDS.length} bets made`}
            </span>
            {settled.length > 0 && <span className="f1-pill gold">{right * POINTS_EACH} PTS</span>}
          </div>
          <div className="f1-progress" aria-hidden="true">
            {SEASON_FIELDS.map(f => {
              const res = yearResults?.[f.key];
              const cls = res ? (bet[f.key] === res ? 'on' : 'off') : '';
              return <span key={f.key} className={cls} style={!res && bet[f.key] ? { background: 'var(--f1-navy-mute)' } : undefined} />;
            })}
          </div>
          <span className="f1-mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--f1-navy-mute)' }}>
            {POINTS_EACH} pts for each right answer · settles after the final race
          </span>
        </section>

        {isLocked && <div className="f1-note mute">Season bets are locked. Your answers are below.</div>}

        <div className="sport-cards" style={{ gap: 10 }}>
          {SEASON_FIELDS.map(field => {
            const result = yearResults?.[field.key];
            const mine = bet[field.key];
            const isRight = result && mine === result;
            return (
              <div key={field.key} className="f1-card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span className="f1-eb">{field.label}</span>
                  {result && mine
                    ? <span className={`f1-pill ${isRight ? 'done' : 'off'}`}>{isRight ? `+${POINTS_EACH} right` : 'Wrong'}</span>
                    : result ? <span className="f1-pill mute">No bet</span>
                    : isLocked && <span className="f1-pill mute">Pending</span>}
                </div>
                {isLocked ? (
                  <span style={{ fontWeight: 700, fontSize: 'var(--fs-body-lg)', color: mine ? 'var(--paper)' : 'var(--mute)' }}>
                    {mine ? (field.type === 'race' ? raceName(mine) : mine) : 'No answer'}
                  </span>
                ) : (
                  <FieldInput field={field} value={mine} onChange={val => setField(field.key, val)} races={races} />
                )}
                {result && !isRight && (
                  <span style={{ fontSize: 'var(--fs-micro)', color: 'var(--text-2)' }}>
                    Answer: {field.type === 'race' ? raceName(result) : result}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {err && <div className="f1-note red">{err}</div>}

        {!isLocked && (
          <button type="submit" className={`f1-btn${saved ? ' done' : ''}`} disabled={saving} style={{ maxWidth: 420, alignSelf: 'center' }}>
            {saved ? 'Season bets saved' : saving ? 'Saving…' : 'Save season bets'}
          </button>
        )}
      </form>
    </div>
  );
}
