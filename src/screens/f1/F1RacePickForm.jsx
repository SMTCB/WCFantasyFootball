import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { DRIVERS, TEAMS, SPECIAL_OPTIONS } from '../../lib/f1/f1-data';

function DriverSelect({ label, value, onChange, exclude = [], disabled }) {
  return (
    <div>
      <label style={{ display: 'block', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.12em', color: 'var(--mute)', marginBottom: 6, textTransform: 'uppercase' }}>
        {label}
      </label>
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        disabled={disabled}
        style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: value ? 'var(--paper)' : 'var(--mute)', background: 'var(--card)', outline: 'none', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}
      >
        <option value="">Select driver…</option>
        {DRIVERS.filter(d => !exclude.includes(d) || d === value).map(d => (
          <option key={d} value={d}>{d}</option>
        ))}
      </select>
    </div>
  );
}

// Inline pick form for a single race — expands beneath its row in the season calendar.
// Scoped to one already-known race (no race list fetch, no round-selector strip; the
// calendar row above this already shows round/date/GP name/circuit).
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

export default function F1RacePickForm({ race, paddock }) {
  const { user } = useAuth();

  const [existing, setExisting] = useState(null);
  const [isLocked, setIsLocked] = useState(false);

  const [p1, setP1] = useState(null);
  const [p2, setP2] = useState(null);
  const [p3, setP3] = useState(null);
  const [dnf, setDnf] = useState(null);
  const [team, setTeam] = useState(null);
  const [special, setSpecial] = useState(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    const now = new Date();
    const lockTime = race?.race_at ? new Date(race.race_at) - 5 * 60000 : null;
    setIsLocked(race?.is_manual_unlock ? false : (lockTime ? now >= lockTime : false));

    if (!user?.id || !race) return;
    let cancelled = false;
    resolveUserId(user.id).then(uid => {
      if (cancelled) return;
      supabase.from('f1_bets_race')
        .select('*').eq('user_id', uid).eq('season', 2026).eq('round_number', race.round_number)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          setExisting(data);
          if (data) {
            setP1(data.p1); setP2(data.p2); setP3(data.p3);
            setDnf(data.dnf_driver); setTeam(data.team_most_points);
            setSpecial(data.special_category_answer);
          } else {
            setP1(null); setP2(null); setP3(null); setDnf(null); setTeam(null); setSpecial(null);
          }
        });
    });
    return () => { cancelled = true; };
  }, [race, user?.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!p1 || !p2 || !p3) { setErr('P1, P2, and P3 are required.'); return; }
    if (new Set([p1, p2, p3]).size < 3) { setErr('P1, P2, and P3 must be different drivers.'); return; }
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      if (e.message?.includes('f1_bets_race_own_insert') || e.code === '42501') {
        setErr('Picks are locked — qualifying has started.');
      } else {
        setErr(e.message);
      }
    } finally { setSaving(false); }
  }

  const specialOpts = race?.special_category_options ?? SPECIAL_OPTIONS[race?.round_number] ?? null;

  if (!race) return null;

  return (
    <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderTop: 'none', borderRadius: '0 0 6px 6px', padding: '14px' }}>
      {paddock?.archived && (
        <div style={{ marginBottom: 10, padding: '8px 12px', background: 'var(--shell-fill)', borderRadius: 6, border: '1px solid var(--rule)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.1em', color: 'var(--mute)' }}>
          ARCHIVED — this paddock is inactive.
        </div>
      )}
      {race.status === 'finished' ? (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'var(--shell-fill)', borderRadius: 6, border: '1px solid var(--rule)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.1em', color: 'var(--mute)' }}>
          🏁 Race finished
        </div>
      ) : isLocked ? (
        <div style={{ marginBottom: 12, padding: '8px 12px', background: 'rgba(185,28,28,0.08)', borderRadius: 6, border: '1px solid rgba(185,28,28,0.2)', fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--danger)' }}>
          🔒 Picks locked — qualifying has started
        </div>
      ) : existing ? (
        <div style={{ marginBottom: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--positive)' }}>
          ✓ Picks saved — you can update anytime until they lock (5 min before race start)
        </div>
      ) : (
        <div style={{ marginBottom: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--mute)' }}>
          Picks open — save anytime, edit as often as you like, until they lock 5 min before race start
        </div>
      )}

      {race.status === 'finished' && race.result_p1 && (
        <div style={{ background: 'rgba(22,101,52,0.06)', border: '1px solid rgba(22,101,52,0.2)', marginBottom: 12, borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.14em', color: 'var(--positive)', marginBottom: 8 }}>RACE RESULT</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {[['🥇', race.result_p1], ['🥈', race.result_p2], ['🥉', race.result_p3]].map(([m, d]) => (
              <div key={m} style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)' }}>{m} {d?.split(' ').pop()}</div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Podium */}
          <div style={{ background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 8, padding: '14px' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.14em', color: 'var(--mute)', marginBottom: 12 }}>🏆 PODIUM PREDICTIONS</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ borderLeft: '3px solid var(--f1)', paddingLeft: 10, marginLeft: -13 }}>
                <DriverSelect label="P1 — Race Winner" value={p1} onChange={setP1} exclude={[p2, p3].filter(Boolean)} disabled={isLocked} />
              </div>
              <DriverSelect label="P2 — Second Place" value={p2} onChange={setP2} exclude={[p1, p3].filter(Boolean)} disabled={isLocked} />
              <DriverSelect label="P3 — Third Place" value={p3} onChange={setP3} exclude={[p1, p2].filter(Boolean)} disabled={isLocked} />
            </div>
          </div>

          {/* DNF */}
          <div style={{ background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 8, padding: '14px' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.14em', color: 'var(--mute)', marginBottom: 12 }}>💥 DNF DRIVER <span style={{ color: 'var(--mute)', fontWeight: 400 }}>(optional)</span></div>
            <DriverSelect label="Driver who retires" value={dnf} onChange={setDnf} disabled={isLocked} />
          </div>

          {/* Team */}
          <div style={{ background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 8, padding: '14px' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.14em', color: 'var(--mute)', marginBottom: 12 }}>🏎 TEAM — MOST POINTS</div>
            <select
              value={team ?? ''}
              onChange={e => setTeam(e.target.value || null)}
              disabled={isLocked}
              style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: team ? 'var(--paper)' : 'var(--mute)', background: 'var(--card)', outline: 'none', cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.6 : 1 }}
            >
              <option value="">Select team…</option>
              {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Special category */}
          {race.special_category_question && (
            <div style={{ background: 'var(--elev)', border: '1px solid var(--rule)', borderRadius: 8, padding: '14px' }}>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.14em', color: 'var(--mute)', marginBottom: 6 }}>⭐ SPECIAL CATEGORY</div>
              <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: 'var(--paper)', marginBottom: 12, lineHeight: 1.4 }}>{race.special_category_question}</div>
              {race.special_category_type === 'options' && specialOpts ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {specialOpts.map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => !isLocked && setSpecial(special === opt ? null : opt)}
                      style={{ padding: '10px 8px', border: `1px solid ${special === opt ? 'var(--f1)' : 'var(--rule)'}`, borderRadius: 6, background: special === opt ? 'var(--f1-bg)' : 'transparent', fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: special === opt ? 'var(--f1)' : 'var(--paper)', cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.6 : 1 }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : race.special_category_type === 'driver' ? (
                <DriverSelect label="Your pick" value={special} onChange={setSpecial} disabled={isLocked} />
              ) : race.special_category_type === 'team' ? (
                <select
                  value={special ?? ''}
                  onChange={e => setSpecial(e.target.value || null)}
                  disabled={isLocked}
                  style={{ width: '100%', padding: '11px 12px', border: '1px solid var(--rule)', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 'var(--fs-body)', color: special ? 'var(--paper)' : 'var(--mute)', background: 'var(--card)', outline: 'none', cursor: isLocked ? 'default' : 'pointer', opacity: isLocked ? 0.6 : 1 }}
                >
                  <option value="">Select team…</option>
                  {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : null}
            </div>
          )}

          {/* Scoring legend */}
          <div style={{ padding: '10px 12px', background: 'var(--bg)', borderRadius: 6, borderLeft: '3px solid var(--f1)' }}>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', letterSpacing: '0.1em', color: 'var(--mute)', marginBottom: 6 }}>SCORING GUIDE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
              {[['P1 exact','10 pts'],['P2 exact','8 pts'],['P3 exact','6 pts'],['Wrong podium spot','3 pts'],['DNF correct','5 pts'],['Team correct','5 pts'],['Special correct','5 pts'],['All correct bonus','3 pts']].map(([l, v]) => (
                <div key={l} style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--paper)' }}>
                  {l} <span style={{ color: 'var(--f1)', fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {err && <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', color: 'var(--danger)', padding: '8px 12px', background: 'rgba(185,28,28,0.06)', borderRadius: 6 }}>{err}</div>}

          {!isLocked && (
            <button
              type="submit"
              disabled={saving || !p1 || !p2 || !p3}
              style={{ padding: '14px', background: saved ? 'var(--positive)' : saving ? 'var(--gold)' : (!p1 || !p2 || !p3) ? 'var(--mute)' : 'var(--f1)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'JetBrains Mono, monospace', fontSize: 'var(--fs-micro)', fontWeight: 700, letterSpacing: '0.14em', cursor: (saving || !p1 || !p2 || !p3) ? 'default' : 'pointer', transition: 'background 0.2s' }}
            >
              {saved ? '✓ PICKS SAVED' : saving ? 'SAVING…' : 'SAVE PICKS'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
