import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const FUNCTIONS_URL = 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1';
const ANON_KEY = 'sb_publishable_IQF1vJEiydutRmDa6XgDUA_FHTlWX0b';

async function callFunction(name, body) {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ANON_KEY}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

function StatusBadge({ status }) {
  const colours = {
    finished: 'text-positive border-positive/30 bg-positive/10',
    live:     'text-[#FFB300] border-[#FFB300]/30 bg-[#FFB300]/10',
    scheduled:'text-text-secondary border-border bg-transparent',
  };
  return (
    <span className={`text-[9px] font-black uppercase tracking-widest border px-1.5 py-0.5 rounded-sm ${colours[status] ?? colours.scheduled}`}>
      {status}
    </span>
  );
}

function Log({ entries }) {
  if (!entries.length) return null;
  return (
    <div className="mt-3 font-mono text-[10px] leading-relaxed border border-border bg-bg p-3 max-h-40 overflow-y-auto">
      {entries.map((e, i) => (
        <div key={i} className={e.ok === false ? 'text-negative' : 'text-positive'}>{e.msg}</div>
      ))}
    </div>
  );
}

// ─── Sync Panel ──────────────────────────────────────────────────────────────
function SyncPanel() {
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(null);

  const run = async (fn, label, body = {}) => {
    setBusy(fn);
    setLog(l => [...l, { msg: `→ ${label}…`, ok: true }]);
    try {
      const r = await callFunction(fn, body);
      setLog(l => [...l, { msg: JSON.stringify(r), ok: !r.error }]);
    } catch (e) {
      setLog(l => [...l, { msg: e.message, ok: false }]);
    } finally {
      setBusy(null);
    }
  };

  const btns = [
    { fn: 'sync-fixtures',      label: 'Sync Fixtures',      body: { forza_id: '426' } },
    { fn: 'sync-players',       label: 'Sync Players',        body: { forza_id: '426' } },
    { fn: 'sync-player-status', label: 'Sync Player Status',  body: { forza_id: '426' } },
  ];

  return (
    <Section title="Sync Controls" sub="Pull latest data from the Forza API">
      <div className="flex flex-col gap-2">
        {btns.map(b => (
          <button key={b.fn} disabled={!!busy}
            onClick={() => run(b.fn, b.label, b.body)}
            className="w-full bg-surface border border-border text-white font-black py-3 uppercase tracking-widest text-xs disabled:opacity-40 hover:border-white/40 transition-colors">
            {busy === b.fn ? 'Running…' : b.label}
          </button>
        ))}
      </div>
      <Log entries={log} />
    </Section>
  );
}

