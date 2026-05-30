/**
 * League Admin Panel
 *
 * Competition-agnostic commissioner dashboard. All data derives from
 * whichever league the signed-in user selects (leagues they created or
 * where they hold the 'commissioner' role). No tournament IDs are
 * hardcoded — the panel adapts to whatever competition that league runs on.
 *
 * Sections (all collapsible):
 *   1. League Controls   — toggles, dry-run flag, draft deadline
 *   2. Matchday Deadlines — view / edit squad-lock windows
 *   3. Data Sync         — pull latest fixtures / players / availability from API
 *   4. Match Ingestion   — per-fixture ingest + score buttons
 *   5. Event Editor      — add / remove match events (overrides)
 *   6. Stats Override    — edit individual player stats, force recalculate
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase, FUNCTIONS_BASE } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

// ─── Edge Function caller ─────────────────────────────────────────────────────
const FUNCTIONS_URL = FUNCTIONS_BASE
  ?? 'https://sssmvihxtqtohisghjet.supabase.co/functions/v1';

async function callFunction(name, body) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Not authenticated — sign in to use admin functions');
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Function ${name} returned ${res.status}`);
  return res.json();
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const map = {
    finished:  'text-positive border-positive/30 bg-positive/10',
    live:      'text-[#FFB300] border-[#FFB300]/30 bg-[#FFB300]/10',
    scheduled: 'text-text-secondary border-border bg-transparent',
  };
  return (
    <span className={`text-[9px] font-black uppercase tracking-widest border px-1.5 py-0.5 rounded-sm ${map[status] ?? map.scheduled}`}>
      {status}
    </span>
  );
}

function Toggle({ label, sub, value, onChange, disabled }) {
  return (
    <button
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`flex items-center justify-between w-full p-3 border transition-colors
        ${value ? 'border-positive/40 bg-positive/5' : 'border-border bg-transparent'}
        disabled:opacity-40`}
    >
      <div className="text-left">
        <p className="text-xs font-black uppercase tracking-widest">{label}</p>
        {sub && <p className="text-[10px] text-text-secondary mt-0.5">{sub}</p>}
      </div>
      <div className={`w-10 h-5 rounded-full relative transition-colors shrink-0 ml-4
        ${value ? 'bg-positive' : 'bg-border'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all
          ${value ? 'left-[22px]' : 'left-0.5'}`} />
      </div>
    </button>
  );
}

function ActionLog({ entries }) {
  if (!entries.length) return null;
  return (
    <div className="mt-3 font-mono text-[10px] leading-relaxed border border-border bg-bg p-3 max-h-48 overflow-y-auto">
      {entries.map((e, i) => (
        <div key={i} className={e.ok === false ? 'text-negative' : 'text-positive'}>{e.msg}</div>
      ))}
    </div>
  );
}

function Section({ title, sub, badge, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border mb-2">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 text-left bg-surface hover:bg-surface/80 transition-colors">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black uppercase tracking-widest">{title}</h2>
            {badge && (
              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 border border-[#FFB300]/40 text-[#FFB300] bg-[#FFB300]/10 rounded-sm">
                {badge}
              </span>
            )}
          </div>
          {sub && <p className="text-[10px] text-text-secondary mt-0.5">{sub}</p>}
        </div>
        <span className="text-text-secondary text-xs shrink-0 ml-4">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="p-4 border-t border-border">{children}</div>}
    </div>
  );
}

// ─── 1. League Controls ───────────────────────────────────────────────────────

function LeagueControls({ league, tournament, onRefresh }) {
  const [saving, setSaving] = useState(null);
  const [deadline, setDeadline] = useState(
    league.draft_deadline ? league.draft_deadline.slice(0, 16) : ''
  );

  const updateLeague = async (patch) => {
    setSaving(Object.keys(patch)[0]);
    await supabase.from('leagues').update(patch).eq('id', league.id);
    await onRefresh();
    setSaving(null);
  };

  const updateTournament = async (patch) => {
    setSaving(Object.keys(patch)[0]);
    await supabase.from('tournaments').update(patch).eq('forza_id', league.tournament_id);
    await onRefresh();
    setSaving(null);
  };

  const saveDeadline = async () => {
    if (!deadline) return;
    await updateLeague({ draft_deadline: new Date(deadline).toISOString() });
  };

  return (
    <Section title="League Controls" sub="Toggles and settings for this league" defaultOpen>
      <div className="flex flex-col gap-2">
        <Toggle
          label="Transfers Open"
          sub="Allow managers to buy / sell players"
          value={!!league.transfers_open}
          onChange={v => updateLeague({ transfers_open: v })}
          disabled={saving === 'transfers_open'}
        />
        <Toggle
          label="Dry Run Mode"
          sub="No real stakes — safe for testing the full flow"
          value={!!league.is_dry_run}
          onChange={v => updateLeague({ is_dry_run: v })}
          disabled={saving === 'is_dry_run'}
        />
        {tournament && (
          <Toggle
            label="Data Sync Enabled"
            sub="Allow Edge Functions to pull live data from the API"
            value={!!tournament.sync_enabled}
            onChange={v => updateTournament({ sync_enabled: v })}
            disabled={saving === 'sync_enabled'}
          />
        )}

        {/* Draft deadline */}
        <div className="border border-border p-3 mt-1">
          <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary mb-2">Draft Deadline</p>
          <div className="flex gap-2">
            <input type="datetime-local" value={deadline}
              onChange={e => setDeadline(e.target.value)}
              className="flex-1 bg-bg border border-border text-white text-xs py-2 px-3" />
            <button onClick={saveDeadline} disabled={!!saving || !deadline}
              className="text-xs font-black uppercase px-4 py-2 bg-white text-black disabled:opacity-40">
              Save
            </button>
          </div>
          {league.draft_deadline && (
            <p className="text-[10px] text-text-secondary mt-1">
              Current: {new Date(league.draft_deadline).toLocaleString()}
            </p>
          )}
        </div>

        {/* Info pills */}
        <div className="flex flex-wrap gap-1 mt-1">
          {[
            ['Format', league.format],
            ['Max members', league.max_members],
            ['Join code', league.join_code ?? '—'],
            ['Tournament', league.tournament_id ?? 'none'],
          ].map(([k, v]) => (
            <span key={k} className="text-[9px] border border-border px-2 py-1 text-text-secondary font-mono">
              {k}: <span className="text-white font-black">{v}</span>
            </span>
          ))}
        </div>
      </div>
    </Section>
  );
}

