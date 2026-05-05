import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

/* ── Fallback fixtures — generic placeholders, no competition branding ──────── */
const FALLBACK_FIXTURES = [
  { id: 'f1', home_team: 'Home Team A', away_team: 'Away Team B', status: 'scheduled', kickoff_at: new Date(Date.now() + 1000*60*60*2).toISOString(),  competition: 'Matchday 1' },
  { id: 'f2', home_team: 'Home Team C', away_team: 'Away Team D', status: 'scheduled', kickoff_at: new Date(Date.now() + 1000*60*60*4).toISOString(),  competition: 'Matchday 1' },
];

/* ── Prediction result — scored against actual ────────────────────────────── */
function getPredictionResult(fixture, prediction) {
  if (fixture.status !== 'finished' || !prediction) return null;
  const h = fixture.home_score ?? 0;
  const a = fixture.away_score ?? 0;
  const actual = h > a ? 'home' : a > h ? 'away' : 'draw';
  return prediction === actual ? 'correct' : 'wrong';
}

/* ── Fixture card ─────────────────────────────────────────────────────────── */
function FixtureCard({ fixture, prediction, onPredict }) {
  const result = getPredictionResult(fixture, prediction);
  const isLive = fixture.status === 'live';
  const isFinished = fixture.status === 'finished';
  const isScheduled = fixture.status === 'scheduled';

  const kickoffLabel = fixture.kickoff_at
    ? new Date(fixture.kickoff_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '';

  const h = fixture.home_score ?? null;
  const a = fixture.away_score ?? null;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{
        background: '#111',
        border: result === 'correct'
          ? '1px solid rgba(24,201,107,0.35)'
          : result === 'wrong'
          ? '1px solid rgba(240,58,58,0.25)'
          : '1px solid rgba(255,255,255,0.07)',
        boxShadow: isLive ? '0 0 12px rgba(24,201,107,0.08)' : 'none',
      }}
    >
      {/* Status bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <span
          className="text-[9px] font-black uppercase tracking-widest"
          style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
        >
          {fixture.competition ?? ''}
        </span>
        {isLive && (
          <span
            className="flex items-center gap-1 text-[9px] font-black uppercase"
            style={{ color: 'var(--positive)', fontFamily: 'Archivo Black, sans-serif' }}
          >
            <span className="w-[5px] h-[5px] rounded-full bg-[#18C96B] animate-pulse inline-block" />
            {fixture.minute}'
          </span>
        )}
        {isFinished && (
          <span
            className="text-[9px] font-black uppercase"
            style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
          >
            FT
          </span>
        )}
        {isScheduled && (
          <span
            className="text-[9px] font-medium"
            style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
          >
            {kickoffLabel}
          </span>
        )}
      </div>

      {/* Teams + score */}
      <div className="flex items-center px-3 py-3 gap-3">
        {/* Home */}
        <div className="flex-1 min-w-0">
          <div
            className="font-black text-[14px] truncate"
            style={{
              fontFamily: 'Archivo Black, sans-serif',
              color: (isFinished || isLive) && h > a ? 'var(--paper)' : '#9E9E9E',
            }}
          >
            {fixture.home_team}
          </div>
        </div>

        {/* Score or vs */}
        <div className="shrink-0 text-center" style={{ minWidth: '52px' }}>
          {(isLive || isFinished) ? (
            <div
              className="text-[22px] font-black tabular-nums leading-none"
              style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--paper)' }}
            >
              {h ?? 0} – {a ?? 0}
            </div>
          ) : (
            <div
              className="text-[11px] font-black uppercase"
              style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--mute)' }}
            >
              VS
            </div>
          )}
        </div>

        {/* Away */}
        <div className="flex-1 min-w-0 text-right">
          <div
            className="font-black text-[14px] truncate"
            style={{
              fontFamily: 'Archivo Black, sans-serif',
              color: (isFinished || isLive) && a > h ? 'var(--paper)' : '#9E9E9E',
            }}
          >
            {fixture.away_team}
          </div>
        </div>
      </div>

      {/* Prediction buttons or result */}
      <div
        className="px-3 pb-3"
      >
        {isFinished ? (
          /* Result feedback */
          <div
            className="flex items-center justify-center gap-2 py-1.5 rounded text-[10px] font-black uppercase tracking-widest"
            style={{
              background: result === 'correct' ? 'rgba(24,201,107,0.1)' : result === 'wrong' ? 'rgba(240,58,58,0.08)' : 'transparent',
              color: result === 'correct' ? 'var(--positive)' : result === 'wrong' ? 'var(--danger)' : 'var(--mute)',
              fontFamily: 'Archivo Black, sans-serif',
            }}
          >
            {result === 'correct' && <span>✓ Correct — {prediction === 'home' ? fixture.home_team : prediction === 'away' ? fixture.away_team : 'Draw'}</span>}
            {result === 'wrong' && <span>✗ Wrong — picked {prediction === 'home' ? fixture.home_team : prediction === 'away' ? fixture.away_team : 'Draw'}</span>}
            {!prediction && <span>No prediction</span>}
          </div>
        ) : (
          /* Prediction buttons */
          <div className="flex gap-1.5">
            {[
              { key: 'home',  label: fixture.home_team.split(' ').pop() },
              { key: 'draw',  label: 'Draw' },
              { key: 'away',  label: fixture.away_team.split(' ').pop() },
            ].map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => onPredict(fixture.id, key)}
                disabled={isLive}
                className="flex-1 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-all"
                style={{
                  fontFamily: 'Archivo Black, sans-serif',
                  background: prediction === key
                    ? isLive ? 'rgba(255,193,7,0.15)' : 'rgba(0,196,232,0.15)'
                    : 'rgba(255,255,255,0.04)',
                  color: prediction === key
                    ? isLive ? '#FFC107' : 'var(--cyan)'
                    : '#555',
                  border: prediction === key
                    ? isLive ? '1px solid rgba(255,193,7,0.3)' : '1px solid rgba(0,196,232,0.3)'
                    : '1px solid transparent',
                  cursor: isLive ? 'not-allowed' : 'pointer',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Main screen ──────────────────────────────────────────────────────────── */
export default function BracketScreen() {
  const navigate = useNavigate();

  const [fixtures,    setFixtures]    = useState([]);
  const [loading,     setLoading]     = useState(true); // true = show skeleton until first fetch resolves
  const [predictions, setPredictions] = useState(() => {
    try { return JSON.parse(localStorage.getItem('forzakit_predictions') ?? '{}'); }
    catch { return {}; }
  });

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('fixtures')
      .select('id,home_team,away_team,status,minute,kickoff_at,home_score,away_score,competition')
      .order('kickoff_at', { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setFixtures(data?.length ? data : FALLBACK_FIXTURES);
      })
      .catch(() => { if (!cancelled) setFixtures(FALLBACK_FIXTURES); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handlePredict = (fixtureId, pick) => {
    const next = { ...predictions, [fixtureId]: pick };
    setPredictions(next);
    localStorage.setItem('forzakit_predictions', JSON.stringify(next));
  };

  /* ── Group by gameweek ──────────────────────────────────────────────────── */
  const grouped = fixtures.reduce((acc, f) => {
    const gw = f.competition ?? 'Other';
    if (!acc[gw]) acc[gw] = [];
    acc[gw].push(f);
    return acc;
  }, {});

  /* ── Score totals ───────────────────────────────────────────────────────── */
  const finished = fixtures.filter(f => f.status === 'finished');
  const predicted = finished.filter(f => predictions[f.id]);
  const correct = predicted.filter(f => getPredictionResult(f, predictions[f.id]) === 'correct');
  const accuracy = predicted.length ? Math.round((correct.length / predicted.length) * 100) : null;

  return (
    <div className="min-h-screen bg-[#0A0A0A]" data-testid="main-content" style={{ paddingBottom: '80px' }}>

      {/* Header */}
      <div
        className="sticky top-0 z-20 px-4 pt-10 pb-4"
        style={{
          background: 'rgba(10,10,10,0.95)',
          backdropFilter: 'blur(20px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-[#9E9E9E] text-[20px] leading-none"
          >
            ←
          </button>
          <div className="text-center">
            <div
              className="text-[9px] font-black uppercase tracking-[0.35em]"
              style={{ color: '#9E9E9E', fontFamily: 'Archivo Black, sans-serif' }}
            >
              Fixture Challenge
            </div>
            <div
              className="text-[20px] font-black uppercase leading-tight tracking-wider"
              style={{ fontFamily: 'Archivo Black, sans-serif', color: 'var(--paper)' }}
            >
              FIXTURE CHALLENGE
            </div>
          </div>
          {/* Score badge */}
          <div className="text-right">
            <div
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
            >
              Accuracy
            </div>
            <div
              className="text-[18px] font-black tabular-nums leading-tight"
              style={{ fontFamily: 'Archivo Black, sans-serif', color: accuracy !== null ? 'var(--cyan)' : 'var(--mute)' }}
            >
              {accuracy !== null ? `${accuracy}%` : '—'}
            </div>
          </div>
        </div>

        {/* Score summary strip */}
        {predicted.length > 0 && (
          <div
            className="mt-3 flex items-center justify-center gap-4 text-[10px] font-bold"
            style={{ fontFamily: 'Archivo Black, sans-serif' }}
          >
            <span style={{ color: 'var(--positive)' }}>✓ {correct.length} correct</span>
            <span style={{ color: 'var(--mute)' }}>·</span>
            <span style={{ color: 'var(--danger)' }}>✗ {predicted.length - correct.length} wrong</span>
            <span style={{ color: 'var(--mute)' }}>·</span>
            <span style={{ color: '#555' }}>{finished.length - predicted.length} unpredicted</span>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="px-4 py-3">
        <p
          className="text-[11px] leading-relaxed text-center"
          style={{ color: '#555', fontFamily: 'Archivo, sans-serif' }}
        >
          Pick a result for each fixture before kick-off. Locked once the match goes live.
        </p>
      </div>

      {/* Fixture groups */}
      {loading ? (
        <div className="flex flex-col gap-3 px-4 mt-2">
          {[1,2,3].map(i => (
            <div key={i} className="h-[110px] rounded-lg bg-[#111] animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-6 mt-2">
          {Object.entries(grouped).map(([gw, gwFixtures]) => (
            <div key={gw}>
              {/* GW label */}
              <div
                className="text-[9px] font-black uppercase tracking-[0.25em] mb-2"
                style={{ color: 'var(--mute)', fontFamily: 'Archivo Black, sans-serif' }}
              >
                {gw}
              </div>
              <div className="flex flex-col gap-2">
                {gwFixtures.map(f => (
                  <FixtureCard
                    key={f.id}
                    fixture={f}
                    prediction={predictions[f.id] ?? null}
                    onPredict={handlePredict}
                  />
                ))}
              </div>
            </div>
          ))}

          {fixtures.length === 0 && (
            <div className="text-center py-16">
              <div className="text-3xl mb-3">📅</div>
              <div
                className="text-[13px] font-bold"
                style={{ color: '#555', fontFamily: 'Archivo Black, sans-serif' }}
              >
                No fixtures scheduled yet
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
