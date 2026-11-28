import { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import {
  DRIVERS, TEAMS, SPECIAL_OPTIONS, DRIVER_TEAM, TEAM_COLOR,
  driverCode, lastName, picksLockAt,
} from '../../lib/f1/f1-data';

// Rolldown TDZ rule: F1HomeScreen imports F1Kit and UiIcons, so this form must
// not import either of them. Anything it needs from there comes in as a prop.

// Resolves the id that will actually authenticate the request (supabase-js reads
// whatever real session is in storage independent of demo-mode auth state), not
// useAuth()'s possibly-frozen DEMO_USER — otherwise a write's user_id column can
// silently disagree with the JWT's auth.uid(), tripping the owner-only RLS policy.
async function resolveUserId(fallbackId) {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id ?? fallbackId;
  } catch {
    return fallbackId;
  }
}

function lockLabel(race) {
  const d = picksLockAt(race);
  if (!d) return '';
  return `${d.toLocaleDateString('en-GB', { weekday: 'short' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

const PODIUM = ['p1', 'p2', 'p3'];

// The picks for one race, one question per step: P1, P2, P3, DNF, team, special.
export default function F1RacePickForm({ race, paddock, myPoints, onSaved, onOpenReport }) {
  const { user } = useAuth();

  const [existing, setExisting] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [picks, setPicks] = useState({ p1: null, p2: null, p3: null, dnf: null, team: null, special: null });
  const [stepIdx, setStepIdx] = useState(0);
  const [query, setQuery] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  // Set by any pick below; guards the fetch effect against overwriting
  // picks the user has already started entering (see the .then() comment).
  const editedRef = useRef(false);
  const picksTopRef = useRef(null);

  useEffect(() => {
    const now = new Date();
    const lockTime = picksLockAt(race);
    setIsLocked(race?.is_manual_unlock ? false : (lockTime ? now >= lockTime : false));
    editedRef.current = false;
    setStepIdx(0);
    setQuery('');
    setErr('');

    if (!user?.id || !race) return;
    let cancelled = false;
    resolveUserId(user.id).then(uid => {
      if (cancelled) return;
      supabase.from('f1_bets_race')
        .select('*').eq('user_id', uid).eq('season', 2026).eq('round_number', race.round_number)
        .maybeSingle()
        .then(({ data }) => {
          // Don't stomp picks the user already started entering — this fetch
          // can resolve after the user has begun interacting with the form
          // (slow network, or heavy local load), and unconditionally applying
          // it here would silently wipe their in-progress selections back to
          // whatever's (or isn't) saved.
          if (cancelled || editedRef.current) return;
          setExisting(data);
          setPicks(data ? {
            p1: data.p1, p2: data.p2, p3: data.p3, dnf: data.dnf_driver,
            team: data.team_most_points, special: data.special_category_answer,
          } : { p1: null, p2: null, p3: null, dnf: null, team: null, special: null });
        });
    });
    return () => { cancelled = true; };
  }, [race, user?.id]);

  const gp = (race?.gp_name ?? '').replace(/ GP.*$/, '');
  const specialOpts = race?.special_category_options ?? SPECIAL_OPTIONS[race?.round_number] ?? null;
  const specialKind = race?.special_category_type === 'options' && specialOpts ? 'options'
    : race?.special_category_type === 'driver' ? 'driver'
    : race?.special_category_type === 'team' ? 'team' : null;

  const steps = useMemo(() => {
    const list = [
      { key: 'p1', short: 'P1', long: 'Race winner', kind: 'driver', title: `Who wins in ${gp}?`, help: '10 points if exact. 3 if they finish P2 or P3.' },
      { key: 'p2', short: 'P2', long: 'Second place', kind: 'driver', title: 'Who finishes second?', help: '8 points if exact. 3 if they finish P1 or P3.' },
      { key: 'p3', short: 'P3', long: 'Third place', kind: 'driver', title: 'Who finishes third?', help: '6 points if exact. 3 if they finish P1 or P2.' },
      { key: 'dnf', short: 'DNF', long: 'Does not finish', kind: 'driver', optional: true, title: 'Who does not finish?', help: '5 points if they retire. Optional.' },
      { key: 'team', short: 'TEAM', long: 'Top team', kind: 'team', optional: true, title: 'Which team scores the most points?', help: '5 points if right. Optional.' },
    ];
    if (race?.special_category_question && specialKind) {
      list.push({ key: 'special', short: 'SPEC', long: 'Special', kind: specialKind, optional: true, title: race.special_category_question, help: '5 points if right. Optional.' });
    }
    return list;
  }, [gp, race?.special_category_question, specialKind]);

  if (!race) return null;

  const finished = race.status === 'finished';
  const podiumSet = picks.p1 && picks.p2 && picks.p3;
  const filledCount = steps.filter(s => picks[s.key]).length;
  const step = steps[Math.min(stepIdx, steps.length - 1)];

  function choose(key, value) {
    editedRef.current = true;
    setErr('');
    const picking = picks[key] !== value;
    setPicks(p => ({ ...p, [key]: p[key] === value ? null : value }));
    // A new pick moves straight on to the next step, so six taps make a full set.
    if (picking && stepIdx < steps.length - 1) goTo(stepIdx + 1);
  }

  function goTo(i) {
    setStepIdx(i);
    setQuery('');
    // Long driver lists leave the step tabs off screen; bring them back.
    requestAnimationFrame(() => {
      const el = picksTopRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const { p1, p2, p3, dnf, team, special } = picks;
    if (!p1 || !p2 || !p3) { setErr('Pick P1, P2 and P3 to save.'); return; }
    if (new Set([p1, p2, p3]).size < 3) { setErr('P1, P2 and P3 must be different drivers.'); return; }
    setSaving(true); setErr('');
    try {
      const uid = await resolveUserId(user.id);
      const payload = {
        user_id: uid, season: 2026, round_number: race.round_number,
        p1, p2, p3, dnf_driver: dnf, team_most_points: team,
        special_category_answer: special, updated_at: new Date().toISOString(),
      };
      const { error: e } = await supabase.from('f1_bets_race').upsert(payload, { onConflict: 'user_id,season,round_number' });
      if (e) throw e;
      setExisting(payload);
      setSaved(true);
      onSaved?.(race.round_number);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      if (e.message?.includes('f1_bets_race_own_insert') || e.code === '42501') {
        setErr('Picks are locked. They close 5 minutes before the race starts.');
        setIsLocked(true);
      } else {
        setErr(e.message);
      }
    } finally { setSaving(false); }
  }

  // ── Read-only: picks locked or race finished ───────────────────────────────
  if (finished || isLocked) {
    const result = {
      p1: race.result_p1, p2: race.result_p2, p3: race.result_p3,
      dnf: race.result_dnf_drivers, team: race.result_team_most_points, special: race.special_category_answer,
    };
    const podiumResult = [race.result_p1, race.result_p2, race.result_p3];
    const mark = key => {
      if (!finished || !race.is_scored || !picks[key]) return null;
      let ok;
      if (key === 'dnf') ok = (result.dnf ?? []).includes(picks.dnf);
      else if (PODIUM.includes(key)) ok = result[key] === picks[key] ? true : podiumResult.includes(picks[key]) ? 'near' : false;
      else ok = result[key] === picks[key];
      if (ok === 'near') return <span className="f1-mono" style={{ fontSize: 'var(--fs-micro)', color: 'var(--gold-text)' }}>ON PODIUM</span>;
      return ok
        ? <span className="f1-mono f1-ok" style={{ fontSize: 'var(--fs-micro)' }}>RIGHT</span>
        : <span className="f1-mono f1-nok" style={{ fontSize: 'var(--fs-micro)' }}>WRONG</span>;
    };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {paddock?.archived && <div className="f1-note mute">Archived. This league is inactive.</div>}
        {finished && race.result_p1 && (
          <div className="f1-live" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span className="f1-eb">R{race.round_number} · Race result</span>
              {myPoints != null && <span className="f1-pill gold">You scored {myPoints} pts</span>}
            </div>
            <div className="f1-podium">
              {podiumResult.map((d, i) => (
                <div key={i}>
                  <div className="k">P{i + 1}</div>
                  <div className="d">{driverCode(d)}</div>
                  <div className="k" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lastName(d)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {!finished && (
          <div className="f1-note red">Picks are locked. They closed 5 minutes before the race.</div>
        )}
        <div className="f1-card">
          <div className="f1-card-head">
            <span className="f1-eb">Your picks</span>
            {!existing && <span className="f1-pill mute">No picks made</span>}
          </div>
          {steps.map(s => (
            <div key={s.key} className="f1-kv">
              <span className="f1-eb">{s.short}</span>
              <span className="n" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {picks[s.key] ?? <span style={{ color: 'var(--mute)', fontWeight: 400 }}>No pick</span>}
              </span>
              <span className="v">{mark(s.key)}</span>
            </div>
          ))}
        </div>
        {finished && onOpenReport && (
          <button type="button" className="f1-btn2" onClick={onOpenReport} style={{ width: '100%' }}>See the full report</button>
        )}
      </div>
    );
  }

  // ── Open: one question per step ────────────────────────────────────────────
  const podiumOwner = {};
  PODIUM.forEach(k => { if (picks[k]) podiumOwner[picks[k]] = k.toUpperCase(); });

  let options = [];
  if (step.kind === 'driver') {
    options = DRIVERS.map(d => ({ value: d, label: d, team: DRIVER_TEAM[d] }));
  } else if (step.kind === 'team') {
    options = TEAMS.map(t => ({
      value: t, label: t, team: t,
      sub: DRIVERS.filter(d => DRIVER_TEAM[d] === t).map(lastName).join(' · '),
    }));
  } else if (step.kind === 'options') {
    options = specialOpts.map(o => ({ value: o, label: o }));
  }
  const q = query.trim().toLowerCase();
  if (q && step.kind !== 'options') {
    options = options.filter(o => o.label.toLowerCase().includes(q) || (o.team ?? '').toLowerCase().includes(q));
  }

  const next = steps[stepIdx + 1];

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {paddock?.archived && <div className="f1-note mute">Archived. This league is inactive.</div>}

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div className="f1-eb">Locks {lockLabel(race)}</div>
          <h2 className="f1-h" style={{ fontSize: 'var(--fs-heading)', marginTop: 2 }}>Your picks</h2>
        </div>
        <span className="f1-mono" style={{ fontSize: 'var(--fs-label)', fontWeight: 600, color: 'var(--text-2)' }}>{filledCount}/{steps.length}</span>
      </div>

      <div className="f1-picks" ref={picksTopRef} style={{ scrollMarginTop: 72 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="f1-steps" role="tablist" aria-label="Pick steps">
            {steps.map((s, i) => {
              const v = picks[s.key];
              const cls = `f1-step${i === stepIdx ? ' cur' : ''}${v ? ' filled' : ''}`;
              const code = v ? (s.kind === 'driver' ? driverCode(v) : s.kind === 'team' ? v.slice(0, 3).toUpperCase() : 'SET') : '';
              return (
                <button key={s.key} type="button" role="tab" aria-selected={i === stepIdx} className={cls} onClick={() => goTo(i)}
                  aria-label={`${s.long}${v ? `: ${v}` : ''}`}>
                  <span className="bar" />
                  <span className="lbl short">{s.short}{code ? ` ${code}` : ''}</span>
                  <span className="lbl long" style={{ flex: 1 }}>{s.long}</span>
                  <span className="long" style={{ color: v ? 'var(--paper)' : 'var(--mute)', maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v ? (s.kind === 'driver' ? lastName(v) : v) : (s.optional ? 'Optional' : '—')}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="f1-note mute f1-desk" style={{ fontSize: 'var(--fs-micro)' }}>
            All six right adds a 3-point bonus. Save as often as you like until picks lock.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
          <div>
            <div className="f1-eb" style={{ color: 'var(--danger)' }}>Step {stepIdx + 1} · {step.long}</div>
            <div className="f1-h" style={{ fontSize: 'var(--fs-heading)', marginTop: 4 }}>{step.title}</div>
            <div style={{ fontSize: 'var(--fs-label)', color: 'var(--text-2)', marginTop: 4 }}>{step.help}</div>
          </div>

          {step.kind !== 'options' && (
            <input
              type="search"
              className="f1-search"
              placeholder={step.kind === 'team' ? 'Search teams' : 'Search drivers or teams'}
              aria-label={step.kind === 'team' ? 'Search teams' : 'Search drivers'}
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          )}

          <div className={`f1-drvs f1-card${step.kind === 'driver' ? ' grid' : ''}`} role="radiogroup" aria-label={step.title}>
            {options.length === 0 && <div style={{ padding: 16, color: 'var(--mute)', fontSize: 'var(--fs-label)' }}>No match.</div>}
            {options.map(o => {
              const checked = picks[step.key] === o.value;
              const takenBy = PODIUM.includes(step.key) && podiumOwner[o.value] && podiumOwner[o.value] !== step.short ? podiumOwner[o.value] : null;
              return (
                <button
                  key={o.value}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  disabled={!!takenBy}
                  className="f1-drv"
                  onClick={() => choose(step.key, o.value)}
                >
                  <span className="tc" style={{ background: o.team ? TEAM_COLOR[o.team] : 'transparent' }} />
                  <span style={{ minWidth: 0 }}>
                    <span className="nm">{o.label}</span>
                    {(takenBy || o.sub || (step.kind === 'driver' && o.team)) && (
                      <span className="sub">{takenBy ? `Your ${takenBy} pick` : (o.sub ?? o.team)}</span>
                    )}
                  </span>
                  <span className="f1-rd" />
                </button>
              );
            })}
          </div>

          {err && <div className="f1-note red" role="alert">{err}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            {stepIdx > 0 && (
              <button type="button" className="f1-btn2" onClick={() => goTo(stepIdx - 1)} style={{ flex: 'none' }}>Back</button>
            )}
            {next && (
              <button type="button" className={podiumSet ? 'f1-btn2' : 'f1-btn'} onClick={() => goTo(stepIdx + 1)} style={{ flex: 1, minHeight: 46 }}>
                Next · {next.short}
              </button>
            )}
          </div>

          {(podiumSet || !next) && (
            <button type="submit" className={`f1-btn${saved ? ' done' : ''}`} disabled={saving || !podiumSet}>
              {saved ? 'Picks saved' : saving ? 'Saving…' : podiumSet ? (existing ? 'Update picks' : 'Save picks') : 'Pick P1, P2 and P3 to save'}
            </button>
          )}
          {existing && !saved && (
            <div style={{ fontSize: 'var(--fs-micro)', color: 'var(--positive)', fontFamily: 'var(--font-mono)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
              Picks in · you can change them until {lockLabel(race)}
            </div>
          )}
        </div>
      </div>
    </form>
  );
}