// ─── 2. Matchday Deadlines ────────────────────────────────────────────────────

function MatchdayDeadlines({ tournamentId }) {
  const [deadlines, setDeadlines] = useState([]);
  const [editing, setEditing]   = useState(null);
  const [busy, setBusy]         = useState(false);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    const { data } = await supabase.from('matchday_deadlines')
      .select('*').eq('tournament_id', tournamentId).order('deadline_at');
    setDeadlines(data ?? []);
  }, [tournamentId]);

  useEffect(() => { load(); }, [load]);

  const save = async (row) => {
    setBusy(true);
    await supabase.from('matchday_deadlines').update({
      deadline_at: new Date(row.deadline_at).toISOString(),
      unlocks_at:  row.unlocks_at ? new Date(row.unlocks_at).toISOString() : null,
    }).eq('id', row.id);
    setEditing(null);
    await load();
    setBusy(false);
  };

  if (!tournamentId) return <p className="text-xs text-text-secondary">No tournament linked to this league.</p>;

  return (
    <Section title="Matchday Deadlines" sub="Squad lock / unlock windows per round">
      {deadlines.length === 0 && <p className="text-xs text-text-secondary">No deadlines configured.</p>}
      <div className="flex flex-col gap-1">
        {deadlines.map(d => {
          const isEdit = editing?.id === d.id;
          const now    = new Date();
          const locked = new Date(d.deadline_at) < now && (!d.unlocks_at || new Date(d.unlocks_at) > now);
          return (
            <div key={d.id} className={`border p-3 ${locked ? 'border-[#FFB300]/40 bg-[#FFB300]/5' : 'border-border bg-bg'}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black font-mono">{d.matchday_id}</span>
                  {locked && <span className="fk-mono text-[9px] uppercase" style={{ color: 'var(--gold)' }}>LOCKED</span>}
                </div>
                <button onClick={() => setEditing(isEdit ? null : { ...d, deadline_at: d.deadline_at?.slice(0,16), unlocks_at: d.unlocks_at?.slice(0,16) ?? '' })}
                  className="text-[9px] font-black uppercase px-2 py-1 border border-border hover:border-white/40">
                  {isEdit ? 'Cancel' : 'Edit'}
                </button>
              </div>
              {isEdit ? (
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] text-text-secondary uppercase">Deadline (lock squads)</span>
                    <input type="datetime-local" value={editing.deadline_at ?? ''}
                      onChange={e => setEditing(r => ({ ...r, deadline_at: e.target.value }))}
                      className="bg-bg border border-border text-white text-xs py-1.5 px-2" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[9px] text-text-secondary uppercase">Unlocks at (open transfers)</span>
                    <input type="datetime-local" value={editing.unlocks_at ?? ''}
                      onChange={e => setEditing(r => ({ ...r, unlocks_at: e.target.value }))}
                      className="bg-bg border border-border text-white text-xs py-1.5 px-2" />
                  </label>
                  <button onClick={() => save(editing)} disabled={busy}
                    className="bg-white text-black font-black py-2 uppercase tracking-widest text-xs disabled:opacity-40">
                    Save
                  </button>
                </div>
              ) : (
                <div className="text-[10px] text-text-secondary space-y-0.5">
                  <div>Lock: <span className="text-white">{d.deadline_at ? new Date(d.deadline_at).toLocaleString() : '—'}</span></div>
                  <div>Unlock: <span className="text-white">{d.unlocks_at ? new Date(d.unlocks_at).toLocaleString() : '—'}</span></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── 3. Data Sync ─────────────────────────────────────────────────────────────

function DataSync({ forzaId }) {
  const [log, setLog]   = useState([]);
  const [busy, setBusy] = useState(null);

  const run = async (fn, label) => {
    if (!forzaId) return;
    setBusy(fn);
    setLog(l => [...l, { msg: `→ ${label}…`, ok: true }]);
    try {
      const r = await callFunction(fn, { forza_id: forzaId });
      setLog(l => [...l, { msg: JSON.stringify(r), ok: !r.error }]);
    } catch (e) {
      setLog(l => [...l, { msg: e.message, ok: false }]);
    } finally { setBusy(null); }
  };

  const actions = [
    { fn: 'sync-fixtures',      label: 'Sync Fixtures',      sub: 'Pull latest match schedule from API' },
    { fn: 'sync-players',       label: 'Sync Players',        sub: 'Update squad rosters for all teams' },
    { fn: 'sync-player-status', label: 'Sync Player Status',  sub: 'Refresh injury / availability data' },
  ];

  if (!forzaId) return <p className="text-xs text-text-secondary">No tournament linked — cannot sync.</p>;

  return (
    <Section title="Data Sync" sub={`Pull live data from the API (tournament ${forzaId})`}>
      <div className="flex flex-col gap-2">
        {actions.map(a => (
          <button key={a.fn} disabled={!!busy} onClick={() => run(a.fn, a.label)}
            className="w-full flex items-center justify-between p-3 border border-border bg-surface hover:border-white/30 disabled:opacity-40 transition-colors text-left">
            <div>
              <p className="text-xs font-black uppercase tracking-widest">{a.label}</p>
              <p className="text-[10px] text-text-secondary mt-0.5">{a.sub}</p>
            </div>
            <span className="text-text-secondary text-xs shrink-0 ml-4">
              {busy === a.fn ? '⏳' : '→'}
            </span>
          </button>
        ))}
      </div>
      <ActionLog entries={log} />
    </Section>
  );
}

// ─── 4. Match Ingestion ───────────────────────────────────────────────────────

function MatchIngestion({ tournamentId }) {
  const [fixtures, setFixtures] = useState([]);
  const [round, setRound]       = useState('all');
  const [log, setLog]           = useState([]);
  const [busy, setBusy]         = useState(null);

  const loadFixtures = useCallback(async () => {
    if (!tournamentId) return;
    const { data } = await supabase.from('fixtures')
      .select('id, home_team, away_team, status, forza_match_id, round_number, kickoff_at, scores')
      .eq('tournament_id', tournamentId)
      .order('round_number').order('kickoff_at');
    setFixtures(data ?? []);
  }, [tournamentId]);

  useEffect(() => { loadFixtures(); }, [loadFixtures]);

  const rounds = [...new Set(fixtures.map(f => f.round_number).filter(Boolean))].sort((a, b) => a - b);
  const shown  = round === 'all' ? fixtures : fixtures.filter(f => String(f.round_number) === round);

  const act = async (label, fn) => {
    setBusy(label);
    setLog(l => [...l, { msg: `→ ${label}`, ok: true }]);
    try {
      const r = await fn();
      setLog(l => [...l, { msg: JSON.stringify(r), ok: !r.error }]);
      await loadFixtures();
    } catch (e) {
      setLog(l => [...l, { msg: e.message, ok: false }]);
    } finally { setBusy(null); }
  };

  if (!tournamentId) return <p className="text-xs text-text-secondary">No tournament linked.</p>;

  return (
    <Section title="Match Ingestion" sub="Fetch Forza data and calculate scores per fixture">
      {/* Round pills */}
      <div className="flex gap-1 flex-wrap mb-3">
        {['all', ...rounds.map(String)].map(r => (
          <button key={r} onClick={() => setRound(r)}
            className={`text-[9px] font-black uppercase px-2.5 py-1 border tracking-widest transition-colors
              ${round === r ? 'bg-white text-black border-white' : 'bg-transparent text-text-secondary border-border hover:border-white/30'}`}>
            {r === 'all' ? 'All' : `R${r}`}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1">
        {shown.map(f => {
          const scoreStr = f.scores ? `${f.scores.home}–${f.scores.away}` : null;
          return (
            <div key={f.id} className="flex items-center gap-2 border border-border p-2.5 bg-bg">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">
                  {f.home_team} <span className="text-text-secondary font-normal">vs</span> {f.away_team}
                  {scoreStr && <span className="ml-2 text-positive font-black">{scoreStr}</span>}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge status={f.status} />
                  {f.round_number && <span className="text-[9px] text-text-secondary">R{f.round_number}</span>}
                  {f.forza_match_id && (
                    <span className="text-[9px] text-text-secondary font-mono">{f.forza_match_id}</span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  disabled={!!busy || !f.forza_match_id}
                  onClick={() => act(`Ingest ${f.forza_match_id}`, () => callFunction('ingest-match-events', { forza_match_id: f.forza_match_id }))}
                  className="text-[9px] font-black uppercase px-2 py-1.5 border border-border bg-surface hover:border-white/40 disabled:opacity-40 tracking-wider">
                  {busy === `Ingest ${f.forza_match_id}` ? '…' : 'Ingest'}
                </button>
                <button
                  disabled={!!busy}
                  onClick={() => act(`Score ${f.id}`, () => callFunction('calculate-scores', { fixture_id: f.id }))}
                  className="text-[9px] font-black uppercase px-2 py-1.5 border border-positive/40 text-positive bg-positive/10 hover:bg-positive/20 disabled:opacity-40 tracking-wider">
                  {busy === `Score ${f.id}` ? '…' : 'Score'}
                </button>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && (
          <p className="text-xs text-text-secondary text-center py-6">No fixtures found for this selection.</p>
        )}
      </div>
      <ActionLog entries={log} />
    </Section>
  );
}

// ─── 5. Event Editor ──────────────────────────────────────────────────────────

const EVENT_TYPES = ['goal','assist','yellow','red','sub','var','penalty_saved','penalty_missed','own_goal'];

function EventEditor({ tournamentId }) {
  const [fixtures, setFixtures] = useState([]);
  const [fid, setFid]           = useState('');
  const [events, setEvents]     = useState([]);
  const [players, setPlayers]   = useState([]);
  const [search, setSearch]     = useState('');
  const [form, setForm]         = useState({ player_id: '', type: 'goal', minute: '', team: '' });
  const [status, setStatus]     = useState('');
  const [busy, setBusy]         = useState(false);

  useEffect(() => {
    if (!tournamentId) return;
    supabase.from('fixtures')
      .select('id, home_team, away_team, round_number, status')
      .eq('tournament_id', tournamentId).order('round_number').order('home_team')
      .then(({ data }) => setFixtures(data ?? []));
  }, [tournamentId]);

  const loadEvents = useCallback(async (id) => {
    if (!id) return;
    const { data } = await supabase.from('match_events')
      .select('id, type, minute, team, player_id, players(name)')
      .eq('fixture_id', id).order('minute');
    setEvents(data ?? []);
  }, []);

  useEffect(() => { loadEvents(fid); }, [fid, loadEvents]);

  useEffect(() => {
    if (search.length < 2) { setPlayers([]); return; }
    supabase.from('players').select('id, name, club, position')
      .ilike('name', `%${search}%`).eq('tournament_id', tournamentId).limit(8)
      .then(({ data }) => setPlayers(data ?? []));
  }, [search, tournamentId]);

  const addEvent = async () => {
    if (!fid || !form.type || !form.minute) return;
    setBusy(true); setStatus('');
    const { error } = await supabase.from('match_events').insert({
      fixture_id: fid, type: form.type,
      player_id: form.player_id || null,
      minute: form.minute, team: form.team || null,
    });
    if (error) setStatus('Error: ' + error.message);
    else { setStatus('Event added.'); setForm(f => ({ ...f, player_id: '', minute: '' })); setSearch(''); }
    await loadEvents(fid);
    setBusy(false);
  };

  const deleteEvent = async (id) => {
    await supabase.from('match_events').delete().eq('id', id);
    await loadEvents(fid);
  };

  const recalculate = async () => {
    setBusy(true); setStatus('Recalculating…');
    const r = await callFunction('calculate-scores', { fixture_id: fid });
    setStatus(r.ok ? `Done — ${r.player_stats ?? 0} players scored` : `Error: ${r.error}`);
    setBusy(false);
  };

  if (!tournamentId) return <p className="text-xs text-text-secondary">No tournament linked.</p>;

  return (
    <Section title="Event Editor" sub="Add or remove match events — use to correct data or simulate">
      <select value={fid} onChange={e => { setFid(e.target.value); setStatus(''); }}
        className="w-full bg-bg border border-border text-white text-xs py-2 px-3 mb-3 font-mono">
        <option value="">— Select a fixture —</option>
        {fixtures.map(f => (
          <option key={f.id} value={f.id}>
            R{f.round_number} · {f.home_team} vs {f.away_team} [{f.status}]
          </option>
        ))}
      </select>

      {fid && (
        <>
          {/* Current events */}
          <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary mb-2">
            Events ({events.length})
          </p>
          {events.length === 0 && (
            <p className="text-xs text-text-secondary mb-3">No events yet for this fixture.</p>
          )}
          <div className="flex flex-col gap-1 mb-4">
            {events.map(ev => (
              <div key={ev.id} className="flex items-center gap-2 border border-border p-2 bg-bg text-xs">
                <span className="font-mono text-text-secondary w-7 text-right shrink-0">{ev.minute}'</span>
                <span className={`text-[9px] font-black uppercase px-1.5 border rounded-sm shrink-0 ${
                  ev.type === 'goal'   ? 'text-positive border-positive/30' :
                  ev.type === 'red'    ? 'text-negative border-negative/30' :
                  ev.type === 'yellow' ? 'text-[#FFB300] border-[#FFB300]/30' :
                  ev.type === 'var'    ? 'text-[#FFB300] border-[#FFB300]/30' :
                  'text-text-secondary border-border'}`}>{ev.type}</span>
                <span className="flex-1 truncate">{ev.players?.name ?? <span className="text-text-secondary italic">no player</span>}</span>
                <span className="text-text-secondary text-[9px] shrink-0 truncate max-w-[80px]">{ev.team}</span>
                <button onClick={() => deleteEvent(ev.id)}
                  className="text-negative text-[9px] font-black border border-negative/30 px-1.5 py-0.5 hover:bg-negative/10 shrink-0">✕</button>
              </div>
            ))}
          </div>

          {/* Add form */}
          <div className="border border-border p-3 bg-bg/50 mb-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary mb-3">Add Event</p>
            <div className="flex flex-col gap-2">
              <div className="relative">
                <input placeholder="Search player by name…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full bg-bg border border-border text-white text-xs py-2 px-3" />
                {players.length > 0 && (
                  <div className="absolute z-10 w-full border border-border bg-surface divide-y divide-border shadow-xl">
                    {players.map(p => (
                      <button key={p.id}
                        onClick={() => {
                          setForm(f => ({ ...f, player_id: p.id, team: p.club }));
                          setSearch(p.name); setPlayers([]);
                        }}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-bg transition-colors">
                        <span className="font-bold">{p.name}</span>
                        <span className="text-text-secondary ml-2 text-[10px]">{p.club} · {p.position}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="flex-1 bg-bg border border-border text-white text-xs py-2 px-2">
                  {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input placeholder="Min" value={form.minute}
                  onChange={e => setForm(f => ({ ...f, minute: e.target.value }))}
                  className="w-16 bg-bg border border-border text-white text-xs py-2 px-2 text-center" />
                <input placeholder="Team name" value={form.team}
                  onChange={e => setForm(f => ({ ...f, team: e.target.value }))}
                  className="flex-1 bg-bg border border-border text-white text-xs py-2 px-2" />
              </div>
              <button onClick={addEvent} disabled={busy || !form.minute}
                className="w-full bg-white text-black font-black py-2.5 uppercase tracking-widest text-xs disabled:opacity-40">
                {busy ? 'Adding…' : 'Add Event'}
              </button>
            </div>
          </div>

          <button onClick={recalculate} disabled={busy}
            className="w-full border border-positive/40 text-positive bg-positive/10 font-black py-2.5 uppercase tracking-widest text-xs disabled:opacity-40 hover:bg-positive/20">
            Recalculate Scores for This Fixture
          </button>

          {status && (
            <div className="mt-2 p-3 bg-bg border border-border text-[10px] font-mono text-positive text-center">
              {status}
            </div>
          )}
        </>
      )}
    </Section>
  );
}

// ─── 6. Stats Override ────────────────────────────────────────────────────────

const NUM_FIELDS = [
  ['goals','Goals'], ['assists','Assists'], ['minutes_played','Mins'],
  ['yellow_cards','Yellow'], ['red_cards','Red'], ['own_goals','OG'],
  ['penalty_saved','Pen Saved'], ['penalty_missed','Pen Miss'], ['penalty_scored','Pen Scored'],
  ['goals_conceded','Con.'], ['tackles_won','Tackles'], ['interceptions','Ints'],
];

function StatsOverride({ tournamentId }) {
  const [fixtures, setFixtures] = useState([]);
  const [fid, setFid]           = useState('');
  const [stats, setStats]       = useState([]);
  const [editRow, setEditRow]   = useState(null);
  const [busy, setBusy]         = useState(false);
  const [status, setStatus]     = useState('');

  useEffect(() => {
    if (!tournamentId) return;
    supabase.from('fixtures')
      .select('id, home_team, away_team, round_number')
      .eq('tournament_id', tournamentId).order('round_number').order('home_team')
      .then(({ data }) => setFixtures(data ?? []));
  }, [tournamentId]);

  const loadStats = useCallback(async (id) => {
    if (!id) return;
    const { data } = await supabase.from('player_match_stats')
      .select('*, players(name, position, club)')
      .eq('fixture_id', id).gt('minutes_played', 0)
      .order('fantasy_points', { ascending: false });
    setStats(data ?? []);
  }, []);

  useEffect(() => { loadStats(fid); }, [fid, loadStats]);

  const save = async () => {
    if (!editRow) return;
    setBusy(true); setStatus('');
    const patch = {};
    NUM_FIELDS.forEach(([k]) => { patch[k] = Number(editRow[k] ?? 0); });
    patch.clean_sheet = editRow.clean_sheet;
    const { error } = await supabase.from('player_match_stats').update(patch).eq('id', editRow.id);
    if (error) setStatus('Error: ' + error.message);
    else { setStatus('Saved — hit Recalculate to update points.'); setEditRow(null); }
    await loadStats(fid);
    setBusy(false);
  };

  const recalculate = async () => {
    if (!fid) return;
    setBusy(true); setStatus('Recalculating…');
    const r = await callFunction('calculate-scores', { fixture_id: fid });
    setStatus(r.ok ? `Done — ${r.player_stats ?? 0} players scored (${r.source})` : `Error: ${r.error}`);
    await loadStats(fid);
    setBusy(false);
  };

  if (!tournamentId) return <p className="text-xs text-text-secondary">No tournament linked.</p>;

  return (
    <Section title="Stats Override" sub="Edit individual player stats then force a recalculation">
      <select value={fid} onChange={e => { setFid(e.target.value); setEditRow(null); setStatus(''); }}
        className="w-full bg-bg border border-border text-white text-xs py-2 px-3 mb-3 font-mono">
        <option value="">— Select a fixture —</option>
        {fixtures.map(f => (
          <option key={f.id} value={f.id}>R{f.round_number} · {f.home_team} vs {f.away_team}</option>
        ))}
      </select>

      {/* Edit form */}
      {editRow && (
        <div className="border border-[#FFB300]/40 bg-[#1a1100] p-3 mb-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-xs font-black">{editRow.players?.name}</p>
              <p className="text-[10px] text-text-secondary">{editRow.players?.club} · {editRow.players?.position}</p>
            </div>
            <button onClick={() => setEditRow(null)} className="text-text-secondary text-xs px-2 py-1 border border-border">✕ Cancel</button>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {NUM_FIELDS.map(([k, label]) => (
              <label key={k} className="flex flex-col gap-0.5">
                <span className="text-[9px] text-text-secondary uppercase tracking-widest">{label}</span>
                <input type="number" min="0" value={editRow[k] ?? 0}
                  onChange={e => setEditRow(r => ({ ...r, [k]: e.target.value }))}
                  className="bg-bg border border-border text-white text-xs py-1 px-2 w-full" />
              </label>
            ))}
            <label className="flex flex-col gap-0.5 col-span-3">
              <span className="text-[9px] text-text-secondary uppercase tracking-widest">Clean Sheet</span>
              <select value={editRow.clean_sheet ? 'true' : 'false'}
                onChange={e => setEditRow(r => ({ ...r, clean_sheet: e.target.value === 'true' }))}
                className="bg-bg border border-border text-white text-xs py-1.5 px-2">
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

      {/* Player list */}
      {fid && !editRow && (
        <>
          {stats.length === 0 && <p className="text-xs text-text-secondary text-center py-4">No stats yet — ingest first.</p>}
          <div className="flex flex-col gap-1 mb-2">
            {stats.map(s => (
              <div key={s.id} className="flex items-center gap-2 border border-border p-2.5 bg-bg">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{s.players?.name}</div>
                  <div className="text-[9px] text-text-secondary mt-0.5">
                    {s.players?.club} · {s.players?.position} · {s.minutes_played}' ·{' '}
                    {s.goals}G {s.assists}A ·{' '}
                    <span className="text-positive font-bold">{Number(s.fantasy_points).toFixed(1)} pts</span>
                  </div>
                </div>
                <button onClick={() => setEditRow({ ...s })}
                  className="text-[9px] font-black uppercase px-2 py-1.5 border border-[#FFB300]/40 text-[#FFB300] hover:bg-[#FFB300]/10 shrink-0">
                  Edit
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {fid && (
        <button onClick={recalculate} disabled={busy}
          className="w-full border border-positive/40 text-positive bg-positive/10 font-black py-2.5 uppercase tracking-widest text-xs disabled:opacity-40 hover:bg-positive/20">
          Recalculate Scores
        </button>
      )}

      {status && (
        <div className="mt-2 p-3 bg-bg border border-border text-[10px] font-mono text-positive text-center">{status}</div>
      )}
    </Section>
  );
}

// ─── Scoring Rules Editor ────────────────────────────────────────────────────
// Loads scoring_rules rows for the tournament and lets the commissioner edit
// per-position multipliers inline. Saves back to DB on Save.

const SCORING_POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const UNIVERSAL_FIELDS  = ['minute_per_90', 'own_goal', 'yellow_card', 'red_card', 'penalty_missed'];
const POSITION_FIELDS   = ['goal', 'assist', 'clean_sheet', 'conceded_per_goal', 'penalty_saved', 'tackle', 'interception', 'penalty_scored'];

const FIELD_LABEL = {
  goal: 'Goal', assist: 'Assist', clean_sheet: 'Clean sheet',
  conceded_per_goal: 'Per goal conceded (GK)', penalty_saved: 'Penalty saved',
  tackle: 'Tackle won', interception: 'Interception', penalty_scored: 'Penalty scored',
  minute_per_90: 'Per 90 min played', own_goal: 'Own goal',
  yellow_card: 'Yellow card', red_card: 'Red card', penalty_missed: 'Penalty missed',
};

function ScoringRulesEditor({ tournamentId }) {
  const [rules,   setRules]   = useState({});   // { GK: {...}, DEF: {...}, ..., UNIVERSAL: {...} }
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [status,  setStatus]  = useState('');

  useEffect(() => {
    if (!tournamentId) return;
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('scoring_rules')
        .select('position, rules')
        .eq('tournament_id', tournamentId);

      const map = {};
      for (const row of data ?? []) map[row.position] = { ...row.rules };
      setRules(map);
      setLoading(false);
    };
    load();
  }, [tournamentId]);

  const setField = (pos, field, val) => {
    setRules(prev => ({
      ...prev,
      [pos]: { ...prev[pos], [field]: val === '' ? '' : Number(val) },
    }));
  };

  const save = async () => {
    setSaving(true);
    setStatus('');
    const upserts = Object.entries(rules).map(([position, r]) => ({
      tournament_id: tournamentId,
      position,
      rules: r,
    }));
    const { error } = await supabase
      .from('scoring_rules')
      .upsert(upserts, { onConflict: 'tournament_id,position' });
    setSaving(false);
    setStatus(error ? `Error: ${error.message}` : '✓ Scoring rules saved');
  };

  if (loading) return <p className="text-xs text-text-secondary">Loading scoring rules…</p>;

  return (
    <Section title="Scoring Rules" sub="Edit per-position point multipliers. Changes take effect on the next Score run.">
      {/* Universal row */}
      <div className="mb-4">
        <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary mb-2">Universal (all positions)</p>
        <div className="grid grid-cols-2 gap-2">
          {UNIVERSAL_FIELDS.map(f => (
            <label key={f} className="flex flex-col gap-0.5">
              <span className="text-[9px] text-text-secondary">{FIELD_LABEL[f] ?? f}</span>
              <input
                type="number" step="0.25"
                value={rules['UNIVERSAL']?.[f] ?? ''}
                onChange={e => setField('UNIVERSAL', f, e.target.value)}
                className="border border-border bg-bg text-xs px-2 py-1.5 w-full font-mono"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Per-position grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SCORING_POSITIONS.map(pos => (
          <div key={pos} className="border border-border p-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary mb-2">{pos}</p>
            <div className="flex flex-col gap-1.5">
              {POSITION_FIELDS.map(f => (
                <label key={f} className="flex items-center justify-between gap-2">
                  <span className="text-[9px] text-text-secondary flex-1 truncate">{FIELD_LABEL[f] ?? f}</span>
                  <input
                    type="number" step="0.25"
                    value={rules[pos]?.[f] ?? ''}
                    onChange={e => setField(pos, f, e.target.value)}
                    className="border border-border bg-bg text-xs px-2 py-1 w-16 font-mono text-right"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={save} disabled={saving}
        className="mt-4 w-full border border-positive/40 text-positive bg-positive/10 font-black py-2.5 uppercase tracking-widest text-xs disabled:opacity-40 hover:bg-positive/20"
      >
        {saving ? 'Saving…' : 'Save Scoring Rules'}
      </button>
      {status && (
        <p className={`mt-2 text-xs font-mono text-center ${status.startsWith('Error') ? 'text-negative' : 'text-positive'}`}>
          {status}
        </p>
      )}
    </Section>
  );
}

// ─── 7. Observability (O5) ───────────────────────────────────────────────────

function ObservabilityPanel() {
  const [edgeLogs, setEdgeLogs]   = useState([]);
  const [clientLogs, setClientLogs] = useState([]);
  const [cronJobs, setCronJobs]   = useState([]);
  const [loading, setLoading]     = useState(false);
  const [since, setSince]         = useState('24h');

  const load = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - (since === '1h' ? 3600_000 : since === '24h' ? 86400_000 : 7 * 86400_000)).toISOString();

    const [{ data: edge }, { data: client }, { data: cron }] = await Promise.all([
      supabase.from('edge_function_errors')
        .select('function, severity, message, context, created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('client_errors')
        .select('url, message, user_id, created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.rpc('get_cron_status'),
    ]);

    setEdgeLogs(edge ?? []);
    setClientLogs(client ?? []);
    setCronJobs(cron ?? []);
    setLoading(false);
  }, [since]);

  // Auto-load on mount
  useEffect(() => { load(); }, [load]);

  const fmt = (ts) => ts ? new Date(ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '—';
  const fmtRelative = (ts) => {
    if (!ts) return 'never';
    const diffMs = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 2)  return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)  return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };
  const sevColor = { warning: 'text-[#FFB300]', error: 'text-negative', critical: 'text-negative font-black' };

  const failedCount = cronJobs.filter(j => j.status === 'failed').length;
  const cronSummary = cronJobs.length === 0
    ? null
    : failedCount === 0
      ? `All ${cronJobs.length} jobs healthy ✓`
      : `${failedCount} job${failedCount > 1 ? 's' : ''} FAILING`;

  return (
    <Section title="Error Monitor" sub="Edge function errors · client crashes · cron health" badge="O5">
      <div className="flex items-center gap-2 mb-4">
        {['1h', '24h', '7d'].map(t => (
          <button key={t} onClick={() => setSince(t)}
            className={`text-[9px] font-black uppercase px-2 py-1 border transition-colors ${since === t ? 'border-cyan text-cyan' : 'border-border text-text-secondary'}`}>
            {t}
          </button>
        ))}
        <button onClick={load} disabled={loading}
          className="ml-auto text-[9px] font-black uppercase px-2 py-1 border border-border text-text-secondary hover:border-white/40 disabled:opacity-40">
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Panel C — Cron jobs (shown first — most actionable at pilot time) */}
      <div className="flex items-center justify-between mb-1">
        <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary">Cron Jobs</p>
        {cronSummary && (
          <span className={`text-[9px] font-black uppercase ${failedCount > 0 ? 'text-negative' : 'text-positive'}`}>
            {cronSummary}
          </span>
        )}
      </div>
      {cronJobs.length === 0 && !loading ? (
        <p className="text-[10px] text-text-secondary mb-4">Loading…</p>
      ) : (
        <div className="mb-6 flex flex-col gap-1 max-h-72 overflow-y-auto">
          {cronJobs.map((j) => {
            const ok = j.status === 'succeeded';
            const hasRun = !!j.last_run;
            return (
              <div key={j.jobname} className={`font-mono text-[10px] border p-2 flex items-start gap-2 ${ok ? 'border-border bg-bg' : 'border-negative/40 bg-negative/5'}`}>
                <span className={`mt-0.5 shrink-0 w-2 h-2 rounded-full ${!hasRun ? 'bg-text-secondary' : ok ? 'bg-positive' : 'bg-negative'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-black">{j.jobname}</span>
                    <span className="text-text-secondary">{j.schedule}</span>
                    {!hasRun && <span className="text-text-secondary italic">never run</span>}
                  </div>
                  {hasRun && (
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className={ok ? 'text-positive' : 'text-negative'}>{j.status}</span>
                      <span className="text-text-secondary">{fmtRelative(j.last_run)}</span>
                      <span className="text-text-secondary truncate max-w-[180px]" title={j.message}>{j.message}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Panel A — Edge function errors */}
      <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary mb-1">Edge Function Errors</p>
      {edgeLogs.length === 0 ? (
        <p className="text-[10px] text-positive mb-4">No errors in this window ✓</p>
      ) : (
        <div className="mb-4 flex flex-col gap-1 max-h-48 overflow-y-auto">
          {edgeLogs.map((r, i) => (
            <div key={i} className="font-mono text-[10px] border border-border bg-bg p-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-text-secondary">{fmt(r.created_at)}</span>
                <span className="text-white font-black">{r.function}</span>
                <span className={sevColor[r.severity] ?? 'text-text-secondary'}>{r.severity}</span>
              </div>
              <p className="text-text-secondary mt-0.5 break-all">{r.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Panel B — Client errors */}
      <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary mb-1">Client Errors</p>
      {clientLogs.length === 0 ? (
        <p className="text-[10px] text-positive mb-4">No client errors in this window ✓</p>
      ) : (
        <div className="mb-4 flex flex-col gap-1 max-h-48 overflow-y-auto">
          {clientLogs.map((r, i) => (
            <div key={i} className="font-mono text-[10px] border border-border bg-bg p-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-text-secondary">{fmt(r.created_at)}</span>
                <span className="text-text-secondary break-all">{r.url}</span>
              </div>
              <p className="text-white mt-0.5 break-all">{r.message}</p>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function AdminSeedScreen() {
  const { user } = useAuth();
  const [myLeagues, setMyLeagues]       = useState([]);
  const [selectedId, setSelectedId]     = useState('');
  const [league, setLeague]             = useState(null);
  const [tournament, setTournament]     = useState(null);
  const [loading, setLoading]           = useState(true);

  // Load leagues where this user is creator or commissioner
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      // Leagues created by user
      const { data: created } = await supabase.from('leagues')
        .select('id, name, format, tournament_id, is_dry_run, transfers_open, draft_deadline, join_code, max_members, cup_phase')
        .eq('created_by', user.id);

      // Leagues where user is commissioner member
      const { data: memberships } = await supabase.from('league_members')
        .select('league_id')
        .eq('user_id', user.id)
        .eq('role', 'commissioner');

      const commissionerIds = (memberships ?? []).map(m => m.league_id);
      let commissionerLeagues = [];
      if (commissionerIds.length > 0) {
        const { data } = await supabase.from('leagues')
          .select('id, name, format, tournament_id, is_dry_run, transfers_open, draft_deadline, join_code, max_members, cup_phase')
          .in('id', commissionerIds);
        commissionerLeagues = data ?? [];
      }

      // Merge, deduplicate
      const all = [...(created ?? []), ...commissionerLeagues];
      const unique = all.filter((l, i, arr) => arr.findIndex(x => x.id === l.id) === i);
      setMyLeagues(unique);
      if (unique.length === 1) setSelectedId(unique[0].id);
      setLoading(false);
    };
    load();
  }, [user]);

  // Load selected league + its tournament
  const loadLeague = useCallback(async (id) => {
    if (!id) { setLeague(null); setTournament(null); return; }
    const { data: l } = await supabase.from('leagues')
      .select('id, name, format, tournament_id, is_dry_run, transfers_open, draft_deadline, join_code, max_members, cup_phase')
      .eq('id', id).single();
    setLeague(l ?? null);

    if (l?.tournament_id) {
      const { data: t } = await supabase.from('tournaments')
        .select('id, forza_id, name, sync_enabled, status, environment')
        .eq('forza_id', l.tournament_id).maybeSingle();
      setTournament(t ?? null);
    } else {
      setTournament(null);
    }
  }, []);

  useEffect(() => { loadLeague(selectedId); }, [selectedId, loadLeague]);

  if (!user) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <p className="text-text-secondary text-sm">Sign in to access league admin.</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg p-4 max-w-2xl mx-auto pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-black uppercase tracking-widest">League Admin</h1>
        <p className="text-xs text-text-secondary mt-1">Commissioner tools — manage settings, ingestion, and scoring overrides</p>
      </div>

      {/* League selector */}
      <div className="border border-border p-4 mb-4 bg-surface">
        <p className="text-[9px] font-black uppercase tracking-widest text-text-secondary mb-2">Your Leagues</p>
        {loading ? (
          <p className="text-xs text-text-secondary">Loading…</p>
        ) : myLeagues.length === 0 ? (
          <p className="text-xs text-text-secondary">You haven't created or been assigned a commissioner role in any league yet.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {myLeagues.map(l => (
              <button key={l.id} onClick={() => setSelectedId(l.id)}
                className={`w-full flex items-center justify-between p-3 border text-left transition-colors
                  ${selectedId === l.id ? 'border-white bg-white/5' : 'border-border bg-transparent hover:border-white/30'}`}>
                <div>
                  <p className="text-sm font-black">{l.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-text-secondary uppercase">{l.format}</span>
                    {l.tournament_id && <span className="text-[9px] text-text-secondary font-mono">· {l.tournament_id}</span>}
                    {l.is_dry_run && <span className="text-[9px] text-[#FFB300] font-black uppercase">dry run</span>}
                  </div>
                </div>
                {selectedId === l.id && <span className="text-positive font-black text-xs">✓</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tournament context banner */}
      {league && (
        <div className="border border-border bg-bg px-4 py-2.5 mb-4 flex items-center gap-3 flex-wrap">
          {tournament ? (
            <>
              <span className="text-[10px] text-text-secondary">Tournament:</span>
              <span className="text-xs font-black">{tournament.name}</span>
              <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 border rounded-sm ${
                tournament.sync_enabled ? 'text-positive border-positive/30 bg-positive/10' : 'text-text-secondary border-border'}`}>
                {tournament.sync_enabled ? 'sync on' : 'sync off'}
              </span>
              {tournament.environment && (
                <span className="text-[9px] text-text-secondary border border-border px-1.5 py-0.5 rounded-sm">
                  {tournament.environment}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-text-secondary italic">
              {league.tournament_id ? `Tournament "${league.tournament_id}" not found in DB` : 'No tournament linked to this league'}
            </span>
          )}
        </div>
      )}

      {/* Panels — only shown once a league is selected */}
      {league ? (
        <>
          <LeagueControls league={league} tournament={tournament} onRefresh={() => loadLeague(selectedId)} />
          <MatchdayDeadlines tournamentId={league.tournament_id} />
          <ScoringRulesEditor tournamentId={league.tournament_id} />
          <DataSync forzaId={league.tournament_id} />
          <MatchIngestion tournamentId={league.tournament_id} />
          <EventEditor tournamentId={league.tournament_id} />
          <StatsOverride tournamentId={league.tournament_id} />
        </>
      ) : !loading && myLeagues.length > 0 && (
        <p className="text-xs text-text-secondary text-center py-8">Select a league above to see controls.</p>
      )}

      {/* Observability panel — always visible, not league-gated */}
      <ObservabilityPanel />
    </div>
  );
}