// ─── Fixture Ingestion Panel ─────────────────────────────────────────────────
function IngestionPanel() {
  const [fixtures, setFixtures] = useState([]);
  const [round, setRound] = useState('34');
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    supabase.from('fixtures')
      .select('id, home_team, away_team, status, forza_match_id, round_number, kickoff_at, scores')
      .eq('tournament_id', '426')
      .order('round_number', { ascending: true })
      .order('kickoff_at', { ascending: true })
      .then(({ data }) => setFixtures(data ?? []));
  }, []);

  const rounds = [...new Set(fixtures.map(f => f.round_number))].sort((a, b) => a - b);
  const shown  = round === 'all' ? fixtures : fixtures.filter(f => String(f.round_number) === round);

  const ingest = async (f) => {
    if (!f.forza_match_id) return setLog(l => [...l, { msg: `${f.home_team} — no forza_match_id`, ok: false }]);
    setBusy(`ingest-${f.id}`);
    setLog(l => [...l, { msg: `→ Ingesting ${f.home_team} vs ${f.away_team}…`, ok: true }]);
    try {
      const r = await callFunction('ingest-match-events', { forza_match_id: f.forza_match_id });
      setLog(l => [...l, { msg: JSON.stringify(r), ok: !r.error }]);
      // Refresh fixture list
      const { data } = await supabase.from('fixtures')
        .select('id,home_team,away_team,status,forza_match_id,round_number,kickoff_at,scores')
        .eq('tournament_id','426').order('round_number').order('kickoff_at');
      setFixtures(data ?? []);
    } catch (e) {
      setLog(l => [...l, { msg: e.message, ok: false }]);
    } finally {
      setBusy(null);
    }
  };

  const score = async (f) => {
    setBusy(`score-${f.id}`);
    setLog(l => [...l, { msg: `→ Scoring ${f.home_team} vs ${f.away_team}…`, ok: true }]);
    try {
      const r = await callFunction('calculate-scores', { fixture_id: f.id });
      setLog(l => [...l, { msg: JSON.stringify(r), ok: !r.error }]);
    } catch (e) {
      setLog(l => [...l, { msg: e.message, ok: false }]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="Match Ingestion" sub="Fetch Forza data and calculate scores per fixture">
      {/* Round filter */}
      <div className="flex gap-1 flex-wrap mb-3">
        {['all', ...rounds.map(String)].map(r => (
          <button key={r} onClick={() => setRound(r)}
            className={`text-[9px] font-black uppercase px-2 py-1 border tracking-widest transition-colors
              ${round === r ? 'bg-white text-black border-white' : 'bg-transparent text-text-secondary border-border hover:border-white/30'}`}>
            {r === 'all' ? 'All' : `R${r}`}
          </button>
        ))}
      </div>

      {/* Fixture rows */}
      <div className="flex flex-col gap-1">
        {shown.map(f => {
          const scoreStr = f.scores ? `${f.scores.home}–${f.scores.away}` : null;
          return (
            <div key={f.id} className="flex items-center gap-2 border border-border p-2 bg-bg">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">
                  {f.home_team} <span className="text-text-secondary font-normal">vs</span> {f.away_team}
                  {scoreStr && <span className="ml-2 text-positive font-black">{scoreStr}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge status={f.status} />
                  <span className="text-[9px] text-text-secondary">R{f.round_number}</span>
                  {f.forza_match_id && <span className="text-[9px] text-text-secondary font-mono">{f.forza_match_id}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  disabled={!!busy || !f.forza_match_id}
                  onClick={() => ingest(f)}
                  className="text-[9px] font-black uppercase px-2 py-1.5 border border-border bg-surface hover:border-white/40 disabled:opacity-40 tracking-wider whitespace-nowrap">
                  {busy === `ingest-${f.id}` ? '…' : 'Ingest'}
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => score(f)}
                  className="text-[9px] font-black uppercase px-2 py-1.5 border border-positive/40 text-positive bg-positive/10 hover:bg-positive/20 disabled:opacity-40 tracking-wider whitespace-nowrap">
                  {busy === `score-${f.id}` ? '…' : 'Score'}
                </button>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="text-xs text-text-secondary text-center py-4">No fixtures for round {round}</p>}
      </div>
      <Log entries={log} />
    </Section>
  );
}

// ─── Manual Event Editor ─────────────────────────────────────────────────────
function EventEditor() {
  const [fixtures, setFixtures] = useState([]);
  const [selectedFixture, setSelectedFixture] = useState('');
  const [events, setEvents] = useState([]);
  const [players, setPlayers] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ player_id: '', type: 'goal', minute: '', team: '' });
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from('fixtures')
      .select('id, home_team, away_team, round_number, status')
      .eq('tournament_id', '426')
      .order('round_number').order('home_team')
      .then(({ data }) => setFixtures(data ?? []));
  }, []);

  const loadEvents = useCallback(async (fid) => {
    if (!fid) return;
    const { data } = await supabase.from('match_events')
      .select('id, type, minute, team, player_id, players(name)')
      .eq('fixture_id', fid)
      .order('minute');
    setEvents(data ?? []);
  }, []);

  useEffect(() => { loadEvents(selectedFixture); }, [selectedFixture, loadEvents]);

  useEffect(() => {
    if (!search || search.length < 2) { setPlayers([]); return; }
    supabase.from('players').select('id, name, club, position')
      .ilike('name', `%${search}%`).eq('tournament_id', '426').limit(8)
      .then(({ data }) => setPlayers(data ?? []));
  }, [search]);

  const fx = fixtures.find(f => f.id === selectedFixture);

  const addEvent = async () => {
    if (!selectedFixture || !form.type || !form.minute) return;
    setBusy(true); setStatus('');
    const { error } = await supabase.from('match_events').insert({
      fixture_id: selectedFixture,
      type:       form.type,
      player_id:  form.player_id || null,
      minute:     form.minute,
      team:       form.team || null,
    });
    if (error) setStatus('Error: ' + error.message);
    else { setStatus('Event added'); setForm(f => ({ ...f, player_id: '', minute: '', team: '' })); setSearch(''); }
    await loadEvents(selectedFixture);
    setBusy(false);
  };

  const deleteEvent = async (id) => {
    await supabase.from('match_events').delete().eq('id', id);
    await loadEvents(selectedFixture);
  };

  const EVENT_TYPES = ['goal', 'assist', 'yellow', 'red', 'sub', 'var', 'penalty_saved', 'penalty_missed', 'own_goal'];

  return (
    <Section title="Manual Event Editor" sub="Add or remove events on any fixture — triggers scoring on save">
      {/* Fixture selector */}
      <select
        value={selectedFixture}
        onChange={e => setSelectedFixture(e.target.value)}
        className="w-full bg-bg border border-border text-white text-xs py-2 px-3 mb-3 font-mono">
        <option value="">— Select fixture —</option>
        {fixtures.map(f => (
          <option key={f.id} value={f.id}>
            R{f.round_number} · {f.home_team} vs {f.away_team} [{f.status}]
          </option>
        ))}
      </select>

      {selectedFixture && (
        <>
          {/* Existing events */}
          <div className="mb-4">
            <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary mb-2">
              Events ({events.length})
            </p>
            {events.length === 0 && <p className="text-xs text-text-secondary">No events yet</p>}
            <div className="flex flex-col gap-1">
              {events.map(ev => (
                <div key={ev.id} className="flex items-center gap-2 border border-border p-2 bg-bg text-xs">
                  <span className="font-mono text-text-secondary w-6 text-right shrink-0">{ev.minute}'</span>
                  <span className={`text-[9px] font-black uppercase px-1.5 border rounded-sm shrink-0 ${
                    ev.type === 'goal'   ? 'text-positive border-positive/30' :
                    ev.type === 'red'    ? 'text-negative border-negative/30' :
                    ev.type === 'yellow' ? 'text-[#FFB300] border-[#FFB300]/30' :
                    ev.type === 'var'    ? 'text-[#FFB300] border-[#FFB300]/30' :
                    'text-text-secondary border-border'
                  }`}>{ev.type}</span>
                  <span className="flex-1 truncate">{ev.players?.name ?? '—'}</span>
                  <span className="text-text-secondary text-[9px] shrink-0">{ev.team}</span>
                  <button onClick={() => deleteEvent(ev.id)}
                    className="text-negative text-[9px] font-black border border-negative/30 px-1.5 py-0.5 hover:bg-negative/10 shrink-0">
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Add event form */}
          <div className="border border-border p-3 bg-bg/50">
            <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary mb-3">Add Event</p>
            <div className="flex flex-col gap-2">
              {/* Player search */}
              <input
                placeholder="Search player…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="bg-bg border border-border text-white text-xs py-2 px-3 w-full" />
              {players.length > 0 && (
                <div className="border border-border bg-bg divide-y divide-border">
                  {players.map(p => (
                    <button key={p.id}
                      onClick={() => { setForm(f => ({ ...f, player_id: p.id, team: p.club })); setSearch(p.name); setPlayers([]); }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-surface">
                      <span className="font-bold">{p.name}</span>
                      <span className="text-text-secondary ml-2 text-[10px]">{p.club} · {p.position}</span>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="flex-1 bg-bg border border-border text-white text-xs py-2 px-2">
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="Min" value={form.minute}
                  onChange={e => setForm(f => ({ ...f, minute: e.target.value }))}
                  className="w-16 bg-bg border border-border text-white text-xs py-2 px-2 text-center" />
                <input placeholder="Team" value={form.team}
                  onChange={e => setForm(f => ({ ...f, team: e.target.value }))}
                  className="flex-1 bg-bg border border-border text-white text-xs py-2 px-2" />
              </div>

              <button onClick={addEvent} disabled={busy || !form.minute}
                className="w-full bg-white text-black font-black py-2.5 uppercase tracking-widest text-xs disabled:opacity-40">
                {busy ? 'Adding…' : 'Add Event'}
              </button>
            </div>
          </div>

          {/* Recalculate after editing */}
          <button
            onClick={async () => {
              setBusy(true); setStatus('Recalculating…');
              const r = await callFunction('calculate-scores', { fixture_id: selectedFixture });
              setStatus(r.ok ? `Done — ${r.player_stats ?? 0} players scored` : ('Error: ' + r.error));
              setBusy(false);
            }}
            disabled={busy}
            className="mt-2 w-full border border-positive/40 text-positive bg-positive/10 font-black py-2.5 uppercase tracking-widest text-xs disabled:opacity-40 hover:bg-positive/20">
            Recalculate Scores
          </button>

          {status && (
            <div className="mt-2 p-3 bg-bg border border-border text-[10px] font-mono text-positive text-center">{status}</div>
          )}
        </>
      )}
    </Section>
  );
}

// ─── Stats Override Panel ────────────────────────────────────────────────────
function StatsOverride() {
  const [fixtures, setFixtures] = useState([]);
  const [selectedFixture, setSelectedFixture] = useState('');
  const [stats, setStats] = useState([]);
  const [editRow, setEditRow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    supabase.from('fixtures')
      .select('id, home_team, away_team, round_number')
      .eq('tournament_id', '426').order('round_number').order('home_team')
      .then(({ data }) => setFixtures(data ?? []));
  }, []);

  const loadStats = useCallback(async (fid) => {
    if (!fid) return;
    const { data } = await supabase.from('player_match_stats')
      .select('*, players(name, position, club)')
      .eq('fixture_id', fid)
      .gt('minutes_played', 0)
      .order('fantasy_points', { ascending: false });
    setStats(data ?? []);
  }, []);

  useEffect(() => { loadStats(selectedFixture); }, [selectedFixture, loadStats]);

  const save = async () => {
    if (!editRow) return;
    setBusy(true); setStatus('');
    const { error } = await supabase.from('player_match_stats').update({
      goals:          Number(editRow.goals),
      assists:        Number(editRow.assists),
      minutes_played: Number(editRow.minutes_played),
      yellow_cards:   Number(editRow.yellow_cards),
      red_cards:      Number(editRow.red_cards),
      clean_sheet:    editRow.clean_sheet,
      goals_conceded: Number(editRow.goals_conceded),
      own_goals:      Number(editRow.own_goals),
      penalty_saved:  Number(editRow.penalty_saved),
      penalty_missed: Number(editRow.penalty_missed),
      penalty_scored: Number(editRow.penalty_scored),
      tackles_won:    Number(editRow.tackles_won),
      interceptions:  Number(editRow.interceptions),
    }).eq('id', editRow.id);
    if (error) setStatus('Error: ' + error.message);
    else { setStatus('Saved — recalculate to update points'); setEditRow(null); }
    await loadStats(selectedFixture);
    setBusy(false);
  };

  const NUM_FIELDS = [
    ['goals','Goals'],['assists','Assists'],['minutes_played','Mins'],
    ['yellow_cards','Yellow'],['red_cards','Red'],['own_goals','OG'],
    ['penalty_saved','Pen Saved'],['penalty_missed','Pen Missed'],['penalty_scored','Pen Scored'],
    ['goals_conceded','Goals Con.'],['tackles_won','Tackles'],['interceptions','Ints'],
  ];

  return (
    <Section title="Stats Override" sub="Edit individual player stats for a fixture, then recalculate">
      <select value={selectedFixture} onChange={e => { setSelectedFixture(e.target.value); setEditRow(null); }}
        className="w-full bg-bg border border-border text-white text-xs py-2 px-3 mb-3 font-mono">
        <option value="">— Select fixture —</option>
        {fixtures.map(f => (
          <option key={f.id} value={f.id}>R{f.round_number} · {f.home_team} vs {f.away_team}</option>
        ))}
      </select>

      {editRow && (
        <div className="border border-[#FFB300]/40 bg-[#1a1100] p-3 mb-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-black uppercase">{editRow.players?.name}</p>
            <button onClick={() => setEditRow(null)} className="text-text-secondary text-xs">✕ Cancel</button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {NUM_FIELDS.map(([k, label]) => (
              <label key={k} className="flex flex-col gap-0.5">
                <span className="text-[9px] text-text-secondary uppercase tracking-widest">{label}</span>
                <input type="number" value={editRow[k] ?? 0}
                  onChange={e => setEditRow(r => ({ ...r, [k]: e.target.value }))}
                  className="bg-bg border border-border text-white text-xs py-1 px-2 w-full" />
              </label>
            ))}
            <label className="flex flex-col gap-0.5 col-span-3">
              <span className="text-[9px] text-text-secondary uppercase tracking-widest">Clean Sheet</span>
              <select value={editRow.clean_sheet ? 'true' : 'false'}
                onChange={e => setEditRow(r => ({ ...r, clean_sheet: e.target.value === 'true' }))}
                className="bg-bg border border-border text-white text-xs py-1 px-2">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>
          <button onClick={save} disabled={busy}
            className="w-full bg-[#FFB300] text-black font-black py-2.5 uppercase tracking-widest text-xs disabled:opacity-40">
            {busy ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      )}

      {selectedFixture && !editRow && (
        <div className="flex flex-col gap-1">
          {stats.map(s => (
            <div key={s.id} className="flex items-center gap-2 border border-border p-2 bg-bg">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{s.players?.name}</div>
                <div className="text-[9px] text-text-secondary">
                  {s.players?.club} · {s.players?.position} · {s.minutes_played}' ·{' '}
                  {s.goals}G {s.assists}A · <span className="text-positive font-bold">{Number(s.fantasy_points).toFixed(1)}pts</span>
                </div>
              </div>
              <button onClick={() => setEditRow({ ...s })}
                className="text-[9px] font-black uppercase px-2 py-1 border border-[#FFB300]/40 text-[#FFB300] hover:bg-[#FFB300]/10 shrink-0">
                Edit
              </button>
            </div>
          ))}
          {stats.length === 0 && <p className="text-xs text-text-secondary text-center py-4">No stats yet — ingest first</p>}
        </div>
      )}

      {selectedFixture && (
        <button
          onClick={async () => {
            setBusy(true); setStatus('Recalculating…');
            const r = await callFunction('calculate-scores', { fixture_id: selectedFixture });
            setStatus(r.ok ? `Done — ${r.player_stats ?? 0} players scored (${r.source})` : ('Error: ' + r.error));
            await loadStats(selectedFixture);
            setBusy(false);
          }}
          disabled={busy}
          className="mt-2 w-full border border-positive/40 text-positive bg-positive/10 font-black py-2.5 uppercase tracking-widest text-xs disabled:opacity-40 hover:bg-positive/20">
          Recalculate Scores
        </button>
      )}

      {status && (
        <div className="mt-2 p-3 bg-bg border border-border text-[10px] font-mono text-positive text-center">{status}</div>
      )}
    </Section>
  );
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, sub, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-border mb-3">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left bg-surface hover:bg-surface/80">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest">{title}</h2>
          {sub && <p className="text-[10px] text-text-secondary mt-0.5">{sub}</p>}
        </div>
        <span className="text-text-secondary text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4 border-t border-border">{children}</div>}
    </div>
  );
}

// ─── Root ────────────────────────────────────────────────────────────────────
export default function AdminSeedScreen() {
  return (
    <div className="min-h-screen bg-bg p-4 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-black uppercase tracking-widest">League Admin</h1>
        <p className="text-xs text-text-secondary mt-1">Commissioner tools — manage ingestion, events, and scoring</p>
      </div>
      <SyncPanel />
      <IngestionPanel />
      <EventEditor />
      <StatsOverride />
    </div>
  );
}
