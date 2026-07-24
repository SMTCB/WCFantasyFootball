import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtpFinalsPicks } from '../../hooks/tennis/useAtpFinalsPicks';

const TIER_TIERS = [
  { range: [1,5],  label: 'Unforced Error',     pts: 250 },
  { range: [6,9],  label: 'Deuce',              pts: 750 },
  { range: [10,12],label: 'Match Point',        pts: 1800 },
  { range: [13,14],label: 'Championship Point', pts: 3500 },
  { range: [15,15],label: '🏆 The Perfect Slate', pts: 7500 },
];

export default function TennisAtpFinalsScreen() {
  const navigate = useNavigate();
  const { atpTournament, groupMatches, knockoutMatches, myPickMap, loading, error, submitGroupPicks, submitKnockoutPicks } = useAtpFinalsPicks(2026);

  const [groupDraft, setGroupDraft] = useState({});
  const [knockoutDraft, setKnockoutDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  if (loading) return <Loader />;
  if (error) return <Err msg={error} onBack={() => navigate('/tennis')} />;

  const status = atpTournament?.status ?? 'upcoming';
  const isGroupOpen = status === 'roster_open';
  const isKnockoutOpen = status === 'qf_captain_open';
  const isCompleted = status === 'completed';

  const allGroupPicked = groupMatches.every(m => groupDraft[m.match_number] || myPickMap[m.match_number]);
  const allKnockoutPicked = knockoutMatches.every(m => knockoutDraft[m.match_number] || myPickMap[m.match_number]);

  async function handleGroupSubmit(e) {
    e.preventDefault();
    setBusy(true); setSubmitErr('');
    try {
      const picks = groupMatches.map(m => ({
        match_number: m.match_number,
        picked_player_id: groupDraft[m.match_number] ?? myPickMap[m.match_number],
      })).filter(p => p.picked_player_id);
      await submitGroupPicks(picks);
      setGroupDraft({});
    } catch (e) {
      setSubmitErr(e.message);
    } finally { setBusy(false); }
  }

  async function handleKnockoutSubmit(e) {
    e.preventDefault();
    setBusy(true); setSubmitErr('');
    try {
      const picks = knockoutMatches.map(m => ({
        match_number: m.match_number,
        picked_player_id: knockoutDraft[m.match_number] ?? myPickMap[m.match_number],
      })).filter(p => p.picked_player_id);
      await submitKnockoutPicks(picks);
      setKnockoutDraft({});
    } catch (e) {
      setSubmitErr(e.message);
    } finally { setBusy(false); }
  }

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', paddingBottom: 40 }}>
      {/* Header */}
      <div style={{ background: 'var(--shell)', padding: '20px 16px' }}>
        <button onClick={() => navigate('/tennis')} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontFamily: 'Archivo, sans-serif', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 10 }}>
          ← Tennis
        </button>
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4 }}>
          🏆 ATP Finals · 2026
        </div>
        <h1 style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 24, color: 'var(--on-shell)', margin: 0 }}>
          ATP Finals Predictions
        </h1>
        <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }}>
          Pick the winner of all 15 matches across 2 login windows.
        </p>
      </div>

      <div style={{ padding: '16px', maxWidth: 600, margin: '0 auto' }}>

        {/* Scoring tiers reference */}
        <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 13, color: 'var(--paper)', marginBottom: 10 }}>Scoring Tiers</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {TIER_TIERS.map(t => (
              <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--paper)' }}>
                  {t.range[0] === t.range[1] ? `${t.range[0]}/15` : `${t.range[0]}–${t.range[1]}/15`} correct — <em>{t.label}</em>
                </span>
                <span style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--accent)' }}>
                  {t.pts.toLocaleString()} pts
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming */}
        {status === 'upcoming' && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '24px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🏆</div>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--mute)' }}>
              Match draw not yet seeded. Check back closer to the ATP Finals.
            </p>
          </div>
        )}

        {/* Group Stage Picks */}
        {(isGroupOpen || isKnockoutOpen || isCompleted) && groupMatches.length > 0 && (
          <div style={{ background: 'var(--card)', border: '1px solid var(--rule)', borderRadius: 6, padding: '16px', marginBottom: 20 }}>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', marginBottom: 4 }}>
              Login 1 — Group Stage (12 matches)
            </div>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--mute)', margin: '0 0 14px' }}>
              {isGroupOpen ? 'Pick the winner of each group match before the first ball is struck.' : 'Group stage picks locked.'}
            </p>
            <form onSubmit={handleGroupSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {groupMatches.map(m => {
                  const existing = myPickMap[m.match_number];
                  const draft = groupDraft[m.match_number];
                  const current = draft ?? existing;
                  return (
                    <MatchPickRow
                      key={m.match_number}
                      match={m}
                      current={current}
                      locked={!isGroupOpen}
                      onChange={id => setGroupDraft(prev => ({ ...prev, [m.match_number]: id }))}
                    />
                  );
                })}
              </div>
              {submitErr && <div style={{ marginTop: 12, fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--neg)' }}>{submitErr}</div>}
              {isGroupOpen && (
                <button
                  type="submit"
                  disabled={busy || !allGroupPicked}
                  style={{ marginTop: 16, width: '100%', padding: '13px', background: busy || !allGroupPicked ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 14, fontWeight: 600, cursor: busy || !allGroupPicked ? 'default' : 'pointer' }}
                >
                  {busy ? 'Saving…' : 'Lock group picks →'}
                </button>
              )}
            </form>
          </div>
        )}

        {/* Knockout Picks */}
        {(isKnockoutOpen || isCompleted) && knockoutMatches.length > 0 && (
          <div style={{ background: 'var(--card)', border: `2px solid ${isKnockoutOpen ? 'var(--accent)' : 'var(--rule)'}`, borderRadius: 6, padding: '16px' }}>
            <div style={{ fontFamily: 'Archivo Black, sans-serif', fontSize: 14, color: 'var(--paper)', marginBottom: 4 }}>
              Login 2 — Knockouts (3 matches)
            </div>
            <p style={{ fontFamily: 'Archivo, sans-serif', fontSize: 12, color: 'var(--mute)', margin: '0 0 14px' }}>
              {isKnockoutOpen ? 'Semifinalists confirmed. Pick SF1, SF2, and the Final winner.' : 'Knockout picks locked.'}
            </p>
            <form onSubmit={handleKnockoutSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {knockoutMatches.map((m, i) => {
                  const existing = myPickMap[m.match_number];
                  const draft = knockoutDraft[m.match_number];
                  const current = draft ?? existing;
                  return (
                    <MatchPickRow
                      key={m.match_number}
                      match={m}
                      label={i < knockoutMatches.length - 1 ? `SF${i + 1}` : 'Final'}
                      current={current}
                      locked={!isKnockoutOpen}
                      onChange={id => setKnockoutDraft(prev => ({ ...prev, [m.match_number]: id }))}
                    />
                  );
                })}
              </div>
              {submitErr && <div style={{ marginTop: 12, fontFamily: 'Archivo, sans-serif', fontSize: 13, color: 'var(--neg)' }}>{submitErr}</div>}
              {isKnockoutOpen && (
                <button
                  type="submit"
                  disabled={busy || !allKnockoutPicked}
                  style={{ marginTop: 16, width: '100%', padding: '13px', background: busy || !allKnockoutPicked ? 'var(--mute)' : 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'Archivo, sans-serif', fontSize: 14, fontWeight: 600, cursor: busy || !allKnockoutPicked ? 'default' : 'pointer' }}
                >
                  {busy ? 'Saving…' : 'Lock knockout picks →'}
                </button>
              )}
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

function MatchPickRow({ match, label, current, locked, onChange }) {
  const playerA = match.player_a_name ?? (match.player_a_id ? match.player_a_id.slice(0, 8) : '?');
  const playerB = match.player_b_name ?? (match.player_b_id ? match.player_b_id.slice(0, 8) : '?');
  const hasResult = !!match.winner_player_id;

  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ padding: '6px 12px', background: 'var(--elev)', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
        {label ?? `Match ${match.match_number}`}
        {hasResult && <span style={{ marginLeft: 8, color: 'var(--pos)' }}>Result in</span>}
      </div>
      <div style={{ display: 'flex' }}>
        {[{ id: match.player_a_id, name: playerA }, { id: match.player_b_id, name: playerB }].map(p => {
          const isPicked = current === p.id;
          const isWinner = match.winner_player_id === p.id;
          const correctPick = hasResult && isPicked && isWinner;
          const wrongPick = hasResult && isPicked && !isWinner;
          return (
            <button
              key={p.id}
              disabled={locked || !p.id}
              onClick={() => !locked && onChange(p.id)}
              style={{
                flex: 1, padding: '12px 10px', border: 'none', borderRight: '1px solid var(--rule)',
                cursor: locked ? 'default' : 'pointer',
                background: correctPick ? 'rgba(22,101,52,0.1)' : wrongPick ? 'rgba(185,28,28,0.07)' : isPicked ? 'var(--accent-bg)' : 'var(--card)',
                fontFamily: 'Archivo, sans-serif', fontSize: 14, fontWeight: isPicked ? 600 : 400,
                color: correctPick ? 'var(--pos)' : wrongPick ? 'var(--neg)' : isPicked ? 'var(--accent)' : 'var(--paper)',
                transition: 'background 0.1s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              {p.name}
              {correctPick && <span style={{ fontSize: 12 }}>✓</span>}
              {isWinner && !isPicked && hasResult && <span style={{ fontSize: 10, color: 'var(--mute)' }}>winner</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Loader() {
  return <div style={{ background: 'var(--bg)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--mute)' }}>Loading…</div>;
}

function Err({ msg, onBack }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: 24 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontFamily: 'Archivo, sans-serif', fontSize: 14, padding: 0, marginBottom: 16 }}>← Back</button>
      <div style={{ fontFamily: 'Archivo, sans-serif', fontSize: 14, color: 'var(--neg)' }}>{msg}</div>
    </div>
  );
}
